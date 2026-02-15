import { useCallback, useEffect, useMemo, useState } from 'react'
import type { Workspace } from '../../store/types'
import { useAppStore } from '../../store/app-store'
import { expandPromptTemplate } from '../../utils/prompt-template'
import styles from './RightPanel.module.css'

interface Snapshot {
  ref: string
  label: string
  createdAt: number
}

interface Props {
  workspace: Workspace
}

function formatSnapshotDate(unixSeconds: number): string {
  const date = new Date(unixSeconds * 1000)
  return date.toLocaleString()
}

export function WorkspaceMemoryPanel({ workspace }: Props) {
  const {
    settings,
    tabs,
    activeTabId,
    updateWorkspaceMemory,
    setActiveWorkspace,
    setActiveTab,
    createTerminalForActiveWorkspace,
    addToast,
    showConfirmDialog,
    dismissConfirmDialog,
  } = useAppStore()

  const [snapshotLabel, setSnapshotLabel] = useState('')
  const [snapshots, setSnapshots] = useState<Snapshot[]>([])
  const [loadingSnapshots, setLoadingSnapshots] = useState(false)

  const workspaceTabs = useMemo(
    () => tabs.filter((tab) => tab.workspaceId === workspace.id),
    [tabs, workspace.id]
  )

  const refreshSnapshots = useCallback(async () => {
    setLoadingSnapshots(true)
    try {
      const data = await window.api.git.listSnapshots(workspace.worktreePath)
      setSnapshots(data)
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to load snapshots'
      addToast({ id: crypto.randomUUID(), message: msg, type: 'error' })
    } finally {
      setLoadingSnapshots(false)
    }
  }, [workspace.worktreePath, addToast])

  useEffect(() => {
    refreshSnapshots()
  }, [refreshSnapshots])

  const findTerminalForWorkspace = useCallback(async () => {
    const active = tabs.find((tab) => tab.id === activeTabId)
    if (active?.type === 'terminal' && active.workspaceId === workspace.id) {
      return active
    }

    const existing = workspaceTabs.find((tab) => tab.type === 'terminal')
    if (existing?.type === 'terminal') {
      setActiveWorkspace(workspace.id)
      setActiveTab(existing.id)
      return existing
    }

    setActiveWorkspace(workspace.id)
    await createTerminalForActiveWorkspace()
    const latest = useAppStore.getState()
    const created = latest.tabs.find((tab) => tab.id === latest.activeTabId)
    if (created?.type === 'terminal' && created.workspaceId === workspace.id) {
      return created
    }
    return null
  }, [
    tabs,
    activeTabId,
    workspace.id,
    workspaceTabs,
    setActiveWorkspace,
    setActiveTab,
    createTerminalForActiveWorkspace,
  ])

  const sendTemplateToTerminal = useCallback(
    async (templateName: string, templateContent: string) => {
      const terminal = await findTerminalForWorkspace()
      if (!terminal) {
        addToast({
          id: crypto.randomUUID(),
          message: 'Could not open a terminal for this workspace',
          type: 'error',
        })
        return
      }

      const expanded = await expandPromptTemplate(templateContent, workspace)
      window.api.pty.write(terminal.ptyId, `\x1b[200~${expanded}\x1b[201~`)
      addToast({
        id: crypto.randomUUID(),
        message: `Template "${templateName}" inserted into terminal`,
        type: 'info',
      })
      // Focus terminal so the user can press Enter immediately
      setTimeout(() => {
        const termEl = document.querySelector('[class*="terminalInner"] .xterm textarea') as HTMLElement | null
        termEl?.focus()
      }, 100)
    },
    [findTerminalForWorkspace, addToast, workspace]
  )

  const handleCreateSnapshot = useCallback(async () => {
    try {
      const created = await window.api.git.createSnapshot(workspace.worktreePath, snapshotLabel)
      if (!created) {
        addToast({
          id: crypto.randomUUID(),
          message: 'No local changes to snapshot',
          type: 'info',
        })
        return
      }
      setSnapshotLabel('')
      addToast({
        id: crypto.randomUUID(),
        message: `Snapshot created: ${created.label}`,
        type: 'info',
      })
      await refreshSnapshots()
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to create snapshot'
      addToast({ id: crypto.randomUUID(), message: msg, type: 'error' })
    }
  }, [workspace.worktreePath, snapshotLabel, refreshSnapshots, addToast])

  const restoreSnapshot = useCallback(
    (snapshot: Snapshot) => {
      showConfirmDialog({
        title: 'Restore snapshot',
        message: `Apply snapshot "${snapshot.label}" to current workspace?`,
        confirmLabel: 'Restore',
        destructive: true,
        onConfirm: async () => {
          dismissConfirmDialog()
          try {
            await window.api.git.restoreSnapshot(workspace.worktreePath, snapshot.ref)
            addToast({
              id: crypto.randomUUID(),
              message: `Snapshot restored: ${snapshot.label}`,
              type: 'info',
            })
          } catch (err) {
            const msg = err instanceof Error ? err.message : 'Failed to restore snapshot'
            addToast({ id: crypto.randomUUID(), message: msg, type: 'error' })
          }
        },
      })
    },
    [workspace.worktreePath, showConfirmDialog, dismissConfirmDialog, addToast]
  )

  const deleteSnapshot = useCallback(
    (snapshot: Snapshot) => {
      showConfirmDialog({
        title: 'Delete snapshot',
        message: `Delete snapshot "${snapshot.label}"?`,
        confirmLabel: 'Delete',
        destructive: true,
        onConfirm: async () => {
          dismissConfirmDialog()
          try {
            await window.api.git.dropSnapshot(workspace.worktreePath, snapshot.ref)
            addToast({
              id: crypto.randomUUID(),
              message: `Snapshot deleted: ${snapshot.label}`,
              type: 'info',
            })
            await refreshSnapshots()
          } catch (err) {
            const msg = err instanceof Error ? err.message : 'Failed to delete snapshot'
            addToast({ id: crypto.randomUUID(), message: msg, type: 'error' })
          }
        },
      })
    },
    [workspace.worktreePath, showConfirmDialog, dismissConfirmDialog, refreshSnapshots, addToast]
  )

  return (
    <div className={styles.memoryPanel}>
      <div className={styles.memorySection}>
        <div className={styles.memoryTitle}>Workspace memory</div>
        <textarea
          className={styles.memoryInput}
          placeholder="Persistent notes, constraints, links, and reminders for this workspace..."
          value={workspace.memory ?? ''}
          onChange={(e) => updateWorkspaceMemory(workspace.id, e.target.value)}
        />
      </div>

      <div className={styles.memorySection}>
        <div className={styles.memoryTitle}>Prompt templates</div>
        {settings.promptTemplates.length === 0 ? (
          <div className={styles.memoryEmpty}>No prompt templates configured in settings</div>
        ) : (
          <div className={styles.templateList}>
            {settings.promptTemplates.map((template) => (
              <button
                key={template.id}
                className={styles.templateButton}
                onClick={() => sendTemplateToTerminal(template.name, template.content)}
                title={template.content}
              >
                {template.name}
              </button>
            ))}
          </div>
        )}
      </div>

      <div className={styles.memorySection}>
        <div className={styles.memoryTitle}>Snapshots</div>
        <div className={styles.snapshotCreateRow}>
          <input
            className={styles.snapshotInput}
            placeholder="Snapshot label"
            value={snapshotLabel}
            onChange={(e) => setSnapshotLabel(e.target.value)}
          />
          <button className={styles.snapshotCreateButton} onClick={handleCreateSnapshot}>
            Save
          </button>
        </div>
        <div className={styles.snapshotList}>
          {loadingSnapshots && <div className={styles.memoryEmpty}>Loading snapshots...</div>}
          {!loadingSnapshots && snapshots.length === 0 && (
            <div className={styles.memoryEmpty}>No snapshots yet</div>
          )}
          {snapshots.map((snapshot) => (
            <div key={snapshot.ref} className={styles.snapshotItem}>
              <div className={styles.snapshotMeta}>
                <span className={styles.snapshotLabel}>{snapshot.label}</span>
                <span className={styles.snapshotDate}>{formatSnapshotDate(snapshot.createdAt)}</span>
              </div>
              <div className={styles.snapshotActions}>
                <button className={styles.snapshotActionButton} onClick={() => restoreSnapshot(snapshot)}>
                  Restore
                </button>
                <button className={styles.snapshotActionButton} onClick={() => deleteSnapshot(snapshot)}>
                  Delete
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
