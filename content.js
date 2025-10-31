(() => {
  const BANNER_ID = 'focuscoach-banner';
  const BANNER_HEIGHT = 44; // px
  let timerInterval = null;
  let endAtTs = null;
  let analyzing = false;
  let lmSession = null;
  let lmReady = false;

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
        // Kick off YouTube scoring on first load
        manageYouTubeScanning({ enabled: !!(focusMode && userGoal), goal: userGoal || '' });
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

          // YouTube scoring lifecycle
          manageYouTubeScanning({ enabled: !!(focusMode && userGoal), goal: userGoal || '' });
        });
      }
    });
  } catch {}

  // =========================
  // YouTube meta scoring 🔎
  // =========================
  const YT = {
    selectors: 'ytd-rich-item-renderer,ytd-video-renderer,ytd-grid-video-renderer,ytd-compact-video-renderer,ytd-reel-item-renderer',
    blurThreshold: 60 // SKIP tier: blur only < 60
  };
  let ytObserver = null;
  let ytScanning = false;
  let ytGoal = '';
  let ytScoring = false;

  function isYouTube() {
    try { return location.hostname.includes('youtube.com'); } catch { return false; }
  }

  function manageYouTubeScanning({ enabled, goal }) {
    ytGoal = goal || '';
    if (!isYouTube()) { stopYouTubeScanning(); return; }
    if (!enabled) { stopYouTubeScanning(); clearYouTubeBlurs(); return; }
    // Only run if model is available — no fallback
    ensureModel().then((ok) => {
      if (!ok) { stopYouTubeScanning(); clearYouTubeBlurs(); return; }
      startYouTubeScanning();
    });
  }

  function startYouTubeScanning() {
    if (!isYouTube()) return;
    if (!ytObserver) {
      ytObserver = new MutationObserver(() => scheduleYouTubeScan());
      ytObserver.observe(document.body, { childList: true, subtree: true });
    }
    scheduleYouTubeScan();
  }

  function stopYouTubeScanning() {
    if (ytObserver) { try { ytObserver.disconnect(); } catch {} ytObserver = null; }
    ytScanning = false;
  }

  function scheduleYouTubeScan() {
    if (ytScanning) return;
    ytScanning = true;
    queueMicrotask(async () => {
      try { await scanAndScoreYouTube(); } finally { ytScanning = false; }
    });
  }

  function extractVideoMeta(el) {
    const safe = (x) => (x || '').toString().replace(/\s+/g, ' ').trim();
    // Title
    const title = safe(
      el.querySelector('#video-title')?.textContent ||
      el.querySelector('a#video-title-link')?.textContent ||
      el.querySelector('a[href*="/watch?"]')?.getAttribute('title') ||
      el.getAttribute('aria-label')
    );
    // Channel
    const channel = safe(
      el.querySelector('#channel-name a, ytd-channel-name a, a.yt-simple-endpoint.style-scope.yt-formatted-string')?.textContent
    );
    // Metadata (views, age)
    const metaLine = Array.from(el.querySelectorAll('#metadata-line span'))
      .map(s => safe(s.textContent)).filter(Boolean).join(' • ');
    // Badges
    const badges = Array.from(el.querySelectorAll('ytd-badge-supported-renderer, .badge-style-type-live-now'))
      .map(n => safe(n.textContent)).filter(Boolean).join(', ');
    // Snippet
    const snippet = safe(
      el.querySelector('#description-text, #description, #content #description')?.textContent
    );
    // Shorts label
    const shorts = safe(el.querySelector('a[href*="/shorts/"]')?.getAttribute('aria-label'));

    const lines = [];
    if (title) lines.push(`Title: ${title}`);
    if (channel) lines.push(`Channel: ${channel}`);
    if (metaLine) lines.push(`Meta: ${metaLine}`);
    if (badges) lines.push(`Badges: ${badges}`);
    if (snippet) lines.push(`Snippet: ${snippet}`);
    if (shorts) lines.push(`Shorts: ${shorts}`);

    return {
      title,
      channel,
      metaLine,
      badges,
      snippet,
      text: lines.join('\n')
    };
  }

  function buildYTPrompt(goal, metaText) {
    return (
      'You are FocusCoach. Score how well a YouTube video matches the user goal.\n' +
      'Return ONLY: Relevance: <0-100>\n' +
      `User Goal: ${goal}\n\nVideo Meta:\n${metaText.slice(0, 800)}\n\n` +
      'Relevance: '
    );
  }

  function ensureBlurStyle() {
    if (document.getElementById('focuscoach-yt-style')) return;
    const st = document.createElement('style');
    st.id = 'focuscoach-yt-style';
    st.textContent = `
      .focuscoach-blur { filter: blur(6px) brightness(0.85); transition: filter .2s ease; }
      .focuscoach-veil { position:absolute; inset:0; display:flex; align-items:center; justify-content:center; pointer-events:auto; }
      .focuscoach-pill { background:#111c; color:#fff; border:1px solid #fff3; padding:6px 10px; border-radius:999px; font:600 12px -apple-system,BlinkMacSystemFont,Segoe UI,Roboto,Helvetica,Arial,sans-serif; cursor:pointer }
    `;
    document.documentElement.appendChild(st);
  }

  function findThumbContainer(el) {
    return el.querySelector('#thumbnail') || el.querySelector('a#thumbnail') || el;
  }

  function applyBlurWithToggle(el, score) {
    ensureBlurStyle();
    const container = findThumbContainer(el);
    if (!container) return;
    container.style.position = container.style.position || 'relative';
    container.classList.add('focuscoach-blur');

    if (container.querySelector('.focuscoach-veil')) return;
    const veil = document.createElement('div');
    veil.className = 'focuscoach-veil';
    const btn = document.createElement('button');
    btn.className = 'focuscoach-pill';
    btn.textContent = `Show (${score}%)`;
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      container.classList.remove('focuscoach-blur');
      veil.remove();
    });
    veil.appendChild(btn);
    container.appendChild(veil);
  }

  function clearBlur(el) {
    const container = findThumbContainer(el);
    if (!container) return;
    container.classList.remove('focuscoach-blur');
    const veil = container.querySelector('.focuscoach-veil');
    if (veil) veil.remove();
  }

  function clearYouTubeBlurs() {
    document.querySelectorAll('.focuscoach-blur').forEach((n) => n.classList.remove('focuscoach-blur'));
    document.querySelectorAll('.focuscoach-veil').forEach((n) => n.remove());
    document.querySelectorAll(YT.selectors).forEach(el => { delete el.dataset.focuscoachScored; delete el.dataset.focuscoachScore; });
  }

  async function scanAndScoreYouTube() {
    if (!ytGoal) return;
    if (!lmReady) return; // no fallback
    const nodes = Array.from(document.querySelectorAll(YT.selectors));
    let count = 0;
    for (const el of nodes) {
      if (el.dataset.focuscoachScored === '1') continue;
      const meta = extractVideoMeta(el);
      if (!meta.title) { el.dataset.focuscoachScored = '1'; continue; }
      // Limit per scan to avoid spamming the model
      if (count >= 8) break;
      count++;
      try {
        const raw = await lmSession.prompt(buildYTPrompt(ytGoal, meta.text));
        const match = String(raw || '').match(/Relevance:([^\n]+)/i);
        let score = Number((match?.[1] || '').replace(/[^0-9.]/g, '').trim());
        if (!Number.isFinite(score)) score = 0;
        score = clamp(Math.round(score), 0, 100);
        el.dataset.focuscoachScored = '1';
        el.dataset.focuscoachScore = String(score);
        if (score < YT.blurThreshold) applyBlurWithToggle(el, score); else clearBlur(el);
      } catch {
        // On error, mark scored to avoid loops, but do not blur
        el.dataset.focuscoachScored = '1';
      }
    }
  }
})();