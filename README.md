# FocusCoach AI (Chrome Extension)

Goal-aligned page analyzer and summarizer that uses Chrome's on-device AI to automatically summarize pages and score their relevance to your personal learning goal.

## Features

- Auto-save your personal learning goal (no Save button)
- Single toggle: Focus mode
  - Shows your goal as a subtle banner on pages
  - Automatically analyzes every page against your goal (no extra clicks)
- Focus session timer with presets (15/30/45/60 min) and a live ⏳ countdown on the banner
- Popup: Relevance is always visible; Summary is hidden behind a collapsible section
- Concise English summary (Markdown-like) when AI is available
- Relevance score (0–100) and READ/SKIP recommendation with strict guardrails
- Works without on-device AI via a local extractive and heuristic fallback
- Compact popup UI (300px width)

## Requirements

- Chrome 127+ (best with Chrome Canary) on a supported platform
- For on-device AI features (Prompt API / Summarizer API): enable the Chrome AI flags if required
- No external servers or cloud keys needed; everything runs in the browser

## Install (Load Unpacked)

1. Clone or download this folder
2. Open `chrome://extensions`
3. Enable "Developer mode"
4. Click "Load unpacked" and select this project folder
5. Pin the extension and open the popup

## How it works

- Focus mode (global):
  - Content script runs at `document_start`, shows a small goal banner, and requests analysis automatically on each page
  - Injects a tiny page script (`page-analyzer.js`) to access `window.ai` Prompt API from the page context
  - Updates the banner with the recommendation (READ/SKIP) and score after analysis
  - Starts a focus session timer when Focus mode is enabled; stores the session end (`focusEndAt`) and shows a live ⏳ mm:ss countdown on each page

- Analysis pipeline:
  1) Prompt API (Language Model): instruction-style prompt produces Summary, Relevance, and Recommendation
  2) Summarizer API: key-points summary with explicit `language: "en"` when Prompt API is not used
  3) Local fallback: extractive summary and keyword-overlap heuristic for relevance

- Guardrails:
  - Strict heuristic keyword matching blended with model score to avoid off-topic false positives
  - Timeouts on AI calls to keep the UI responsive

## Permissions and Google/Chrome APIs Used

This project uses Chrome's built‑in (on-device) AI APIs and standard extension APIs:

- Chrome AI (on-device):
  - Prompt API (Language Model): `window.ai.languageModel` / `LanguageModel`
    - Used for instruction-style prompting to generate summaries and relevance assessments
    - Session configuration includes `expectedInputs/expectedOutputs` with `languages: ["en"]` to ensure English output
  - Summarizer API: `Summarizer`
    - Used to produce key-points summaries with explicit output language `en`

- Chrome Extension APIs:
  - `chrome.tabs` (query active tab)
  - `chrome.scripting` (execute a small function to retrieve page text)
  - `chrome.storage` (persist the user’s goal)
  - `content_scripts` (banner + auto analysis trigger)

- Manifest host permissions:
  - `"host_permissions": ["<all_urls>"]` to access the active tab’s content for analysis

- Web Accessible Resources:
  - `page-analyzer.js` is exposed to pages so it can be injected and call `window.ai`

Notes:
- These are Google/Chrome-provided APIs that run locally (no Google Cloud API keys).
- Availability varies by Chrome version/platform and may require enabling flags.

## Privacy

- No data leaves your browser. Summarization and relevance checks run on-device when supported.
- The extension stores only your goal and settings (in Chrome `storage.sync`).

## Usage

1. Open the popup and type your goal — it auto-saves.
2. Pick a Duration (15/30/45 min or 1 hour).
3. Toggle Focus mode ON.
4. Browse normally:
  - A banner shows your goal on each page (with a per-page Hide button)
  - Analysis runs automatically; the banner updates with READ/SKIP and score
  - The banner shows a live ⏳ timer for your session (mm:ss)
  - Open the popup to see Relevance immediately and expand Summary when needed

To disable globally, toggle Focus mode OFF.

## Development

- Files:
  - `manifest.json` — MV3 manifest
  - `popup.html`, `styles.css` — UI
  - `popup.js` — goal auto-save, Focus mode control, analysis display
  - `content.js` — banner + auto analysis trigger and result relay
  - `page-analyzer.js` — in-page analyzer using `window.ai` (Prompt API) with fallbacks

- Debugging tips:
  - Popup logs: open the popup → right‑click → Inspect → Console
  - Content script logs: open DevTools on the page → Console
  - Service worker logs (if added): `chrome://extensions` → your extension → "Service worker"
  - Banner present but no results? Check the page console for `FOCUSCOACH_RESULT` messages

## Limitations

- Some pages (e.g., `chrome://` and certain web store pages) block content scripts
- On-device AI availability varies by Chrome version and platform; flags may be needed
- The timer counts down to 00:00 but (by default) does not automatically turn off Focus mode; you can toggle it off anytime in the popup

## License

MIT — see `LICENSE`.
