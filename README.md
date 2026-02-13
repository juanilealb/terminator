# Constellagent for Windows

A Windows desktop app for running multiple AI coding agents in parallel. Each agent gets its own terminal, code editor, and git worktree — all in one window.

> **Fork note:** This is a Windows-only port of [owengretzinger/constellagent](https://github.com/owengretzinger/constellagent), originally built for macOS. All macOS code has been stripped for a leaner, Windows-native experience.

---

## Features

- **Parallel agents** — Run separate Claude Code / Codex sessions side-by-side, each in its own isolated workspace
- **Full terminal emulator** — Ghostty-web + node-pty with PowerShell/cmd support
- **Monaco code editor** — Syntax highlighting, diffs, and file editing
- **Git integration** — Staging, committing, branching, and worktree management
- **File tree navigation** — Browse project files with git status indicators
- **Cron-based automation** — Schedule recurring agent tasks
- **Hook integration** — Claude Code and Codex activity/notification hooks (unread indicators, activity spinners)
- **Keyboard-driven** — Quick Open, tab switching, and full shortcut support

---

## Getting Started

### Prerequisites

- **Windows 10/11**
- **[Bun](https://bun.sh)** (package manager & runtime)
- **[Git](https://git-scm.com/download/win)**
- **[Claude Code](https://docs.anthropic.com/en/docs/claude-code)** and/or **[Codex CLI](https://github.com/openai/codex)** installed

### Install & Run

```bash
# Clone the repo
git clone https://github.com/Juanilealb/constellagent.git
cd constellagent

# Install dependencies
bun run setup

# Start in dev mode
bun run dev
```

### Build & Package

```bash
# Production build
bun run build

# Package as Windows installer (NSIS)
bun run dist:win
```

### Run Tests

```bash
bun run test
```

---

## Keyboard Shortcuts

| Action | Shortcut |
|---|---|
| Quick Open file | `Ctrl+P` |
| New terminal | `Ctrl+T` |
| Close tab | `Ctrl+W` |
| Next/Previous tab | `Ctrl+Shift+]` / `Ctrl+Shift+[` |
| Jump to tab 1-9 | `Ctrl+1..9` |
| New workspace | `Ctrl+N` |
| Next/Previous workspace | `Ctrl+Shift+↓` / `Ctrl+Shift+↑` |
| Toggle sidebar | `Ctrl+B` |
| Toggle right panel | `Ctrl+Alt+B` |
| Files panel | `Ctrl+Shift+E` |
| Changes panel | `Ctrl+Shift+G` |
| Focus terminal | `Ctrl+J` |
| Commit staged changes | `Ctrl+Enter` |
| Settings | `Ctrl+,` |
| Zoom in/out/reset | `Ctrl++` / `Ctrl+-` / `Ctrl+0` |

---

## How It Works

### Workspaces & Worktrees

Each agent workspace is backed by a **git worktree** — an isolated checkout of your repo where the agent can make changes without interfering with other agents or your main branch. This means you can:

1. Open a project (any git repo)
2. Create multiple workspaces from it
3. Each workspace gets its own branch, terminal, and file view
4. Agents work in parallel without conflicts

### Agent Integration

Constellagent integrates with **Claude Code** and **OpenAI Codex** through:

- **Hook scripts** — Node.js scripts that Claude/Codex call to signal activity and completion
- **Unread indicators** — Know when an agent finishes or needs attention
- **Activity spinners** — See which workspaces have active agent sessions

### Debug Mode

Set `CONSTELLAGENT_DEBUG=1` to enable detailed logging:

```bash
set CONSTELLAGENT_DEBUG=1
bun run dev
```

This logs platform info, PTY lifecycle, hook operations, git status, and path normalization — useful for troubleshooting.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Framework | Electron 40 |
| UI | React 19 + TypeScript (strict) |
| State | Zustand |
| Editor | Monaco Editor |
| Terminal | ghostty-web + node-pty (ConPTY) |
| Build | electron-vite + Bun |
| Packaging | electron-builder (NSIS) |
| Tests | Playwright |

---

## Project Structure

```
constellagent/
├── desktop/                    # Electron app
│   ├── src/
│   │   ├── main/               # Main process (PTY, git, files, IPC, hooks)
│   │   ├── preload/            # Context bridge (window.api)
│   │   ├── renderer/           # React UI (components, store, hooks)
│   │   └── shared/             # Shared utilities (platform, shortcuts, IPC)
│   ├── claude-hooks/           # Claude Code hook scripts (.js)
│   ├── codex-hooks/            # Codex hook scripts (.js)
│   ├── e2e/                    # Playwright end-to-end tests
│   └── electron-builder.yml    # Windows build/packaging config
└── landing-page/               # Project website
```

---

## Contributing

1. Fork the repo
2. Create a feature branch (`git checkout -b feat/my-feature`)
3. Commit with conventional commits (`feat:`, `fix:`, `chore:`)
4. Push and open a PR

---

## Credits

- Original macOS app by [@owengretzinger](https://github.com/owengretzinger/constellagent)
- Windows port by [@Juanilealb](https://github.com/Juanilealb)

---

## License

ISC
