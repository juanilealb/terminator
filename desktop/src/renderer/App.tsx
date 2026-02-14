import { useEffect, useState, type CSSProperties } from 'react'
import { Allotment } from 'allotment'
import type { ThemeChangedPayload, ThemePreference } from '@shared/ipc-channels'
import { formatShortcut } from '@shared/platform'
import { SHORTCUT_MAP } from '@shared/shortcuts'
import 'allotment/dist/style.css'
import { useAppStore } from './store/app-store'
import { Sidebar } from './components/Sidebar/Sidebar'
import { TabBar } from './components/TabBar/TabBar'
import { TerminalPanel } from './components/Terminal/TerminalPanel'
import { FileEditor } from './components/Editor/FileEditor'
import { DiffViewer } from './components/Editor/DiffEditor'
import { RightPanel } from './components/RightPanel/RightPanel'
import { SettingsPanel } from './components/Settings/SettingsPanel'
import { AutomationsPanel } from './components/Automations/AutomationsPanel'
import { QuickOpen } from './components/QuickOpen/QuickOpen'
import { CommandPalette } from './components/CommandPalette/CommandPalette'
import { ToastContainer } from './components/Toast/Toast'
import { useShortcuts } from './hooks/useShortcuts'
import { usePrStatusPoller } from './hooks/usePrStatusPoller'
import styles from './App.module.css'

const DEFAULT_THEME: ThemeChangedPayload = {
  dark: true,
  accentColor: '#58abff',
}

