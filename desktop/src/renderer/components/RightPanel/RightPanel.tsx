import { useCallback, useEffect, useState } from 'react'
import { formatShortcut } from '@shared/platform'
import { SHORTCUT_MAP } from '@shared/shortcuts'
import { useAppStore } from '../../store/app-store'
import { FileTree } from './FileTree'
import { ChangedFiles } from './ChangedFiles'
import { WorkspaceMemoryPanel } from './WorkspaceMemoryPanel'
import { PreviewPanel } from './PreviewPanel'
import { Tooltip } from '../Tooltip/Tooltip'
import styles from './RightPanel.module.css'

export function RightPanel() {
  const {
    rightPanelMode,
    setRightPanelMode,
    activeWorkspaceId,
    workspaces,
    previewUrlByWorkspace,
    setPreviewUrl,
  } = useAppStore()
  const [changeCount, setChangeCount] = useState(0)

  const workspace = workspaces.find((w) => w.id === activeWorkspaceId)
  const worktreePath = workspace?.worktreePath
  const previewUrl = workspace ? (previewUrlByWorkspace[workspace.id] ?? '') : ''

  const refreshChangeCount = useCallback(() => {
    if (!worktreePath) {
      setChangeCount(0)
      return
    }
    window.api.git.getStatus(worktreePath).then((statuses) => {
      setChangeCount(statuses.length)
    }).catch(() => {
      setChangeCount(0)
    })
  }, [worktreePath])

  useEffect(() => {
    if (!worktreePath) {
      setChangeCount(0)
      return
    }
    refreshChangeCount()

    window.api.fs.watchDir(worktreePath)
    const unsub = window.api.fs.onDirChanged((changedPath: string) => {
      if (changedPath === worktreePath) refreshChangeCount()
    })

    return () => {
      unsub()
      window.api.fs.unwatchDir(worktreePath)
    }
  }, [worktreePath, refreshChangeCount])

  return (
    <div className={styles.rightPanel}>
      <div className={styles.header}>
        <div className={styles.modeToggle}>
          <Tooltip
            label="Files"
            shortcut={formatShortcut(SHORTCUT_MAP.filesPanel.mac, SHORTCUT_MAP.filesPanel.win)}
          >
            <button
              className={`${styles.modeButton} ${rightPanelMode === 'files' ? styles.active : ''}`}
              onClick={() => setRightPanelMode('files')}
            >
              Files
            </button>
          </Tooltip>
          <Tooltip
            label="Changes"
            shortcut={formatShortcut(SHORTCUT_MAP.changesPanel.mac, SHORTCUT_MAP.changesPanel.win)}
          >
            <button
              className={`${styles.modeButton} ${rightPanelMode === 'changes' ? styles.active : ''}`}
              onClick={() => setRightPanelMode('changes')}
            >
              Changes
              {changeCount > 0 && (
                <span className={styles.countBadge}>{changeCount}</span>
              )}
            </button>
          </Tooltip>
          <Tooltip
            label="Memory"
            shortcut={formatShortcut(SHORTCUT_MAP.memoryPanel.mac, SHORTCUT_MAP.memoryPanel.win)}
          >
            <button
              className={`${styles.modeButton} ${rightPanelMode === 'memory' ? styles.active : ''}`}
              onClick={() => setRightPanelMode('memory')}
            >
              Memory
            </button>
          </Tooltip>
          <Tooltip
            label="Preview"
            shortcut={formatShortcut(SHORTCUT_MAP.previewPanel.mac, SHORTCUT_MAP.previewPanel.win)}
          >
            <button
              className={`${styles.modeButton} ${rightPanelMode === 'preview' ? styles.active : ''}`}
              onClick={() => setRightPanelMode('preview')}
            >
              Preview
            </button>
          </Tooltip>
        </div>
      </div>

      <div className={styles.content}>
        {!workspace ? (
          <div className={styles.emptyState}>
            <span className={styles.emptyIcon}>[ ]</span>
            <span className={styles.emptyText}>
              Select a workspace to browse files, snapshots, and preview
            </span>
          </div>
        ) : (
          <>
            <div style={{ display: rightPanelMode === 'files' ? 'contents' : 'none' }}>
              <FileTree worktreePath={workspace.worktreePath} isActive={rightPanelMode === 'files'} />
            </div>
            <div style={{ display: rightPanelMode === 'changes' ? 'contents' : 'none' }}>
              <ChangedFiles
                worktreePath={workspace.worktreePath}
                workspaceId={workspace.id}
                isActive={rightPanelMode === 'changes'}
              />
            </div>
            <div style={{ display: rightPanelMode === 'memory' ? 'contents' : 'none' }}>
              <WorkspaceMemoryPanel workspace={workspace} />
            </div>
            <div style={{ display: rightPanelMode === 'preview' ? 'contents' : 'none' }}>
              <PreviewPanel
                previewUrl={previewUrl}
                onChangeUrl={(url) => setPreviewUrl(workspace.id, url)}
              />
            </div>
          </>
        )}
      </div>
    </div>
  )
}
