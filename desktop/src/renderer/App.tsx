import { useEffect, type CSSProperties } from 'react'
import { Allotment } from 'allotment'
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

export function App() {
  useShortcuts()
  usePrStatusPoller()

  // Listen for workspace notification signals from Claude Code hooks
  useEffect(() => {
    const unsub = window.api.claude.onNotifyWorkspace((workspaceId: string) => {
      const state = useAppStore.getState()
      if (workspaceId !== state.activeWorkspaceId) {
        state.markWorkspaceUnread(workspaceId)
      }
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

  // Listen for agent activity updates (Claude hooks + Codex submit/notify markers)
  useEffect(() => {
    let prevActive = new Set<string>()
    const unsub = window.api.claude.onActivityUpdate((workspaceIds: string[]) => {
      const nextActive = new Set(workspaceIds)
      const state = useAppStore.getState()

      // Fallback unread signal on activity completion:
      // if a workspace was active and is now inactive, mark unread unless it's open.
      for (const wsId of prevActive) {
        if (!nextActive.has(wsId) && wsId !== state.activeWorkspaceId && state.workspaces.some((w) => w.id === wsId)) {
          state.markWorkspaceUnread(wsId)
        }
      }

      state.setActiveClaudeWorkspaces(workspaceIds)
      prevActive = nextActive
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
    settingsOpen,
    automationsOpen,
    quickOpenVisible,
    commandPaletteVisible,
    activeClaudeWorkspaceIds,
  } = useAppStore()

  const wsTabs = activeWorkspaceTabs()
  const activeTab = wsTabs.find((t) => t.id === activeTabId)
  const workspace = workspaces.find((w) => w.id === activeWorkspaceId)
  const activeAgents = activeClaudeWorkspaceIds.size
  const isWindows = navigator.userAgent.toLowerCase().includes('windows')
  const windowControlsWidth = isWindows ? '138px' : '0px'
  const appStyle = {
    '--window-controls-width': windowControlsWidth,
    '--window-controls-width-tabbar': rightPanelOpen ? '0px' : windowControlsWidth,
    '--window-controls-width-right-panel': rightPanelOpen ? windowControlsWidth : '0px',
  } as CSSProperties

  // All terminal tabs across every workspace — kept alive to preserve PTY state
  const allTerminals = allTabs.filter((t): t is Extract<typeof t, { type: 'terminal' }> => t.type === 'terminal')

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
            <span>{activeAgents > 0 ? `${activeAgents} agents running` : 'Agents idle'}</span>
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
