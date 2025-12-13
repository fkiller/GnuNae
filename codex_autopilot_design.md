# System Design: Codex-Controlled Autopilot Job Application Platform

## 1. Overview
This system enables users to interactively or autonomously apply for jobs via a local Codex-powered assistant that can navigate job application pages, customize and submit resumes, and fill out forms using personal data stored in a structured vault.

## 2. Architecture Components

### Headless Codex Backend (Local)
- A Codex CLI agent running locally and authenticated with user ChatGPT session.
- Responds to user instructions and controls application flow.

### Playwright Middleware Controller
- A daemon interface that launches browsers (Electron or native Edge/Chrome) via Playwright.
- Full DOM control with action logging and step-wise execution.

### Electron Browser Shell (Optional)
- Chromium-based browser packaged with Codex sidebar.
- Users can toggle sidebar to chat with Codex while browsing.

### Native Browser Extension Support
- Edge or Chrome shortcuts with remote-debugging mode enabled.
- Potential support for minimalistic extensions to enable Codex sidebar or DOM proxy bridge.

### MyInfo Vault (resume.full.json)
- Local JSON-based profile storage.
- Extensible schema approved through a centralized moderation and distribution workflow.
- Editable via in-app UI panel.

## 3. Workflow

1. User inputs job posting URL and preferred resume format (in Markdown).
2. Codex reads job page using Playwright MCP.
3. Codex generates a custom resume by referencing `resume.full.json`.
4. Codex fills application forms:
   - EEO/demographic fields (with opt-out override)
   - Authorization and work status (stored in vault)
   - Text areas (cover letter or motivational paragraphs if required)
5. Codex attempts to upload `.docx` resume; if it fails, retries with `.pdf`.
6. Codex confirms submission and returns summary/log.

## 4. Decision Logic

- If any form field is not found:
  - If the value can be inferred (e.g., gender, race): auto-fill.
  - If not inferable (e.g., unknown certification): Codex prompts user.
  - Once user answers, update `resume.full.json` with new data.

## 5. Schema Extension Management

- New fields requested during application are proposed as schema extensions.
- User confirms the addition, which is then reviewed by central moderators.
- If approved, shared with other users using the product.

## 6. PoC Implementation

### MVP Focus
- CLI runner for `--url` with resume selector.
- Playwright + Headless Chromium controller with DOM watcher.
- Local Codex shell integrated with resume.full.json and answer recall.

### Components
- Codex-CLI (Python/Node CLI)
- Playwright MCP (Node.js)
- Electron GUI with togglable sidebar (optional)
- JSON Vault UI (React-based editor)

## 7. Technologies

- Electron (Chromium)
- Playwright (Node.js)
- Python/Node bridge
- JSON Schema + File Watcher
- Git-based schema contribution & moderation pipeline

---

*Generated for Won Dong by system design automation.*