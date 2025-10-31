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