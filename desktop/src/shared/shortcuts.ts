export interface ShortcutBinding {
  mac: string
  win: string
}

export const SHORTCUT_MAP: Record<string, ShortcutBinding> = {
  quickOpenFile: { mac: 'Cmd+P', win: 'Ctrl+P' },
  commandPalette: { mac: 'Shift+Cmd+P', win: 'Ctrl+Shift+P' },
  newTerminal: { mac: 'Cmd+T', win: 'Ctrl+T' },
  closeTab: { mac: 'Cmd+W', win: 'Ctrl+W' },
  closeAllTabs: { mac: 'Shift+Cmd+W', win: 'Ctrl+Shift+W' },
  nextTab: { mac: 'Shift+Cmd+]', win: 'Ctrl+Shift+]' },
  previousTab: { mac: 'Shift+Cmd+[', win: 'Ctrl+Shift+[' },
  tabOneToNine: { mac: 'Cmd+1..9', win: 'Ctrl+1..9' },
  nextWorkspace: { mac: 'Shift+Cmd+Down', win: 'Ctrl+Shift+Down' },
  previousWorkspace: { mac: 'Shift+Cmd+Up', win: 'Ctrl+Shift+Up' },
  newWorkspace: { mac: 'Cmd+N', win: 'Ctrl+N' },
  toggleSidebar: { mac: 'Cmd+B', win: 'Ctrl+B' },
  toggleRightPanel: { mac: 'Alt+Cmd+B', win: 'Ctrl+Alt+B' },
  filesPanel: { mac: 'Shift+Cmd+E', win: 'Ctrl+Shift+E' },
  changesPanel: { mac: 'Shift+Cmd+G', win: 'Ctrl+Shift+G' },
  memoryPanel: { mac: 'Shift+Cmd+M', win: 'Ctrl+Shift+M' },
  previewPanel: { mac: 'Shift+Cmd+V', win: 'Ctrl+Shift+V' },
  focusTerminal: { mac: 'Cmd+J', win: 'Ctrl+J' },
  increaseFontSize: { mac: 'Cmd++', win: 'Ctrl++' },
  decreaseFontSize: { mac: 'Cmd+-', win: 'Ctrl+-' },
  resetFontSize: { mac: 'Cmd+0', win: 'Ctrl+0' },
  settings: { mac: 'Cmd+,', win: 'Ctrl+,' },
  commitStagedChanges: { mac: 'Cmd+Enter', win: 'Ctrl+Enter' },
}