function hexToRgba(hex: string, alpha: number): string | null {
  const cleaned = hex.trim().replace(/^#/, '')
  if (!/^[0-9a-fA-F]{6}$/.test(cleaned)) return null
  const r = Number.parseInt(cleaned.slice(0, 2), 16)
  const g = Number.parseInt(cleaned.slice(2, 4), 16)
  const b = Number.parseInt(cleaned.slice(4, 6), 16)
  if ([r, g, b].some((value) => Number.isNaN(value))) return null
  return `rgba(${r}, ${g}, ${b}, ${alpha})`
}

function applyThemeToDocument(theme: ThemeChangedPayload, preference: ThemePreference): void {
  const isDark = preference === 'system' ? theme.dark : preference === 'dark'
  const root = document.documentElement
  root.dataset.theme = isDark ? 'dark' : 'light'

  root.style.setProperty('--accent-system', theme.accentColor)
  root.style.setProperty('--accent-blue', theme.accentColor)

  const accentDim = hexToRgba(theme.accentColor, 0.22)
  const accentGlow = hexToRgba(theme.accentColor, 0.26)
  if (accentDim) root.style.setProperty('--accent-blue-dim', accentDim)
  if (accentGlow) root.style.setProperty('--accent-blue-glow', accentGlow)
}

export function App() {
  useShortcuts()
  usePrStatusPoller()
  const [osTheme, setOsTheme] = useState<ThemeChangedPayload>(DEFAULT_THEME)

  // Listen for workspace notification signals from Claude Code hooks
  useEffect(() => {
    const unsub = window.api.claude.onNotifyWorkspace(({ workspaceId, reason }) => {
      const state = useAppStore.getState()
      if (workspaceId !== state.activeWorkspaceId) {
        state.markWorkspaceUnread(workspaceId)
        return
      }

      const workspaceName = state.workspaces.find((ws) => ws.id === workspaceId)?.name ?? workspaceId
      const message = reason === 'waiting_input'
        ? `Agent waiting for your input in ${workspaceName}`
        : `Agent completed in ${workspaceName}`
      state.addToast({ id: crypto.randomUUID(), message, type: 'info' })
    })
    return unsub
  }, [])

  useEffect(() => {
    const unsub = window.api.app.onActivateWorkspace((workspaceId: string) => {
      const state = useAppStore.getState()
      if (state.workspaces.some((w) => w.id === workspaceId)) {
        state.setActiveWorkspace(workspaceId)
      }
    })
    return unsub
  }, [])

  useEffect(() => {
    const unsub = window.api.app.onOpenDirectory((dirPath: string) => {
      void useAppStore.getState().openDirectory(dirPath)
    })
    return unsub
  }, [])

  // Listen for agent activity updates (Claude hooks + Codex submit/notify markers)
  useEffect(() => {
    const unsub = window.api.claude.onActivityUpdate((snapshot) => {
      useAppStore.getState().setClaudeActivitySnapshot(snapshot)
    })
    return unsub
  }, [])

  const {
    tabs: allTabs,
    activeTabId,
    rightPanelOpen,
    sidebarCollapsed,
    activeWorkspaceTabs,
    workspaces,
    activeWorkspaceId,
    settings,
    settingsOpen,
    automationsOpen,
    quickOpenVisible,
    commandPaletteVisible,
    runningAgentCount,
    waitingAgentCount,
  } = useAppStore()
  const unreadWorkspaceCount = useAppStore((s) => s.unreadWorkspaceIds.size)

  const wsTabs = activeWorkspaceTabs()
  const activeTab = wsTabs.find((t) => t.id === activeTabId)
  const workspace = workspaces.find((w) => w.id === activeWorkspaceId)
  const activeAgents = runningAgentCount
  const waitingAgents = waitingAgentCount
  const appStyle = {
    '--window-controls-width': '0px',
    '--window-controls-width-tabbar': '0px',
    '--window-controls-width-right-panel': '0px',
  } as CSSProperties

  // All terminal tabs across every workspace — kept alive to preserve PTY state
  const allTerminals = allTabs.filter((t): t is Extract<typeof t, { type: 'terminal' }> => t.type === 'terminal')

  useEffect(() => {
    window.api.app.setUnreadCount(unreadWorkspaceCount)
  }, [unreadWorkspaceCount])

  useEffect(() => {
    const unsub = window.api.app.onThemeChanged((payload) => {
      setOsTheme(payload)
    })
    return unsub
  }, [])

  useEffect(() => {
    window.api.app.setThemePreference(settings.themePreference)
  }, [settings.themePreference])

  useEffect(() => {
    applyThemeToDocument(osTheme, settings.themePreference)
  }, [osTheme, settings.themePreference])

  return (
    <div className={styles.app} style={appStyle}>
      <div className={styles.layout}>
        {settingsOpen ? (
          <SettingsPanel />
        ) : automationsOpen ? (
          <AutomationsPanel />
        ) : (
          <Allotment>
            {/* Sidebar */}
            {!sidebarCollapsed && (
              <Allotment.Pane minSize={180} maxSize={420} preferredSize={240}>
                <Sidebar />
              </Allotment.Pane>
            )}

            {/* Center */}
            <Allotment.Pane>
              <div className={styles.centerPanel}>
                <TabBar />
                <div className={styles.contentArea}>
                  {/* Keep ALL terminal panels alive across workspaces so PTY
                      state (scrollback, TUI layout) is never lost */}
                  {allTerminals.map((t) => (
                    <TerminalPanel
                      key={t.id}
                      ptyId={t.ptyId}
                      active={t.id === activeTabId}
                    />
                  ))}

                  {!activeTab ? (
                    <div className={styles.welcome}>
                      <div className={styles.welcomeLogo}>terminator</div>
                      <div className={styles.welcomeHint}>
                        Add a project to get started, or press
                        <span className={styles.welcomeShortcut}>
                          <kbd>{formatShortcut(SHORTCUT_MAP.newTerminal.mac, SHORTCUT_MAP.newTerminal.win)}</kbd>
                        </span>
                        for a new terminal
                      </div>
                    </div>
                  ) : (
                    <>
                      {/* Render active file editor */}
                      {activeTab?.type === 'file' && (
                        <FileEditor
                          key={activeTab.id}
                          tabId={activeTab.id}
                          filePath={activeTab.filePath}
                          active={true}
                        />
                      )}

                      {/* Render active diff viewer */}
                      {activeTab?.type === 'diff' && workspace && (
                        <DiffViewer
                          key={activeTab.id}
                          worktreePath={workspace.worktreePath}
                          active={true}
                        />
                      )}
                    </>
                  )}
                </div>
              </div>
            </Allotment.Pane>

            {/* Right Panel */}
            {rightPanelOpen && (
              <Allotment.Pane minSize={200} maxSize={500} preferredSize={280}>
                <RightPanel />
              </Allotment.Pane>
            )}
          </Allotment>
        )}
      </div>
      <div className={styles.statusBar}>
        <div className={styles.statusGroup}>
          <div className={styles.statusItem}>
            <span className={`${styles.dot} ${styles.dotConnected}`} />
            <span>Workspace</span>
          </div>
          <div className={styles.statusItem}>
            <span>{workspace ? workspace.name : 'No workspace selected'}</span>
          </div>
          {workspace?.branch && (
            <div className={styles.statusItem}>
              <span>{workspace.branch}</span>
            </div>
          )}
        </div>
        <div className={styles.statusGroup}>
          <div className={styles.statusItem}>
            <span>{wsTabs.length} tabs</span>
          </div>
          <div className={styles.statusItem}>
            <span className={`${styles.dot} ${activeAgents > 0 ? styles.dotConnected : styles.dotIdle}`} />
            <span>
              {activeAgents > 0
                ? `${activeAgents} agents running`
                : waitingAgents > 0
                  ? `${waitingAgents} waiting for input`
                  : 'Agents idle'}
            </span>
          </div>
        </div>
      </div>
      {quickOpenVisible && workspace && (
        <QuickOpen worktreePath={workspace.worktreePath} />
      )}
      {commandPaletteVisible && <CommandPalette />}
      <ToastContainer />
    </div>
  )
}
