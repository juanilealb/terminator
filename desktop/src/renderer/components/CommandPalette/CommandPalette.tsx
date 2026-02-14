import { useEffect, useMemo, useState } from 'react'
import { useFocusTrap } from '../../hooks/useFocusTrap'
import { useAppStore } from '../../store/app-store'
import { expandPromptTemplate, normalizePreviewUrl } from '../../utils/prompt-template'
import styles from './CommandPalette.module.css'

interface CommandAction {
  id: string
  title: string
  description: string
  keywords: string[]
  run: () => Promise<void> | void
}

function scoreCommand(query: string, action: CommandAction): number {
  if (!query) return 0
  const haystack = `${action.title} ${action.description} ${action.keywords.join(' ')}`.toLowerCase()
  const q = query.toLowerCase()
  if (haystack.startsWith(q)) return 0
  if (haystack.includes(q)) return 1
  return 999
}

export function CommandPalette() {
  const panelRef = useFocusTrap<HTMLDivElement>()
  const [query, setQuery] = useState('')
  const [selectedIndex, setSelectedIndex] = useState(0)
  const {
    workspaces,
    activeWorkspaceId,
    rightPanelOpen,
    settings,
    tabs,
    activeTabId,
    setActiveWorkspace,
    setRightPanelMode,
    toggleRightPanel,
    toggleSidebar,
    createTerminalForActiveWorkspace,
    focusOrCreateTerminal,
    openWorkspaceDialog,
    activeProject,
    toggleSettings,
    toggleQuickOpen,
    addToast,
    closeCommandPalette,
    setPreviewUrl,
  } = useAppStore()

  const workspace = workspaces.find((w) => w.id === activeWorkspaceId)

  const ensureRightPanelMode = (mode: 'files' | 'changes' | 'memory' | 'preview') => {
    setRightPanelMode(mode)
    if (!rightPanelOpen) toggleRightPanel()
  }

  const insertTemplateIntoTerminal = async (templateContent: string, templateName: string) => {
    const expanded = await expandPromptTemplate(templateContent, workspace)
    let terminalTab = tabs.find((t) => t.id === activeTabId && t.type === 'terminal')

    if (!terminalTab || (workspace && terminalTab.workspaceId !== workspace.id)) {
      const workspaceTerminal = workspace
        ? tabs.find((t) => t.type === 'terminal' && t.workspaceId === workspace.id)
        : null
      if (workspaceTerminal) {
        terminalTab = workspaceTerminal
      } else {
        if (workspace) setActiveWorkspace(workspace.id)
        await createTerminalForActiveWorkspace()
        const latest = useAppStore.getState()
        const created = latest.tabs.find((t) => t.id === latest.activeTabId)
        terminalTab = created?.type === 'terminal' ? created : undefined
      }
    }

    if (!terminalTab) {
      addToast({ id: crypto.randomUUID(), message: 'No terminal available for template insertion', type: 'error' })
      return
    }

    window.api.pty.write(terminalTab.ptyId, `\x1b[200~${expanded}\x1b[201~`)
    addToast({
      id: crypto.randomUUID(),
      message: `Template "${templateName}" inserted into terminal`,
      type: 'info',
    })
  }

  const actionList = useMemo<CommandAction[]>(() => {
    const actions: CommandAction[] = [
      {
        id: 'new-terminal',
        title: 'New terminal',
        description: 'Open a terminal in the active workspace or quick-start from a folder',
        keywords: ['terminal', '/terminal', '/t', 'quick'],
        run: async () => createTerminalForActiveWorkspace(),
      },
      {
        id: 'focus-terminal',
        title: 'Focus terminal',
        description: 'Focus first terminal tab or create one',
        keywords: ['terminal', 'focus', '/focus'],
        run: async () => focusOrCreateTerminal(),
      },
      {
        id: 'quick-open',
        title: 'Quick open file',
        description: 'Open file picker for the active workspace',
        keywords: ['file', 'open', '/open'],
        run: () => toggleQuickOpen(),
      },
      {
        id: 'open-settings',
        title: 'Open settings',
        description: 'Toggle settings panel',
        keywords: ['settings', 'preferences', '/settings'],
        run: () => toggleSettings(),
      },
      {
        id: 'new-workspace',
        title: 'New workspace',
        description: 'Open create workspace dialog',
        keywords: ['workspace', '/workspace'],
        run: () => {
          const project = activeProject()
          if (project) {
            openWorkspaceDialog(project.id)
            return
          }
          if (useAppStore.getState().projects.length === 1) {
            openWorkspaceDialog(useAppStore.getState().projects[0].id)
            return
          }
          addToast({ id: crypto.randomUUID(), message: 'Select a project first', type: 'info' })
        },
      },
      {
        id: 'toggle-sidebar',
        title: 'Toggle sidebar',
        description: 'Show or hide project/workspace sidebar',
        keywords: ['sidebar', '/sidebar'],
        run: () => toggleSidebar(),
      },
      {
        id: 'panel-files',
        title: 'Show files panel',
        description: 'Open right panel in Files mode',
        keywords: ['files', '/files'],
        run: () => ensureRightPanelMode('files'),
      },
      {
        id: 'panel-changes',
        title: 'Show changes panel',
        description: 'Open right panel in Changes mode',
        keywords: ['changes', '/changes', 'git'],
        run: () => ensureRightPanelMode('changes'),
      },
      {
        id: 'panel-memory',
        title: 'Show memory panel',
        description: 'Open workspace memory and snapshots',
        keywords: ['memory', '/memory', 'notes'],
        run: () => ensureRightPanelMode('memory'),
      },
      {
        id: 'panel-preview',
        title: 'Show preview panel',
        description: 'Open local preview panel',
        keywords: ['preview', '/preview'],
        run: () => ensureRightPanelMode('preview'),
      },
    ]

    if (workspace) {
      actions.push({
        id: 'snapshot-create',
        title: 'Create snapshot',
        description: 'Save current workspace state without cleaning working tree',
        keywords: ['snapshot', '/snapshot', 'stash'],
        run: async () => {
          const created = await window.api.git.createSnapshot(workspace.worktreePath, 'Snapshot')
          if (!created) {
            addToast({ id: crypto.randomUUID(), message: 'No local changes to snapshot', type: 'info' })
            return
          }
          addToast({ id: crypto.randomUUID(), message: `Snapshot created: ${created.label}`, type: 'info' })
        },
      })
      actions.push({
        id: 'snapshot-restore-latest',
        title: 'Restore latest snapshot',
        description: 'Apply the latest snapshot on top of current files',
        keywords: ['snapshot', 'restore', '/restore-latest'],
        run: async () => {
          const snapshots = await window.api.git.listSnapshots(workspace.worktreePath)
          const latest = snapshots[0]
          if (!latest) {
            addToast({ id: crypto.randomUUID(), message: 'No snapshots available', type: 'info' })
            return
          }
          await window.api.git.restoreSnapshot(workspace.worktreePath, latest.ref)
          addToast({ id: crypto.randomUUID(), message: `Snapshot restored: ${latest.label}`, type: 'info' })
        },
      })
    }

    for (const template of settings.promptTemplates) {
      actions.push({
        id: `template-${template.id}`,
        title: `Run template: ${template.name}`,
        description: 'Expand mentions and insert into terminal',
        keywords: ['template', '/template', template.name.toLowerCase()],
        run: async () => {
          await insertTemplateIntoTerminal(template.content, template.name)
        },
      })
    }

    return actions
  }, [
    workspace,
    settings.promptTemplates,
    activeProject,
    createTerminalForActiveWorkspace,
    focusOrCreateTerminal,
    toggleQuickOpen,
    toggleSettings,
    toggleSidebar,
    openWorkspaceDialog,
    addToast,
    setActiveWorkspace,
    tabs,
    activeTabId,
    rightPanelOpen,
  ])

  const filtered = useMemo(() => {
    const trimmed = query.trim()
    const ranked = actionList
      .map((action) => ({ action, score: scoreCommand(trimmed, action) }))
      .filter((entry) => entry.score < 999)
      .sort((a, b) => a.score - b.score || a.action.title.localeCompare(b.action.title))
      .map((entry) => entry.action)
    return ranked.slice(0, 24)
  }, [actionList, query])

  useEffect(() => {
    setSelectedIndex(0)
  }, [query])

  const executeSlashCommand = async (): Promise<boolean> => {
    const trimmed = query.trim()
    if (!trimmed.startsWith('/')) return false

    const body = trimmed.slice(1)
    const [commandRaw, ...rest] = body.split(/\s+/)
    const command = commandRaw.toLowerCase()
    const arg = rest.join(' ').trim()

    if (command === 'terminal' || command === 't') {
      await createTerminalForActiveWorkspace()
      return true
    }
    if (command === 'files') {
      ensureRightPanelMode('files')
      return true
    }
    if (command === 'changes') {
      ensureRightPanelMode('changes')
      return true
    }
    if (command === 'memory') {
      ensureRightPanelMode('memory')
      return true
    }
    if (command === 'preview') {
      ensureRightPanelMode('preview')
      return true
    }
    if (command === 'preview-url') {
      if (!workspace) {
        addToast({ id: crypto.randomUUID(), message: 'Select a workspace first', type: 'info' })
        return true
      }
      const normalized = normalizePreviewUrl(arg)
      if (!normalized) {
        addToast({ id: crypto.randomUUID(), message: 'Usage: /preview-url 3000', type: 'info' })
        return true
      }
      setPreviewUrl(workspace.id, normalized)
      ensureRightPanelMode('preview')
      return true
    }
    if (command === 'snapshot') {
      if (!workspace) {
        addToast({ id: crypto.randomUUID(), message: 'Select a workspace first', type: 'info' })
        return true
      }
      const created = await window.api.git.createSnapshot(workspace.worktreePath, arg || 'Snapshot')
      if (!created) {
        addToast({ id: crypto.randomUUID(), message: 'No local changes to snapshot', type: 'info' })
        return true
      }
      addToast({ id: crypto.randomUUID(), message: `Snapshot created: ${created.label}`, type: 'info' })
      return true
    }
    if (command === 'restore-latest') {
      if (!workspace) {
        addToast({ id: crypto.randomUUID(), message: 'Select a workspace first', type: 'info' })
        return true
      }
      const snapshots = await window.api.git.listSnapshots(workspace.worktreePath)
      const latest = snapshots[0]
      if (!latest) {
        addToast({ id: crypto.randomUUID(), message: 'No snapshots available', type: 'info' })
        return true
      }
      await window.api.git.restoreSnapshot(workspace.worktreePath, latest.ref)
      addToast({ id: crypto.randomUUID(), message: `Snapshot restored: ${latest.label}`, type: 'info' })
      return true
    }
    if (command === 'template') {
      if (!arg) {
        addToast({ id: crypto.randomUUID(), message: 'Usage: /template <name>', type: 'info' })
        return true
      }
      const template = settings.promptTemplates.find((t) => t.name.toLowerCase().includes(arg.toLowerCase()))
      if (!template) {
        addToast({ id: crypto.randomUUID(), message: `Template "${arg}" not found`, type: 'error' })
        return true
      }
      await insertTemplateIntoTerminal(template.content, template.name)
      return true
    }
    if (command === 'help') {
      addToast({
        id: crypto.randomUUID(),
        message: 'Slash commands: /terminal /files /changes /memory /preview /preview-url /snapshot /restore-latest /template',
        type: 'info',
      })
      return true
    }

    return false
  }

  const executeSelected = async () => {
    if (await executeSlashCommand()) {
      closeCommandPalette()
      return
    }
    const action = filtered[selectedIndex]
    if (!action) return
    await action.run()
    closeCommandPalette()
  }

  return (
    <div className={styles.overlay} onClick={closeCommandPalette}>
      <div
        ref={panelRef}
        className={styles.panel}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="Command palette"
        tabIndex={-1}
      >
        <div className={styles.inputWrap}>
          <input
            className={styles.input}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={async (e) => {
              if (e.key === 'Escape') {
                e.preventDefault()
                closeCommandPalette()
                return
              }
              if (e.key === 'ArrowDown') {
                e.preventDefault()
                if (filtered.length > 0) setSelectedIndex((i) => Math.min(i + 1, filtered.length - 1))
                return
              }
              if (e.key === 'ArrowUp') {
                e.preventDefault()
                if (filtered.length > 0) setSelectedIndex((i) => Math.max(i - 1, 0))
                return
              }
              if (e.key === 'Enter') {
                e.preventDefault()
                await executeSelected()
              }
            }}
            placeholder="Type a command, or use /slash commands"
            autoFocus
          />
        </div>
        <div className={styles.results}>
          {filtered.length === 0 ? (
            <div className={styles.empty}>No matching commands</div>
          ) : (
            filtered.map((action, index) => (
              <button
                key={action.id}
                className={`${styles.resultItem} ${index === selectedIndex ? styles.selected : ''}`}
                onMouseEnter={() => setSelectedIndex(index)}
                onClick={async () => {
                  setSelectedIndex(index)
                  await action.run()
                  closeCommandPalette()
                }}
              >
                <span className={styles.resultTitle}>{action.title}</span>
                <span className={styles.resultDescription}>{action.description}</span>
              </button>
            ))
          )}
        </div>
      </div>
    </div>
  )
}
