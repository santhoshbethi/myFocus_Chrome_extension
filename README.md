# FocusCoach AI (Chrome Extension)

Goal-aligned page analyzer and summarizer that uses Chrome's on-device AI to automatically summarize pages and score their relevance to your personal learning goal. Requires on-device AI; if unavailable, analysis is disabled.

## Features

- Auto-save your personal learning goal (no Save button)
- Single toggle: Focus mode
  - Shows your goal as a subtle banner on pages
  - Automatically analyzes every page against your goal (no extra clicks)
- Focus session timer with presets (15/30/45/60 min) and a live ⏳ countdown on the banner
- Popup: Relevance is always visible; Summary is hidden behind a collapsible section
- Concise English summary (Markdown-like) when AI is available
- Relevance score (0–100) and READ/SKIP recommendation with strict guardrails
- Requires on-device AI
- Compact popup UI (300px width)

## Requirements

- Chrome 127+ (best with Chrome Canary) on a supported platform
- For on-device AI features (Prompt API): enable the Chrome AI flags if required
- No external servers or cloud keys needed; everything runs in the browser

## Install (Load Unpacked)

1. Clone or download this folder
2. Open `chrome://extensions`
3. Enable "Developer mode"
4. Click "Load unpacked" and select this project folder
5. Pin the extension and open the popup

## How it works

- Focus mode (global):
  - Content script runs at `document_start`, shows a small goal banner, and analyzes pages automatically when Focus mode is ON and a goal exists
  - Updates the banner with the recommendation (READ/SKIP) and score after analysis
  - Starts a focus session timer when Focus mode is enabled; stores the session end (`focusEndAt`) and shows a live ⏳ mm:ss countdown on each page
  - On YouTube, when the on-device model is available, it scores each video card against your goal and blurs only non-matching videos (score < 60). If the model is unavailable, no blurring is applied.

- Analysis pipeline:
  1) Prompt API (Language Model): instruction-style prompt produces Summary, Relevance, and Recommendation (used directly from the content script)

- Guardrails:
  - Strict heuristic keyword matching blended with model score to avoid off-topic false positives
  - Timeouts on AI calls to keep the UI responsive

## Permissions and Google/Chrome APIs Used

This project uses Chrome's built‑in (on-device) AI APIs and standard extension APIs:

- Chrome AI (on-device):
  - Prompt API (Language Model): `LanguageModel`
    - Used for instruction-style prompting to generate summaries and relevance assessments
    - Session configuration includes `expectedInputs/expectedOutputs` with `languages: ["en"]` to ensure English output

- Chrome Extension APIs:
  - `chrome.tabs` (query active tab)
  - `chrome.scripting` (execute a small function to retrieve page text)
  - `chrome.storage` (persist the user’s goal)
  - `content_scripts` (banner + auto analysis trigger)

- Manifest host permissions:
  - `"host_permissions": ["<all_urls>"]` to access the active tab’s content for analysis

<!-- No web-accessible resources are required -->

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
  - `content.js` — banner + direct analysis (on-device model only) and YouTube meta scoring/blur

- Debugging tips:
  - Popup logs: open the popup → right‑click → Inspect → Console
  - Content script logs: open DevTools on the page → Console
  - Service worker logs (if added): `chrome://extensions` → your extension → "Service worker"

## Limitations

- Some pages (e.g., `chrome://` and certain web store pages) block content scripts
- On-device AI availability varies by Chrome version and platform; flags may be needed. If unavailable, analysis and YouTube filtering are disabled.
- The timer counts down to 00:00 but (by default) does not automatically turn off Focus mode; you can toggle it off anytime in the popup

## License

MIT — see `LICENSE`.
