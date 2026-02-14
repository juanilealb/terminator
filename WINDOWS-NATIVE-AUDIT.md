# WINDOWS-NATIVE-AUDIT

Scope: Windows-native UX and platform integration only (not cross-platform cleanup).  
Codebase audited: `desktop/src/main`, `desktop/src/renderer`, `desktop/electron-builder.yml`, release workflow.

## 1. Current State

Things already done well for Windows:

- Windows-focused window chrome setup is in place (`frame: true`, hidden title bar + overlay) in `desktop/src/main/index.ts:26`, `desktop/src/main/index.ts:28`, `desktop/src/main/index.ts:29`.
- Menubar is removed for cleaner Windows desktop UX (`desktop/src/main/index.ts:45`, `desktop/src/main/index.ts:46`, `desktop/src/main/index.ts:99`).
- Default shell detection prioritizes PowerShell Core, then Windows PowerShell, then cmd (`desktop/src/shared/platform.ts:40`, `desktop/src/shared/platform.ts:43`, `desktop/src/shared/platform.ts:47`).
- PTY integration is solid and Windows-aware (node-pty usage) with explicit env normalization (`desktop/src/main/pty-manager.ts:261`, `desktop/src/main/pty-manager.ts:266`, `desktop/src/main/pty-manager.ts:217`).
- Windows path normalization is consistently handled for Git/file UI (`desktop/src/shared/platform.ts:57`, `desktop/src/main/ipc.ts:163`, `desktop/src/main/ipc.ts:350`).
- FS watcher logic explicitly handles both `\.git\` and `/.git/` separators (`desktop/src/main/ipc.ts:419`, `desktop/src/main/ipc.ts:420`).
- Terminal font stack includes strong Windows defaults like Cascadia (`desktop/src/renderer/styles/design-tokens.css:72`, `desktop/src/renderer/components/Terminal/TerminalPanel.tsx:83`).
- Installer target is NSIS and release CI is Windows-hosted (`desktop/electron-builder.yml:15`, `desktop/workflows/release.yml:10`, `desktop/package.json:14`).
- node-pty build patch removes a common Windows native-build friction point (Spectre requirement) (`desktop/patches/node-pty@1.1.0.patch:9`, `desktop/patches/node-pty@1.1.0.patch:23`).

## 2. Quick Wins (< 1 day each)

### QW-1: Set explicit App User Model ID
- What it is: Call `app.setAppUserModelId('com.terminator.app')` at startup.
- Why it matters: Correct taskbar grouping, better toast behavior, and required foundation for jump lists/notifications.
- How to implement: Electron `app.setAppUserModelId` in main process after app init.
- Which files to modify: `desktop/src/main/index.ts`.
- Evidence: currently only `app.setName` is called (`desktop/src/main/index.ts:69`).

### QW-2: Native Windows toast notifications for agent completion
- What it is: Trigger Electron `new Notification(...)` when workspace notify events arrive.
- Why it matters: In-app unread dots/toasts are easy to miss when app is unfocused.
- How to implement: Emit native toast from `NotificationWatcher.notifyRenderer` flow; on click, focus window + activate workspace via IPC.
- Which files to modify: `desktop/src/main/notification-watcher.ts`, `desktop/src/main/ipc.ts`, `desktop/src/shared/ipc-channels.ts`, `desktop/src/renderer/App.tsx`.
- Evidence: notifications are currently in-app only (`desktop/src/main/notification-watcher.ts:136`, `desktop/src/renderer/App.tsx:28`, `desktop/src/renderer/components/Toast/Toast.tsx:24`).

### QW-3: Taskbar progress during long Git/worktree operations
- What it is: Show progress in taskbar (`setProgressBar`) while creating/removing worktrees and running automations.
- Why it matters: Windows users expect background progress visibility even when minimized.
- How to implement: Hook into `GIT_CREATE_WORKTREE_PROGRESS` and set/reset progress on main window.
- Which files to modify: `desktop/src/main/ipc.ts`, `desktop/src/main/index.ts`, optional renderer wiring in `desktop/src/renderer/store/app-store.ts`.
- Evidence: progress exists as events but not reflected in taskbar (`desktop/src/main/ipc.ts:185`, `desktop/src/main/ipc.ts:200`).

### QW-4: Unread count as taskbar overlay icon
- What it is: Add overlay icon/count hint when unread workspaces exist.
- Why it matters: Better re-engagement signal when app is backgrounded.
- How to implement: `BrowserWindow.setOverlayIcon` from main via IPC when unread set changes.
- Which files to modify: `desktop/src/main/index.ts`, `desktop/src/main/ipc.ts`, `desktop/src/shared/ipc-channels.ts`, `desktop/src/renderer/store/app-store.ts`.
- Evidence: unread exists only in renderer state (`desktop/src/renderer/store/app-store.ts:482`) and sidebar visuals.

### QW-5: Persist and restore native window bounds/maximized state
- What it is: Save `x/y/width/height/isMaximized` and restore on launch.
- Why it matters: Multi-monitor users expect windows to reopen where they left them.
- How to implement: `BrowserWindow` bounds listeners or `electron-window-state` package.
- Which files to modify: `desktop/src/main/index.ts` (or add `desktop/src/main/window-state.ts`).
- Evidence: window always starts at fixed size (`desktop/src/main/index.ts:20`) and app persistence excludes window geometry (`desktop/src/renderer/store/app-store.ts:585`).

### QW-6: Add Windows Jump List tasks
- What it is: Jump list actions like “New Terminal”, “Open Project”.
- Why it matters: Native Windows launch surface from taskbar right-click.
- How to implement: `app.setJumpList` / `app.setUserTasks`; dispatch via command args.
- Which files to modify: `desktop/src/main/index.ts`, `desktop/src/main/ipc.ts`.
- Evidence: no jump list/taskbar task integration currently in main startup flow (`desktop/src/main/index.ts:79`).

### QW-7: Follow OS dark/light + accent color for title bar overlay
- What it is: Adapt titlebar overlay color/symbol color to `nativeTheme` and accent.
- Why it matters: Current hardcoded dark titlebar can clash with system theme.
- How to implement: `nativeTheme.shouldUseDarkColors`, optional `systemPreferences.getAccentColor()`; update `setTitleBarOverlay` dynamically.
- Which files to modify: `desktop/src/main/index.ts`, `desktop/src/renderer/styles/design-tokens.css`.
- Evidence: overlay colors are fixed constants (`desktop/src/main/index.ts:31`, `desktop/src/main/index.ts:32`).

## 3. Medium Effort (1-3 days each)

### M-1: Explorer context menu “Open in Terminator”
- What it is: Shell integration entry in Explorer folder background/context menu.
- Why it matters: Huge discoverability + fast entry into existing repos.
- How to implement: NSIS custom registry keys (HKCU/HKLM) + app command-line argument parser (`"%V"`).
- Which files to modify: `desktop/electron-builder.yml`, add NSIS include script (e.g. `desktop/build/installer.nsh`), `desktop/src/main/index.ts`.
- Evidence: no CLI arg ingestion and no installer registry scripting (`desktop/src/main/index.ts:79`, `desktop/electron-builder.yml:1`).

### M-2: Auto-update pipeline for NSIS builds
- What it is: Add `electron-updater` with GitHub provider and publish metadata.
- Why it matters: Windows desktop apps are expected to self-update.
- How to implement: configure `publish` in `electron-builder.yml`, integrate `autoUpdater` in main, upload `latest.yml`/`blockmap` in release workflow.
- Which files to modify: `desktop/electron-builder.yml`, `desktop/src/main/index.ts`, `desktop/workflows/release.yml`, `desktop/package.json`.
- Evidence: release uploads only `.exe` (`desktop/workflows/release.yml:27`), while blockmap is produced (`desktop/PUBLISHING.md:17`).

### M-3: Refactor FS watching to robust Windows strategy
- What it is: Replace raw `fs.watch` fanout with `chokidar` + ref-counted subscriptions.
- Why it matters: Better reliability for large repos, fewer dropped events, fewer duplicate watchers.
- How to implement: central watcher service in main process; IPC subscribe/unsubscribe with consumer counts.
- Which files to modify: `desktop/src/main/ipc.ts`, add `desktop/src/main/fs-watcher.ts`, update `desktop/src/renderer/components/RightPanel/RightPanel.tsx`, `desktop/src/renderer/components/RightPanel/FileTree.tsx`, `desktop/src/renderer/components/RightPanel/ChangedFiles.tsx`.
- Evidence: raw recursive watch (`desktop/src/main/ipc.ts:412`) + multiple components independently start/stop same watch (`desktop/src/renderer/components/RightPanel/RightPanel.tsx:46`, `desktop/src/renderer/components/RightPanel/FileTree.tsx:123`, `desktop/src/renderer/components/RightPanel/ChangedFiles.tsx:55`).

### M-4: Shell profile model + Windows terminal profiles
- What it is: Add shell presets (pwsh, powershell, cmd, wsl) with controlled args and UTF-8 defaults.
- Why it matters: Better out-of-box behavior and fewer encoding/profile surprises.
- How to implement: persist `{shell, args}` profile; for cmd use `/K chcp 65001>nul`; optional WSL launch path.
- Which files to modify: `desktop/src/main/pty-manager.ts`, `desktop/src/shared/platform.ts`, `desktop/src/renderer/components/Settings/SettingsPanel.tsx`, `desktop/src/renderer/store/types.ts`.
- Evidence: only executable path is configurable (`desktop/src/renderer/components/Settings/SettingsPanel.tsx:373`) and PTY currently launches with empty args (`desktop/src/main/pty-manager.ts:258`).

### M-5: Actionable toasts (buttons) + deep-link activation
- What it is: Windows toasts with actions like “Open Workspace”.
- Why it matters: Completion notifications become immediately actionable.
- How to implement: Notification actions + IPC route to activate workspace/tab; bring window to front.
- Which files to modify: `desktop/src/main/notification-watcher.ts`, `desktop/src/main/ipc.ts`, `desktop/src/renderer/store/app-store.ts`.
- Evidence: notify path currently only sends workspace ID event to renderer (`desktop/src/main/notification-watcher.ts:139`).

## 4. Nice-to-Have (future)

- Windows 11 Mica/Acrylic background material for top-level window (Electron `backgroundMaterial`) in `desktop/src/main/index.ts`.
- Taskbar thumbnail toolbar buttons (quick actions) via `BrowserWindow.setThumbarButtons` in `desktop/src/main/index.ts`.
- Minimize-to-tray mode with optional “keep running in tray” UX via Electron `Tray`; main process currently quits on all windows closed (`desktop/src/main/index.ts:106`).
- Per-monitor DPI polish for split-pane defaults and font scaling (listen to display metrics events).
- Optional repo/file associations (e.g., `.worktree` session file) through NSIS file associations.

## 5. Specific Refactoring Recommendations

Scoring model:  
`Impact` (1-5) = user-visible Windows UX gain.  
`Effort` (1-5) = engineering effort/risk.  
`Priority = Impact * (6 - Effort)` (higher is better).

| Area | Recommendation | Evidence (current code) | Impact | Effort | Priority |
|---|---|---|---:|---:|---:|
| Terminal (ConPTY) | Explicitly set Windows PTY options (`useConpty: true`, `conptyInheritCursor`) and shell-specific args model. | `desktop/src/main/pty-manager.ts:261` only passes generic spawn options; no ConPTY flags. | 5 | 2 | 20 |
| Terminal (Shell detection) | Expand shell detection to include user env (`ComSpec`) and optional WSL preset; persist shell args, not just path. | Detection only checks `pwsh/powershell/cmd` (`desktop/src/shared/platform.ts:40`); settings stores only executable text (`desktop/src/renderer/components/Settings/SettingsPanel.tsx:373`). | 4 | 3 | 12 |
| Terminal (PowerShell profile loading) | Add explicit profile behavior control (`load profile` toggle) and non-interactive profile option for automations. | Interactive terminals use empty args (`desktop/src/main/pty-manager.ts:258`), automations inject commands blindly (`desktop/src/main/automation-scheduler.ts:115`). | 3 | 3 | 9 |
| Window management | Persist native window bounds/maximized state + validate against active displays on launch. | Fixed startup geometry (`desktop/src/main/index.ts:20`), no bounds restore listeners. | 5 | 2 | 20 |
| Window management (Snap/DPI) | Replace hardcoded window-controls width with runtime metrics and maximize state handling. | Hardcoded `138px` in renderer (`desktop/src/renderer/App.tsx:78`), static titlebar height token (`desktop/src/renderer/styles/design-tokens.css:132`). | 4 | 3 | 12 |
| File system | Refactor FS watch to ref-counted subscriptions and robust backend (`chokidar`). | Single watcher map with no consumer counting (`desktop/src/main/ipc.ts:22`, `desktop/src/main/ipc.ts:405`, `desktop/src/main/ipc.ts:444`); multiple components start/stop same dir watch (`desktop/src/renderer/components/RightPanel/RightPanel.tsx:46`). | 4 | 3 | 12 |
| File system (Long paths) | Normalize/guard long paths and set Git longpath guidance; add user-facing error when path length exceeds safe limits. | No long-path handling layer in file/git services (`desktop/src/main/file-service.ts:24`, `desktop/src/main/git-service.ts:42`). | 3 | 3 | 9 |
| Notifications | Introduce native Windows toast notifications with click/action handlers to focus app + workspace. | Current notify only updates renderer unread state (`desktop/src/main/notification-watcher.ts:136`, `desktop/src/renderer/App.tsx:28`). | 5 | 2 | 20 |
| Taskbar | Add progress (`setProgressBar`) and unread overlay icon (`setOverlayIcon`). | No taskbar API usage in main process startup/IPC (`desktop/src/main/index.ts:79`, `desktop/src/main/ipc.ts:162`). | 5 | 2 | 20 |
| System tray | Add optional minimize-to-tray behavior with explicit user setting. | App quits when all windows close (`desktop/src/main/index.ts:106`). | 3 | 2 | 12 |
| Theming | Wire `nativeTheme` and accent color into CSS variables + titlebar overlay updates. | Static dark palette and static overlay colors (`desktop/src/renderer/styles/design-tokens.css:6`, `desktop/src/main/index.ts:31`). | 4 | 2 | 16 |
| Performance | Remove polling-based notification/activity scanning; switch to event-driven watchers where possible. | Poll every 500ms with sync fs operations (`desktop/src/main/notification-watcher.ts:9`, `desktop/src/main/notification-watcher.ts:21`, `desktop/src/main/notification-watcher.ts:38`). | 3 | 2 | 12 |
| Installer (NSIS) | Add `nsis` block, updater metadata (`publish`), proper shortcuts/uninstall metadata, and optional per-machine install. | Builder config is minimal (`desktop/electron-builder.yml:1` through `desktop/electron-builder.yml:26`), signing/edit exe disabled (`desktop/electron-builder.yml:13`). | 5 | 3 | 15 |
| Installer (Auto-updates) | Upload full updater artifacts (`latest.yml`, blockmap) in release workflow. | Workflow uploads only exe (`desktop/workflows/release.yml:27`), blockmap expected (`desktop/PUBLISHING.md:17`). | 5 | 2 | 20 |
| Shell integration | Implement Explorer context menu “Open in Terminator” and command-line path handling. | No argv/deep-link handling in main (`desktop/src/main/index.ts:79`), no file/protocol association config (`desktop/electron-builder.yml:1`). | 5 | 3 | 15 |

### Top 5 priorities to do first
1. Native toasts + actionable activation (Priority 20).
2. Taskbar progress + overlay unread signal (Priority 20).
3. Window bounds/maximized restore (Priority 20).
4. ConPTY explicit config + shell args model baseline (Priority 20).
5. Auto-update artifact + pipeline readiness (Priority 20).
