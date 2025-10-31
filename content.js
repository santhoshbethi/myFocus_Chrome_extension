function extractMainText() {
  const el = document.querySelector('article, main') || document.body;
  const clone = el.cloneNode(true);
  clone.querySelectorAll('script, style, nav, aside, noscript').forEach(n => n.remove());
  const text = (clone.innerText || "").replace(/\s+/g, " ").trim();
  return text.slice(0, 20000);
}

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg?.type === "GET_PAGE_TEXT") {
    sendResponse({ text: extractMainText(), url: location.href });
  }
});

// ---------------- Focus Mode Banner -----------------

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
      let autoChanged = false;
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
        });
      }
    });
  } catch {}
})();