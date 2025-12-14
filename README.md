# GnuNae Antigravity

An Electron-based browser with an AI-powered Codex sidebar for intelligent web automation.

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
git clone https://github.com/yourusername/GnuNae.Antigravity.git
cd GnuNae.Antigravity

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
├── electron/          # Main process
│   ├── main.ts       # App entry, window management
│   ├── preload.ts    # Context bridge
│   └── mcp-server.ts # MCP server for browser control
├── ui/               # Renderer process (React)
│   ├── App.tsx       # Main UI component
│   ├── App.css       # Styling
│   └── components/   # UI components
└── core/             # Shared utilities
    └── auth.ts       # Authentication service
```

## Tech Stack

- **Electron** - Desktop app framework
- **React** - UI library
- **TypeScript** - Type safety
- **Vite** - Build tool
- **OpenAI Codex** - AI code assistant

## License

MIT

## Contributing

Contributions welcome! Please open an issue or PR.

---

Built with ❤️ for AI-powered browsing
