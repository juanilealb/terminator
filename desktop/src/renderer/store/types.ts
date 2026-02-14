import type { PrInfo } from '@shared/github-types'
import type { AgentActivitySnapshot, ThemePreference } from '@shared/ipc-channels'

export interface StartupCommand {
  name: string
  command: string
}

export interface Automation {
  id: string
  name: string
  projectId: string
  prompt: string
  cronExpression: string
  enabled: boolean
  createdAt: number
  lastRunAt?: number
  lastRunStatus?: 'success' | 'failed' | 'timeout'
}

export interface Project {
  id: string
  name: string
  repoPath: string
  startupCommands?: StartupCommand[]
  prLinkProvider?: PrLinkProvider
}

export interface Workspace {
  id: string
  name: string
  branch: string
  worktreePath: string
  projectId: string
  automationId?: string
  memory?: string
}

export type Tab = {
  id: string
  workspaceId: string
} & (
  | { type: 'terminal'; title: string; ptyId: string }
  | { type: 'file'; filePath: string; unsaved?: boolean }
  | { type: 'diff' }
)

export type RightPanelMode = 'files' | 'changes' | 'memory' | 'preview'

export type PrLinkProvider = 'github' | 'graphite' | 'devinreview'

export interface PromptTemplate {
  id: string
  name: string
  content: string
}

export interface Settings {
  themePreference: ThemePreference
  confirmOnClose: boolean
  autoSaveOnBlur: boolean
  defaultShell: string
  defaultShellArgs: string
  restoreWorkspace: boolean
  diffInline: boolean
  terminalFontSize: number
  editorFontSize: number
  promptTemplates: PromptTemplate[]
}

export const DEFAULT_SETTINGS: Settings = {
  themePreference: 'system',
  confirmOnClose: true,
  autoSaveOnBlur: false,
  defaultShell: '',
  defaultShellArgs: '',
  restoreWorkspace: true,
  diffInline: false,
  terminalFontSize: 14,
  editorFontSize: 13,
  promptTemplates: [
    {
      id: 'template-plan',
      name: 'Plan',
      content: 'Create a practical implementation plan for @workspace on branch @branch. Constraints: keep changes incremental and test after each step.',
    },
    {
      id: 'template-review',
      name: 'Review',
      content: 'Review current changes in @workspace for regressions, risky assumptions, and missing tests. Summarize findings by severity.',
    },
  ],
}

export interface Toast {
  id: string
  message: string
  type: 'error' | 'info'
}

export interface ConfirmDialogState {
  title: string
  message: string
  confirmLabel?: string
  destructive?: boolean
  onConfirm: () => void
}

export interface AppState {
  // Data
  projects: Project[]
  workspaces: Workspace[]
  tabs: Tab[]
  automations: Automation[]
  activeWorkspaceId: string | null
  activeTabId: string | null
  lastActiveTabByWorkspace: Record<string, string>
  rightPanelMode: RightPanelMode
  rightPanelOpen: boolean
  sidebarCollapsed: boolean
  lastSavedTabId: string | null
  workspaceDialogProjectId: string | null
  settings: Settings
  settingsOpen: boolean
  automationsOpen: boolean
  confirmDialog: ConfirmDialogState | null
  toasts: Toast[]
  quickOpenVisible: boolean
  commandPaletteVisible: boolean
  unreadWorkspaceIds: Set<string>
  activeClaudeWorkspaceIds: Set<string>
  waitingClaudeWorkspaceIds: Set<string>
  runningAgentCount: number
  waitingAgentCount: number
  prStatusMap: Map<string, PrInfo | null>
  ghAvailability: Map<string, boolean>
  previewUrlByWorkspace: Record<string, string>

  // Actions
  addProject: (project: Project) => void
  removeProject: (id: string) => void
  addWorkspace: (workspace: Workspace) => void
  removeWorkspace: (id: string) => void
  setActiveWorkspace: (id: string | null) => void
  addTab: (tab: Tab) => void
  removeTab: (id: string) => void
  setActiveTab: (id: string | null) => void
  setRightPanelMode: (mode: RightPanelMode) => void
  toggleRightPanel: () => void
  toggleSidebar: () => void
  nextTab: () => void
  prevTab: () => void
  createTerminalForActiveWorkspace: () => Promise<void>
  openDirectory: (dirPath: string) => Promise<void>
  closeActiveTab: () => void
  setTabUnsaved: (tabId: string, unsaved: boolean) => void
  notifyTabSaved: (tabId: string) => void
  openFileTab: (filePath: string) => void
  openDiffTab: (workspaceId: string) => void
  nextWorkspace: () => void
  prevWorkspace: () => void
  switchToTabByIndex: (index: number) => void
  closeAllWorkspaceTabs: () => void
  focusOrCreateTerminal: () => Promise<void>
  openWorkspaceDialog: (projectId: string | null) => void
  renameWorkspace: (id: string, name: string) => void
  updateWorkspaceBranch: (id: string, branch: string) => void
  updateWorkspaceMemory: (id: string, memory: string) => void
  deleteWorkspace: (workspaceId: string) => Promise<void>
  updateProject: (id: string, partial: Partial<Omit<Project, 'id'>>) => void
  deleteProject: (projectId: string) => Promise<void>
  updateSettings: (partial: Partial<Settings>) => void
  toggleSettings: () => void
  toggleAutomations: () => void
  showConfirmDialog: (dialog: ConfirmDialogState) => void
  dismissConfirmDialog: () => void
  addToast: (toast: Toast) => void
  dismissToast: (id: string) => void
  toggleQuickOpen: () => void
  closeQuickOpen: () => void
  toggleCommandPalette: () => void
  openCommandPalette: () => void
  closeCommandPalette: () => void
  setPreviewUrl: (workspaceId: string, url: string) => void

  // Unread indicator actions
  markWorkspaceUnread: (workspaceId: string) => void
  clearWorkspaceUnread: (workspaceId: string) => void

  // Agent activity actions (Claude + Codex)
  setActiveClaudeWorkspaces: (workspaceIds: string[]) => void
  setClaudeActivitySnapshot: (snapshot: AgentActivitySnapshot) => void

  // PR status actions
  setPrStatuses: (projectId: string, statuses: Record<string, PrInfo | null>) => void
  setGhAvailability: (projectId: string, available: boolean) => void

  // Automation actions
  addAutomation: (automation: Automation) => void
  updateAutomation: (id: string, partial: Partial<Omit<Automation, 'id'>>) => void
  removeAutomation: (id: string) => void

  // Hydration
  hydrateState: (data: PersistedState) => void

  // Derived
  activeWorkspaceTabs: () => Tab[]
  activeProject: () => Project | undefined
}

export interface PersistedState {
  projects: Project[]
  workspaces: Workspace[]
  tabs?: Tab[]
  automations?: Automation[]
  activeWorkspaceId?: string | null
  activeTabId?: string | null
  lastActiveTabByWorkspace?: Record<string, string>
  settings?: Settings
  previewUrlByWorkspace?: Record<string, string>
}
