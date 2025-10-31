(() => {
  const BANNER_ID = 'focuscoach-banner';
  const BANNER_HEIGHT = 44; // px
  let timerInterval = null;
  let endAtTs = null;
  let analyzing = false;
  let lmSession = null;
  let lmReady = false;
  let sessionEnded = false;

  function getBanner() {
    return document.getElementById(BANNER_ID);
  }

  function removeBanner() {
    const el = getBanner();
    if (el && el.parentNode) el.parentNode.removeChild(el);
    try {
      document.documentElement.style.removeProperty('--focuscoach-banner-height');
      document.body.style.setProperty('margin-top', null);
    } catch {}
    stopTimer();
  }

  function createOrUpdateBanner(goalText) {
    if (!goalText || sessionStorage.getItem('focuscoach_hide_this_page') === '1') {
      removeBanner();
      return;
    }

    let el = getBanner();
    if (!el) {
      el = document.createElement('div');
      el.id = BANNER_ID;
      el.setAttribute('role', 'status');
      el.style.cssText = [
        'position:fixed',
        'top:0',
        'left:0',
        'right:0',
        'z-index:2147483647',
        'background:linear-gradient(90deg,#111,#2b2b2b)',
        'color:#fff',
        'font:600 13px/1.4 -apple-system,BlinkMacSystemFont,Segoe UI,Roboto,Helvetica,Arial,sans-serif',
        'padding:10px 12px',
        'display:flex',
        'align-items:center',
        'gap:10px',
        'box-shadow:0 2px 8px rgba(0,0,0,.25)'
      ].join(';');

      const dot = document.createElement('span');
      dot.style.cssText = 'width:8px;height:8px;border-radius:50%;background:#4ade80;display:inline-block;';

      const text = document.createElement('div');
      text.style.cssText = 'flex:1 1 auto;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;';
      text.className = 'focuscoach-text';

      const timer = document.createElement('span');
      timer.className = 'focuscoach-timer';
      timer.style.cssText = 'font-weight:600;opacity:.9';

      const close = document.createElement('button');
      close.textContent = 'Hide';
      close.ariaLabel = 'Hide goal banner for this page';
      close.style.cssText = 'background:#3f3f46;color:#fff;border:0;border-radius:4px;padding:6px 10px;cursor:pointer';
      close.addEventListener('click', (e) => {
        e.preventDefault();
        sessionStorage.setItem('focuscoach_hide_this_page', '1');
        removeBanner();
      });

      el.appendChild(dot);
      el.appendChild(text);
      el.appendChild(timer);
      el.appendChild(close);
      document.documentElement.appendChild(el);

      // Push content down slightly to avoid overlap
      try {
        document.documentElement.style.setProperty('--focuscoach-banner-height', BANNER_HEIGHT + 'px');
        if (getComputedStyle(document.body).marginTop === '0px') {
          document.body.style.marginTop = BANNER_HEIGHT + 'px';
        }
      } catch {}
    }

    const t = el.querySelector('.focuscoach-text');
    if (t) t.textContent = `Goal: ${goalText}`;
    // Ensure timer display updates
    updateTimerDisplay();
  }

  function formatRemaining(ms) {
    if (ms <= 0) return '00:00';
    const total = Math.floor(ms / 1000);
    const m = Math.floor(total / 60);
    const s = total % 60;
    const mm = String(m).padStart(2, '0');
    const ss = String(s).padStart(2, '0');
    return `${mm}:${ss}`;
  }

  function updateTimerDisplay() {
    const el = getBanner();
    if (!el) return;
    const timerEl = el.querySelector('.focuscoach-timer');
    if (!timerEl) return;
    if (!endAtTs) { timerEl.textContent = ''; return; }
    const remaining = endAtTs - Date.now();
    
    if (remaining <= 0) {
      timerEl.textContent = '⏳ 00:00';
      if (!sessionEnded) {
        sessionEnded = true;
        // Turn off Focus Mode in storage
        try {
          chrome.storage.sync.set({ focusMode: false, focusEndAt: null });
        } catch {}
        // Remove UI immediately
        stopTimer();
        removeBanner();
      }
      return;
    }
    
    timerEl.textContent = `⏳ ${formatRemaining(remaining)}`;
  }

  function stopTimer() {
    if (timerInterval) {
      clearInterval(timerInterval);
      timerInterval = null;
    }
  }

  function startTimer() {
    stopTimer();
    if (!endAtTs) return;
    sessionEnded = false; // Reset flag for new session
    updateTimerDisplay();
    timerInterval = setInterval(() => {
      updateTimerDisplay();
    }, 1000);
  }

  // Minimal helpers for direct analysis (no fallback)
  function clamp(n, min, max) { return Math.max(min, Math.min(max, n)); }
  function safeText(x) { return (x || '').toString().replace(/\s+/g, ' ').trim(); }

  async function ensureModel() {
    if (lmReady) return true;
    try {
      if (window.LanguageModel?.availability) {
        const a = await window.LanguageModel.availability();
        if (a === 'readily' || a === true) {
          lmSession = await window.LanguageModel.create({
            expectedInputs: [{ type: 'text', languages: ['en'] }],
            expectedOutputs: [{ type: 'text', languages: ['en'] }]
          });
          lmReady = true;
          return true;
        }
      }
    } catch {}
    return false;
  }

  function getPageSample(maxLen = 6000) {
    try {
      const title = document.title || '';
      const metaDesc = document.querySelector('meta[name="description"]')?.getAttribute('content') || '';
      const h1 = Array.from(document.querySelectorAll('h1')).map(n => safeText(n.textContent)).filter(Boolean).join(' \n');
      const h2 = Array.from(document.querySelectorAll('h2')).map(n => safeText(n.textContent)).filter(Boolean).join(' \n');
      const bodyText = safeText(document.body?.innerText || '');
      const combined = [
        title && `Title: ${title}`,
        metaDesc && `Description: ${metaDesc}`,
        h1 && `H1: ${h1}`,
        h2 && `H2: ${h2}`,
        bodyText && `Body: ${bodyText}`
      ].filter(Boolean).join('\n\n');
      return combined.slice(0, maxLen);
    } catch {
      return document.body?.innerText?.slice(0, maxLen) || '';
    }
  }

  function buildPagePrompt(goal, pageText) {
    const instruction = (
      'You are FocusCoach. Strictly evaluate if the page helps the user achieve their goal.\n' +
      'Rules:\n' +
      '- Be strict: most pages should be SKIP.\n' +
      '- If content is not directly helpful → Relevance=0 and Recommendation=SKIP.\n' +
      '- Only score ≥70 when it clearly advances the goal; 60–69 is borderline (SKIM).\n' +
      'Return EXACT format:\n' +
      'Summary: <1-2 lines>\nRelevance: <0-100>\nRecommendation: READ or SKIP\n'
    );
    return `${instruction}\nUser Goal: ${goal}\n\nPage Content (truncated):\n${pageText}\n\nRespond with only the three labeled lines.`;
  }

  function parsePageResult(raw) {
    const summary = raw.match(/Summary:(.*)/i)?.[1]?.trim() || '';
    const relStr = raw.match(/Relevance:([^\n]+)/i)?.[1]?.trim() || '0';
    const recommendation = (raw.match(/Recommendation:([^\n]+)/i)?.[1]?.trim() || 'SKIP').toUpperCase();
    let relevance = Number(relStr.replace(/[^0-9.]/g, ''));
    if (!Number.isFinite(relevance)) relevance = 0;
    relevance = clamp(Math.round(relevance), 0, 100);
    return { summary, relevance, recommendation };
  }

  async function analyzeCurrentPage(goal) {
    if (analyzing) return;
    if (!(await ensureModel())) return; // No fallback
    analyzing = true;
    try {
      const raw = await lmSession.prompt(buildPagePrompt(goal, getPageSample(6000)));
      const { relevance, recommendation } = parsePageResult(String(raw || ''));
      const el = document.getElementById(BANNER_ID);
      if (el) {
        const t = el.querySelector('.focuscoach-text');
        if (t) t.textContent = `Goal: ${goal} — ${recommendation} ${relevance}%`;
      }
    } catch {} finally {
      analyzing = false;
    }
  }

  function initFromStorage() {
    try {
      chrome.storage.sync.get(['userGoal', 'focusMode', 'focusEndAt', 'focusDuration'], ({ userGoal, focusMode, focusEndAt, focusDuration }) => {
        endAtTs = typeof focusEndAt === 'number' ? focusEndAt : null;

        // If focus is enabled but no end is set (or it's expired), start a session now
        if (focusMode && (!endAtTs || endAtTs <= Date.now())) {
          const mins = typeof focusDuration === 'number' ? focusDuration : 30;
          endAtTs = Date.now() + mins * 60 * 1000;
          try { chrome.storage.sync.set({ focusEndAt: endAtTs }); } catch {}
        }

        if (focusMode && userGoal) createOrUpdateBanner(userGoal); else removeBanner();
        if (focusMode && userGoal) analyzeCurrentPage(userGoal);
        if (focusMode && endAtTs) startTimer(); else stopTimer();
      });
    } catch {}
  }

  // Initialize ASAP
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initFromStorage);
  } else {
    initFromStorage();
  }

  // React to changes
  try {
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area !== 'sync') return;
  let goalChanged = false;
  let modeChanged = false;
      if (changes.userGoal) goalChanged = true;
      if (changes.focusMode) modeChanged = true;
      // autoAnalyze removed; focusMode drives both banner and auto-analysis
      const endChanged = !!changes.focusEndAt;

      if (goalChanged || modeChanged || endChanged) {
        chrome.storage.sync.get(['userGoal', 'focusMode', 'focusEndAt', 'focusDuration'], ({ userGoal, focusMode, focusEndAt, focusDuration }) => {
          endAtTs = typeof focusEndAt === 'number' ? focusEndAt : null;

          // Backfill or refresh session end if needed
          if (focusMode && (!endAtTs || endAtTs <= Date.now())) {
            const mins = typeof focusDuration === 'number' ? focusDuration : 30;
            endAtTs = Date.now() + mins * 60 * 1000;
            try { chrome.storage.sync.set({ focusEndAt: endAtTs }); } catch {}
          }

          if (focusMode && userGoal) createOrUpdateBanner(userGoal); else removeBanner();
          if (focusMode && userGoal) analyzeCurrentPage(userGoal);
          if (focusMode && endAtTs) startTimer(); else stopTimer();
        });
      }
    });
  } catch {}
})();