(() => {
  const BANNER_ID = 'focuscoach-banner';
  const BANNER_HEIGHT = 44; // px
  const ANALYZER_SCRIPT_ID = 'focuscoach-page-analyzer';
  let timerInterval = null;
  let endAtTs = null;

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

  function injectAnalyzerOnce() {
    if (document.getElementById(ANALYZER_SCRIPT_ID)) return;
    const s = document.createElement('script');
    s.id = ANALYZER_SCRIPT_ID;
    s.src = chrome.runtime.getURL('page-analyzer.js');
    s.type = 'text/javascript';
    (document.head || document.documentElement).appendChild(s);
  }

  function requestAnalysis(goal) {
    try {
      injectAnalyzerOnce();
      window.postMessage({ type: 'FOCUSCOACH_ANALYZE', goal, maxLen: 6000 }, '*');
    } catch {}
  }

  // Receive analysis result from the page context
  window.addEventListener('message', (event) => {
    try {
      if (event.source !== window) return;
    } catch { return; }
    const data = event.data || {};
    if (data.type !== 'FOCUSCOACH_RESULT') return;
    const { summary, relevance, recommendation } = data;
    // Update banner if visible
    const el = document.getElementById(BANNER_ID);
    if (el) {
      const t = el.querySelector('.focuscoach-text');
      if (t) {
        t.textContent = `${t.textContent} — ${recommendation} ${relevance}%`;
      }
    }
  });

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
        if (focusMode && userGoal) requestAnalysis(userGoal);
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
          if (focusMode && userGoal) requestAnalysis(userGoal);
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

  function isYouTube() {
    try { return location.hostname.includes('youtube.com'); } catch { return false; }
  }

  function manageYouTubeScanning({ enabled, goal }) {
    ytGoal = goal || '';
    if (!isYouTube()) { stopYouTubeScanning(); return; }
    if (!enabled) { stopYouTubeScanning(); clearYouTubeBlurs(); return; }
    startYouTubeScanning();
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

  function heuristicScore(goal, meta) {
    const goalWords = (goal || '').toLowerCase().split(/\W+/).filter(w => w.length > 3);
    if (!goalWords.length) return 0;
    const title = (meta.title || '').toLowerCase();
    const channel = (meta.channel || '').toLowerCase();
    const snippet = (meta.snippet || '').toLowerCase();

    let pts = 0;
    let maxPts = goalWords.length * 3;
    for (const w of goalWords) {
      if (title.includes(w)) pts += 3;
      else if (channel.includes(w)) pts += 2;
      else if (snippet.includes(w)) pts += 1;
    }
    const score = Math.round((pts / Math.max(1, maxPts)) * 100);
    return Math.max(0, Math.min(100, score));
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
    const nodes = Array.from(document.querySelectorAll(YT.selectors));
    for (const el of nodes) {
      if (el.dataset.focuscoachScored === '1') continue;
      const meta = extractVideoMeta(el);
      if (!meta.title) { el.dataset.focuscoachScored = '1'; continue; }
      const score = heuristicScore(ytGoal, meta);
      el.dataset.focuscoachScored = '1';
      el.dataset.focuscoachScore = String(score);
      if (score < YT.blurThreshold) applyBlurWithToggle(el, score); else clearBlur(el);
    }
  }
})();