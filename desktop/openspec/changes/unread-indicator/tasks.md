## 1. Store — unread state and actions

- [x] 1.1 Add `unreadWorkspaceIds: Set<string>` to `AppState` in `types.ts` with actions `markWorkspaceUnread(workspaceId: string)` and `clearWorkspaceUnread(workspaceId: string)`
- [x] 1.2 Implement `markWorkspaceUnread` in `app-store.ts` — adds workspaceId to the set
- [x] 1.3 Modify `setActiveWorkspace` in `app-store.ts` to clear the target workspace from `unreadWorkspaceIds` as a side-effect
- [x] 1.4 Modify `removeWorkspace` in `app-store.ts` to clean up deleted workspace from `unreadWorkspaceIds`
- [x] 1.5 Verify `unreadWorkspaceIds` is NOT included in `getPersistedSlice()` (ephemeral only)

## 2. Claude Code hooks integration (replaced bell detection)

- [x] 2.1 Create `resources/claude-hooks/notify.js` — hook script that writes workspace ID to signal file in `/tmp/constellagent-notify/`
- [x] 2.2 Add `extraEnv` param to `pty-manager.ts` `create()`, pass through IPC handler and preload bridge
- [x] 2.3 Pass `AGENT_ORCH_WS_ID` env var at all 3 PTY creation call sites (app-store.ts, Sidebar.tsx x2)
- [x] 2.4 Create `NotificationWatcher` service in `src/main/notification-watcher.ts` — polls `/tmp/constellagent-notify/` for signal files, sends IPC to renderer
- [x] 2.5 Start `NotificationWatcher` from `src/main/index.ts` on app ready, stop on quit
- [x] 2.6 Add `CLAUDE_INSTALL_HOOKS` and `CLAUDE_CHECK_HOOKS` IPC handlers — read/write `~/.claude/settings.json` to register Stop and Notification hooks
- [x] 2.7 Wire `onNotifyWorkspace` IPC listener in `App.tsx` — calls `markWorkspaceUnread` for non-active workspaces
- [x] 2.8 Remove broken bell detection from `TerminalPanel.tsx` `onData` callback

## 3. Sidebar visual indicator

- [x] 3.1 In `Sidebar.tsx`, read `unreadWorkspaceIds` from the store and apply an `unread` CSS class to workspace items whose ID is in the set
- [x] 3.2 Add `.workspaceItem.unread::after` styles in `Sidebar.module.css` — small filled circle, `--accent-blue` color, right-aligned within the row

## 4. Settings UI

- [x] 4.1 Add "Claude Code Integration" section in `SettingsPanel.tsx` with "Install Hooks" button
- [x] 4.2 Button checks hook installation status on mount, shows "Installed" when hooks are configured

## 5. Testing

- [x] 5.1 E2e test: signal file for non-active workspace marks it as unread in store
- [x] 5.2 E2e test: switching to unread workspace clears unread state
- [x] 5.3 E2e test: signal file for active workspace does not mark as unread
