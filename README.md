# GnuNae

An Electron-based browser with an AI-powered Codex sidebar for intelligent web automation.

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
- 🤖 **Codex Sidebar** - AI assistant powered by OpenAI's Codex CLI
- 🔐 **OpenAI Auth** - Sign in with your OpenAI account
- 🔧 **Page Analysis** - Codex can see and analyze your current page
- 🎯 **MCP Integration** - Model Context Protocol for browser control

## Screenshots

*Coming soon*

## Installation

### Prerequisites
- Node.js 18+
- npm or yarn
- OpenAI account (for Codex features)

### Setup

```bash
# Clone the repository
git clone https://github.com/fkiller/GnuNae.git
cd GnuNae

# Install dependencies
npm install

# Build the application
npm run build

# Run in development
npm run start
```

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
│       ├── AddressBar.tsx    # URL navigation bar
│       ├── CodexSidebar.tsx  # AI assistant sidebar
│       ├── Settings.tsx      # Settings panel
│       └── About.tsx         # About dialog
└── core/                 # Shared utilities
    ├── auth.ts           # OpenAI authentication
    ├── settings.ts       # App settings & pre-prompt
    ├── schema.ts         # Type definitions
    └── vault.ts          # Secure storage

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
| ✅ Current | Electron-based browser integrated with Codex-Playwright MCP |
| 🔜 Planned | My Data Store - personal data storage and retrieval |
| 🔜 Planned | More browser features (bookmarks, history, tabs) |
| 🔜 Planned | Edge/Chrome extension mode with GnuNae sidebar/backend |
| 🔜 Planned | Project management for multi-page workflows |
| 🔜 Planned | More LLM options including local LLM support |

## License

MIT

## Contributing

Contributions welcome! Please open an issue or PR.

---

Built with ❤️ for AI-powered browsing
