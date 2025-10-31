// DOM elements
const goalInput = document.getElementById("goal");
const statusEl = document.getElementById("status");
const summaryEl = document.getElementById("summary");
const relevanceEl = document.getElementById("relevance");
const focusToggle = document.getElementById("focusMode");
const focusDurationEl = document.getElementById("focusDuration");


// Auto-save goal (debounced)
let saveTimer;
goalInput.addEventListener('input', () => {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    const goal = goalInput.value.trim();
    chrome.storage.sync.set({ userGoal: goal }, () => {
      statusEl.textContent = goal ? "✅ Goal saved" : "";
      setTimeout(() => (statusEl.textContent = ""), 1000);
    });
  }, 300);
});

// Load saved goal and toggles when popup opens
chrome.storage.sync.get(["userGoal", "focusMode", "focusEndAt", "focusDuration"], async (res) => {
  if (res.userGoal) goalInput.value = res.userGoal;
  if (typeof res.focusMode === 'boolean') focusToggle.checked = res.focusMode;
  if (typeof res.focusDuration === 'number') focusDurationEl.value = String(res.focusDuration);

  // If focus mode is on and goal exists, automatically analyze current page
  if (focusToggle.checked && goalInput.value.trim()) {
    try { await analyzePage(); } catch {}
  }
});

// Toggle focus mode (also enables global auto-analyze behavior)
focusToggle.addEventListener('change', async () => {
  const goal = goalInput.value.trim();
  const minutes = Number(focusDurationEl.value || '30');
  const payload = { focusMode: focusToggle.checked };
  if (focusToggle.checked) {
    payload.focusDuration = minutes;
    payload.focusEndAt = Date.now() + minutes * 60 * 1000;
  } else {
    payload.focusEndAt = null;
  }

  chrome.storage.sync.set(payload, async () => {
    statusEl.textContent = focusToggle.checked ? "🎯 Focus mode ON" : "Focus mode OFF";
    setTimeout(() => (statusEl.textContent = ""), 1200);

    // If enabling focus mode and a goal exists, immediately analyze current page for quick feedback
    if (focusToggle.checked && goal) {
      try {
        await analyzePage();
      } catch {}
    }
  });
});

// Persist duration selection
focusDurationEl.addEventListener('change', () => {
  const minutes = Number(focusDurationEl.value || '30');
  chrome.storage.sync.set({ focusDuration: minutes });
});

// (Auto analyze toggle removed; Focus mode controls analysis)

// Get page text
async function getPageContent() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

  const [{ result }] = await chrome.scripting.executeScript({
    target: { tabId: tab.id },
    func: () => document.body.innerText,
  });

  return result || "";
}

// Analyze page
async function analyzePage() {
  summaryEl.textContent = "";
  relevanceEl.textContent = "";
  statusEl.textContent = "⏳ Analyzing...";

  const goal = goalInput.value.trim();
  if (!goal) {
    statusEl.textContent = "❗ Please set your goal first";
    return;
  }

  const pageText = await getPageContent();

  try {
    // ✅ Correct new availability check
    const available = await LanguageModel.availability();
    if (!available) {
      statusEl.textContent = "⚠️ On-device model not available. Enable Chrome AI flags.";
      return;
    }

    // ✅ Create model session
    const session = await LanguageModel.create({
      initialPrompts: [
        {
          role: 'system',
          content:
            'You are FocusCoach AI. \
Your ONLY job is to evaluate if the webpage helps the user achieve their goal.\
User goal: '+ goal + '\
STRICT RULES: \
- If content does NOT relate to the goal → Relevance MUST be 0 and Recommendation MUST be SKIP.\
- Do NOT give partial credit (no 10, 20, 30). Use 0 for irrelevant content.\
- Only score above 70 if content DIRECTLY teaches concepts tied to the goal.\
- Be ultra strict and literal. Most pages should be SKIP.\
HARD MATCH RULE:\
If the webpage does not contain keywords related to the goal, assign:\
Relevance: 0 \
Recommendation: SKIP\
Goal keyword examples to check for (case-insensitive)\
OUTPUT FORMAT (must follow exactly):\Summary: <1-2 lines>\
Relevance: <0-100>\
Recommendation: READ or SKIP'

        },

        {
          role: 'user',
          content: goal,
        },
      ],
      expectedInputs: [
        { type: "text", languages: ["en"] }
      ],
      expectedOutputs: [
        { type: "text", languages: ["en"] }
      ]
    });
    // Build the prompt
    const prompt = `
            Webpage Content: """${pageText.slice(0, 6000)}"""

            Task:
            - Summarize the page in 2–3 lines
            - Score relevance to user's goal (0–100)
            - Return READ or SKIP

            Format response as:
            Summary: ...
            Relevance: ...
            Recommendation: ...
            `;

    // ✅ Send prompt
    const response = await session.prompt(prompt);

    // Parse fields
    const summary = response.match(/Summary:(.*)/i)?.[1]?.trim() ?? "";
    const score = response.match(/Relevance:(.*)/i)?.[1]?.trim() ?? "0";
    const rec = (response.match(/Recommendation:(.*)/i)?.[1]?.trim() ?? "").toUpperCase();

    summaryEl.textContent = summary;
    relevanceEl.innerHTML = `<span><b>${score}</b></span><span class="rec ${rec === 'READ' ? 'good' : 'bad'}"><b>${rec}</b></span>`;

    statusEl.textContent = "✅ Done!";
  } catch (e) {
    console.error(e);
    statusEl.textContent = "❌ Error: " + e.message;
  }
}

// No manual analyze button; analysis happens automatically when Focus mode is enabled
