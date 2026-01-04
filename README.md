# GnuNae

An Electron-based browser with an AI-powered Codex sidebar for intelligent web automation.

🌐 **Website:** [www.gnunae.com](https://www.gnunae.com?utm_source=github) | 📺 **YouTube:** [@GnuNae](https://www.youtube.com/@GnuNae)

> ⚠️ **Alpha Warning**: This app is still in alpha stage. Do not use it in production or with sensitive data.

## Architecture

```mermaid
graph TB
    subgraph Electron["Electron App"]
        Main["Main Process<br/>(main.ts)"]
        Preload["Preload Script<br/>(preload.ts)"]
        MCP["MCP Server<br/>(mcp-server.ts)"]
    end
    
    subgraph UI["React UI"]
        App["App.tsx"]
        Sidebar["CodexSidebar"]
        AddressBar["AddressBar"]
        Settings["Settings"]
    end
    
    subgraph Browser["BrowserView"]
        WebPage["Web Content"]
    end
    
    subgraph External["External Services"]
        Codex["Codex CLI"]
        OpenAI["OpenAI API"]
        Playwright["Playwright MCP"]
    end
    
    Main --> Preload
    Main --> MCP
    Main --> Browser
    Preload <--> UI
    UI --> Sidebar
    Sidebar --> |IPC| Codex
    Codex --> OpenAI
    Codex --> Playwright
    Playwright --> |DOM Control| Browser
    MCP --> |Snapshot/Actions| Browser
```

### Component Overview

| Component | Description |
|-----------|-------------|
| **Main Process** | Electron main, window management, IPC handlers |
| **BrowserView** | Chromium-based web content rendering |
| **React UI** | Sidebar, address bar, settings overlay |
| **Codex CLI** | OpenAI's CLI for AI-powered automation |
| **MCP Server** | Model Context Protocol for browser control |
| **Playwright MCP** | DOM interaction and page automation |

## Features

- 🌐 **Full Browser** - Chrome-based web browser with address bar and navigation
- 🪟 **Multi-Window** - Open multiple independent windows (Cmd/Ctrl+N)
- 📑 **Multi-Tab** - Multiple tabs per window with tab bar
- 🤖 **Codex Sidebar** - AI assistant powered by OpenAI's Codex CLI
- 🐳 **Virtual Mode** - Docker-based sandbox for isolated Codex + Playwright execution
- 📋 **Task Manager** - Save, schedule, and run automated tasks
- 🔐 **OpenAI Auth** - Sign in with your OpenAI account
- 🔧 **Page Analysis** - Codex can see and analyze your current page
- 🎯 **MCP Integration** - Model Context Protocol for browser control
- 💾 **Personal Data Store (PDS)** - Persistent storage for user data that Codex can access and update
- ⏰ **Scheduled Tasks** - Run tasks hourly, daily, or weekly at specific times
- ⚠️ **Failure Detection** - Automatic detection of CAPTCHA, 2FA, and login blocks

## Demo Videos

### Use Case 1: AI Web Automation

[![GnuNae Use Case 1](https://img.youtube.com/vi/VwOk1_vD3vw/maxresdefault.jpg)](https://youtu.be/VwOk1_vD3vw)

### Use Case 2: Smart Page Analysis

[![GnuNae Use Case 2](https://img.youtube.com/vi/QGOXpMclgbo/maxresdefault.jpg)](https://youtu.be/QGOXpMclgbo)

### Use Case 3: Task Scheduling

[![GnuNae Use Case 3](https://img.youtube.com/vi/cvK_fsA4cpk/maxresdefault.jpg)](https://youtu.be/cvK_fsA4cpk)

## Installation

### Prerequisites
- Node.js 18+
- npm or yarn
- **ChatGPT Pro or Plus subscription** (required for Codex CLI)
  - Free ChatGPT accounts cannot use Codex features
  - Upgrade at: https://chat.openai.com/settings/subscription

### Setup

```bash
# Clone the repository
git clone https://github.com/fkiller/GnuNae.git
cd GnuNae

# Install dependencies
npm install

# IMPORTANT: Authenticate with OpenAI (first-time only)
npx codex auth openai

# Build the application
npm run build

# Run in development
npm run start
```

> ⚠️ **First-time users**: You must run `npx codex auth openai` to authenticate with OpenAI before using the app. This is a one-time setup.

## Usage

1. **Launch the app** - A browser window opens with a sidebar
2. **Sign in** - Click "Sign in to OpenAI" in the sidebar
3. **Navigate** - Use the address bar to visit any website
4. **Ask Codex** - Type a prompt in the sidebar (e.g., "list all links on this page")
5. **Get results** - Codex analyzes the page and responds

### Example Prompts
- "Summarize this page"
- "Find all job listings mentioning Python"
- "What are the main topics covered here?"
- "Google my address" (Codex will ask for your address and remember it)
- "Store all property information" (Codex extracts and saves data from the page)

### Personal Data Store (PDS)

The PDS allows Codex to remember your personal information across sessions:

1. **Automatic Prompting** - When Codex needs info (email, address, etc.), a smart card appears for you to enter it
2. **Persistent Storage** - Data is saved to `~/.gnunae/datastore.json` and reused automatically
3. **Web Extraction** - Ask Codex to "store" information from pages (e.g., property details from Zillow)
4. **Manage in Settings** - View, edit, or delete stored data in the Settings panel

Example workflow:
```
You: "Search my address on Zillow"
Codex: [Shows smart card asking for address]
You: [Enter "123 Main St, Boston MA"]
Codex: [Searches Zillow, saves address for future use]
```

### Prompt Architecture

When you send a prompt, GnuNae constructs the full prompt in this order:

| Order | Component | Description |
|-------|-----------|-------------|
| 1 | **Mode Instructions** | Behavior constraints based on mode (Ask/Agent/Full Access) |
| 2 | **Pre-Prompt** | System instructions from Settings |
| 3 | **User Data Context** | Personal data from the Data Store |
| 4 | **Page Context** | Current URL, title, and page content |
| 5 | **User Prompt** | Your actual request |

**Mode behaviors:**

| Mode | Behavior |
|------|----------|
| 💬 **Ask** | Read-only - can only describe page, refuses to click/submit/navigate |
| 🤖 **Agent** | Confirms critical actions (payments, final submissions, account changes) |
| ⚡ **Full Access** | 100% autonomous - no confirmations needed |

## Building for Distribution

```bash
# macOS
npm run pack:mac

# Windows
npm run pack:win

# Linux
npm run pack:linux
```

## Configuration

Codex settings are stored in `~/.codex/config.toml`:

```toml
model = "gpt-5.1-codex-max"
model_reasoning_effort = "xhigh"

[mcp_servers.browser]
command = "node"
args = ["/path/to/scripts/mcp-server.cjs"]
```

## Project Structure

```
src/
├── electron/              # Main process
│   ├── main.ts           # App entry, window management, IPC handlers
│   ├── preload.ts        # Context bridge for renderer
│   └── mcp-server.ts     # MCP server for browser control
├── ui/                   # Renderer process (React)
│   ├── index.tsx         # React entry point
│   ├── App.tsx           # Main UI layout
│   ├── App.css           # Global styles
│   └── components/
│       ├── AddressBar.tsx      # URL navigation bar
│       ├── CodexSidebar.tsx    # AI assistant sidebar
│       ├── DataRequestCard.tsx # Smart card for PDS data requests
│       ├── TaskManager.tsx     # Task Manager panel
│       ├── RightPanel.tsx      # Chat/Task Manager wrapper
│       ├── SaveTaskCard.tsx    # Save task prompt card
│       ├── TabBar.tsx          # Multi-tab bar
│       ├── Settings.tsx        # Settings panel (includes PDS editor)
│       └── About.tsx           # About dialog
└── core/                   # Shared utilities
    ├── auth.ts             # OpenAI authentication
    ├── datastore.ts        # Personal Data Store service
    ├── tasks.ts            # Task service and scheduler
    ├── settings.ts         # App settings & pre-prompt
    ├── schema.ts           # Type definitions
    └── vault.ts            # Secure storage

docs/                     # GitHub Pages (gnunae.com)
├── index.html            # Landing page
├── CNAME                 # Custom domain
└── assets/               # Logo, videos

.github/workflows/
└── release.yml           # CI/CD for multi-platform builds
```

## Tech Stack

- **Electron** - Desktop app framework
- **React** - UI library
- **TypeScript** - Type safety
- **Vite** - Build tool
- **OpenAI Codex** - AI code assistant

## Roadmap

| Status | Feature |
|--------|---------|
| ✅ Done | Electron-based browser integrated with Codex-Playwright MCP |
| ✅ Done | Multi-window support with isolated Codex sessions |
| ✅ Done | Multi-tab support with tab bar |
| ✅ Done | Personal Data Store (PDS) - persistent storage with smart card UI |
| ✅ Done | Two-way PDS integration - Codex can request AND store data |
| ✅ Done | Task Manager - save, schedule, and automate tasks |
| ✅ Done | Virtual Mode - Docker sandbox for Codex + Playwright isolation |
| 🔜 Planned | Remote backend (home server, cloud) with VNC streaming |
| 🔜 Planned | Edge/Chrome extension mode with GnuNae sidebar/backend |
| 🔜 Planned | Project management for multi-page workflows |
| 🔜 Planned | More LLM options including local LLM support |

## Version History

### v0.6.0 (2025-01-04)
- **Virtual Mode (Docker Sandbox)**
  - Enables isolated execution of Codex CLI and Playwright MCP in a Docker container
  - Requires Docker Desktop installed on your machine
  - Shares OpenAI authentication with the container securely
  - Mounts working directory so attached files are accessible
  - Foundation for future remote backend support (home server, cloud)
  - Toggle via Settings panel when Docker is detected

### v0.5.0 (2025-12-27)
- **Multi-Window Support**
  - Open multiple independent GnuNae windows (Cmd/Ctrl+N)
  - Each window has isolated Codex sessions and working directory
  - Window-specific tab management and automation
  - Playwright MCP correctly targets each window's webview
- **Stability Improvements**
  - Fixed iframe navigation polluting address bar URL
  - Protected application UI from accidental Playwright navigation
  - Improved tab selection guidance in pre-prompt

### v0.4.0 (2025-12-21)
- **Task Execution System**
  - Save prompts as reusable tasks with one-time, on-going, or scheduled triggers
  - Task Manager panel with favorites, running tasks, and scheduled countdowns
  - Background scheduler for automated task execution
  - Max concurrency setting (1-5 simultaneous tasks)
- **Failure Handling**
  - CAPTCHA/2FA/login detection with warning cards
- **Menu Enhancements**
  - Settings accessible from App menu (⌘,)
  - View menu: Show Chat (⌘1), Task Manager (⌘2), Hide Panel (⌘0)
  - About dialog with open source library attributions
- **UI Improvements**
  - Chat/Task Manager toggle buttons in address bar
  - Collapsible right panel with dynamic browser resizing

### v0.2.0 (2024-12-17)
- Personal Data Store (PDS) with smart card UI
- Multi-tab browser support

### v0.1.0 (2024-12-01)
- Initial release
- Codex sidebar with OpenAI integration
- MCP-based browser automation

## License

MIT

## Contributing

Contributions welcome! Please open an issue or PR.

---

Built with ❤️ for AI-powered browsing
