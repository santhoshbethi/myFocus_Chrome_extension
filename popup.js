// DOM elements
const goalInput = document.getElementById("goal");
const saveGoalBtn = document.getElementById("saveGoal");
const analyzeBtn = document.getElementById("analyze");
const statusEl = document.getElementById("status");
const summaryEl = document.getElementById("summary");
const relevanceEl = document.getElementById("relevance");

// Save goal
saveGoalBtn.addEventListener("click", () => {
  const goal = goalInput.value.trim();
  if (!goal) return alert("Enter a goal first!");
  chrome.storage.sync.set({ userGoal: goal }, () => {
    statusEl.textContent = "✅ Goal saved!";
    setTimeout(() => (statusEl.textContent = ""), 1500);
  });
});

// Load saved goal when popup opens
chrome.storage.sync.get("userGoal", (res) => {
  if (res.userGoal) goalInput.value = res.userGoal;
});

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
    const score = response.match(/Relevance:(.*)/i)?.[1]?.trim() ?? "";
    const rec = response.match(/Recommendation:(.*)/i)?.[1]?.trim() ?? "";

    summaryEl.textContent = summary;
    relevanceEl.innerHTML = `
      Score: <b>${score}</b><br>
      Goal: <b>${goal}</b><br>
      Recommendation: <b style="color:${rec === "READ" ? "green" : "red"}">${rec}</b>
    `;

    statusEl.textContent = "✅ Done!";
  } catch (e) {
    console.error(e);
    statusEl.textContent = "❌ Error: " + e.message;
  }
}

analyzeBtn.addEventListener("click", analyzePage);
