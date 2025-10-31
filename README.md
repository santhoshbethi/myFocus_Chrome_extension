# FocusCoach AI (Chrome Extension)

Goal-aligned page analyzer and summarizer that uses Chrome's on-device AI to summarize the current page and score its relevance to your personal learning goal.

## Features

- Save a personal learning goal in the popup
- One-click “Analyze This Page”
- Concise English summary (Markdown)
- Relevance score (0–100) and READ/SKIP recommendation
- Works even without on-device AI via a local extractive fallback

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

- The popup script:
  - Reads high-level text content from the active tab
  - Summarizes the text using either:
    - Chrome Prompt API (Language Model) — preferred
    - Chrome Summarizer API — fallback if available
    - Local heuristic extractive summarizer — last resort (no ML)
  - Scores relevance to your goal using the Prompt API when available, with a keyword-heuristic guardrail

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
  - `content_scripts` (optional page helpers)

- Manifest host permissions:
  - `"host_permissions": ["<all_urls>"]` to access the active tab’s content for analysis

Notes:
- These are Google/Chrome-provided APIs that run locally (no Google Cloud API keys).
- Availability varies by Chrome version/platform and may require enabling flags.

## Privacy

- No data leaves your browser. Summarization and relevance checks run on-device when supported.
- The extension stores only your goal (in Chrome `storage.sync`).

## Development

- Files:
  - `manifest.json` — MV3 manifest
  - `popup.html`, `styles.css` — UI
  - `popup.js` — logic for goal storage, page text extraction, summarization, and relevance scoring
  - `content.js` — content script (if needed for more advanced extraction)

- Debugging tips:
  - Popup logs: open the popup → right‑click → Inspect → Console
  - Content script logs: open DevTools on the page → Console
  - Service worker logs (if added): `chrome://extensions` → your extension → "Service worker"

## License

MIT — see `LICENSE`.
