import { useEffect, useState, useCallback, useRef } from 'react'
import { basenameSafe, formatShortcut, toPosixPath } from '@shared/platform'
import { SHORTCUT_MAP } from '@shared/shortcuts'
import { useAppStore } from '../../store/app-store'
import { dispatchGitStatusChanged } from '../../utils/git-status-events'
import { Tooltip } from '../Tooltip/Tooltip'
import styles from './RightPanel.module.css'

interface FileStatus {
  path: string
  status: 'modified' | 'added' | 'deleted' | 'renamed' | 'untracked'
  staged: boolean
}

interface Props {
  worktreePath: string
  workspaceId: string
  isActive?: boolean
}

const STATUS_LABELS: Record<string, string> = {
  modified: 'M',
  added: 'A',
  deleted: 'D',
  renamed: 'R',
  untracked: 'U',
}

export function ChangedFiles({ worktreePath, workspaceId, isActive }: Props) {
  const [files, setFiles] = useState<FileStatus[]>([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [commitMsg, setCommitMsg] = useState('')
  const refreshSeqRef = useRef(0)
  const { openDiffTab } = useAppStore()

  const refresh = useCallback(async (showLoading = false) => {
    const seq = ++refreshSeqRef.current
    if (showLoading) setLoading(true)

    try {
      const statuses = await window.api.git.getStatus(worktreePath)
      if (seq !== refreshSeqRef.current) return
      setFiles(statuses)
      dispatchGitStatusChanged(worktreePath, statuses.length)
    } catch {
      if (seq !== refreshSeqRef.current) return
      setFiles([])
      dispatchGitStatusChanged(worktreePath, 0)
    } finally {
      if (showLoading && seq === refreshSeqRef.current) {
        setLoading(false)
      }
    }
  }, [worktreePath])

  useEffect(() => {
    void refresh(true)
  }, [refresh])

  // Watch filesystem for changes and auto-refresh
  useEffect(() => {
    window.api.fs.watchDir(worktreePath)

    const cleanup = window.api.fs.onDirChanged((changedPath) => {
      if (changedPath === worktreePath) {
        void refresh()
      }
    })

    return () => {
      cleanup()
      window.api.fs.unwatchDir(worktreePath)
    }
  }, [worktreePath, refresh])

  // Re-fetch when tab becomes visible (git ops only touch .git/ which the watcher ignores)
  useEffect(() => {
    if (isActive) {
      void refresh()
    }
  }, [isActive, refresh])

  const staged = files.filter((f) => f.staged)
  const unstaged = files.filter((f) => !f.staged)

  const runGitOp = useCallback(async (op: () => Promise<void>) => {
    setBusy(true)
    try {
      await op()
    } catch (err) {
      console.error('[ChangedFiles] git operation failed:', err)
    } finally {
      await refresh()
      setBusy(false)
    }
  }, [refresh])

  const stageFiles = useCallback((paths: string[]) => {
    runGitOp(() => window.api.git.stage(worktreePath, paths))
  }, [worktreePath, runGitOp])

  const unstageFiles = useCallback((paths: string[]) => {
    runGitOp(() => window.api.git.unstage(worktreePath, paths))
  }, [worktreePath, runGitOp])

  const discardFiles = useCallback((file: FileStatus) => {
    if (file.status === 'untracked') {
      runGitOp(() => window.api.git.discard(worktreePath, [], [file.path]))
    } else {
      runGitOp(() => window.api.git.discard(worktreePath, [file.path], []))
    }
  }, [worktreePath, runGitOp])

  const handleCommit = useCallback(() => {
    if (!commitMsg.trim() || staged.length === 0) return
    runGitOp(async () => {
      await window.api.git.commit(worktreePath, commitMsg.trim())
      setCommitMsg('')
    })
  }, [worktreePath, commitMsg, staged.length, runGitOp])

  const openDiff = useCallback((path: string) => {
    openDiffTab(workspaceId)
    requestAnimationFrame(() => {
      window.dispatchEvent(new CustomEvent('diff:scrollToFile', { detail: path }))
    })
  }, [openDiffTab, workspaceId])

  if (loading) {
    return (
      <div className={styles.emptyState}>
        <span className={styles.emptyText}>Checking changes...</span>
      </div>
    )
  }

  if (files.length === 0) {
    return (
      <div className={styles.emptyState}>
        <span className={styles.emptyIcon}>✓</span>
        <span className={styles.emptyText}>No changes</span>
      </div>
    )
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault()
      handleCommit()
    }
  }

  return (
    <div className={styles.changedFilesList}>
      {/* Commit input */}
      <div className={styles.commitArea}>
        <textarea
          className={styles.commitInput}
          placeholder="Commit message"
          value={commitMsg}
          onChange={(e) => setCommitMsg(e.target.value)}
          onKeyDown={handleKeyDown}
          rows={1}
        />
        <Tooltip
          label="Commit staged changes"
          shortcut={formatShortcut(
            SHORTCUT_MAP.commitStagedChanges.mac,
            SHORTCUT_MAP.commitStagedChanges.win
          )}
        >
          <button
            className={styles.commitButton}
            disabled={busy || !commitMsg.trim() || staged.length === 0}
            onClick={handleCommit}
          >
            Commit
          </button>
        </Tooltip>
      </div>

      {/* Staged section */}
      {staged.length > 0 && (
        <div className={styles.changeSection}>
          <div className={styles.sectionHeader}>
            <span className={styles.sectionLabel}>Staged Changes</span>
            <span className={styles.sectionCount}>{staged.length}</span>
            <span className={styles.sectionActions}>
              <Tooltip label="Unstage All">
                <button
                  aria-label="Unstage all files"
                  className={styles.sectionAction}
                  disabled={busy}
                  onClick={() => unstageFiles(staged.map((f) => f.path))}
                >
                  −
                </button>
              </Tooltip>
            </span>
          </div>
          {staged.map((file) => (
            <FileRow
              key={`staged-${file.path}`}
              file={file}
              busy={busy}
              onAction={() => unstageFiles([file.path])}
              actionLabel="−"
              actionTitle="Unstage"
              onOpenDiff={openDiff}
            />
          ))}
        </div>
      )}

      {/* Unstaged section */}
      {unstaged.length > 0 && (
        <div className={styles.changeSection}>
          <div className={styles.sectionHeader}>
            <span className={styles.sectionLabel}>Changes</span>
            <span className={styles.sectionCount}>{unstaged.length}</span>
            <span className={styles.sectionActions}>
              <Tooltip label="Discard All">
                <button
                  aria-label="Discard all unstaged changes"
                  className={styles.sectionAction}
                  disabled={busy}
                  onClick={() => {
                    const tracked = unstaged.filter((f) => f.status !== 'untracked').map((f) => f.path)
                    const untracked = unstaged.filter((f) => f.status === 'untracked').map((f) => f.path)
                    runGitOp(() => window.api.git.discard(worktreePath, tracked, untracked))
                  }}
                >
                  ↩
                </button>
              </Tooltip>
              <Tooltip label="Stage All">
                <button
                  aria-label="Stage all files"
                  className={styles.sectionAction}
                  disabled={busy}
                  onClick={() => stageFiles(unstaged.map((f) => f.path))}
                >
                  +
                </button>
              </Tooltip>
            </span>
          </div>
          {unstaged.map((file) => (
            <FileRow
              key={`unstaged-${file.path}`}
              file={file}
              busy={busy}
              onAction={() => stageFiles([file.path])}
              actionLabel="+"
              actionTitle="Stage"
              onDiscard={() => discardFiles(file)}
              onOpenDiff={openDiff}
            />
          ))}
        </div>
      )}
    </div>
  )
}

function FileRow({
  file,
  busy,
  onAction,
  actionLabel,
  actionTitle,
  onDiscard,
  onOpenDiff,
}: {
  file: FileStatus
  busy: boolean
  onAction: () => void
  actionLabel: string
  actionTitle: string
  onDiscard?: () => void
  onOpenDiff: (path: string) => void
}) {
  const displayPath = toPosixPath(file.path)
  const fileName = basenameSafe(displayPath)
  const dir = displayPath.slice(0, Math.max(0, displayPath.length - fileName.length))

  return (
    <div className={styles.changedFile}>
      <span className={`${styles.statusBadge} ${styles[file.status]}`}>
        {STATUS_LABELS[file.status]}
      </span>
      <span
        className={styles.changePath}
        onClick={() => onOpenDiff(toPosixPath(file.path))}
      >
        {dir && <span className={styles.changeDir}>{dir}</span>}
        {fileName}
      </span>
      <span className={styles.fileActions}>
        {onDiscard && (
          <Tooltip label="Discard Changes">
            <button
              aria-label={`Discard changes in ${displayPath}`}
              className={styles.fileActionBtn}
              disabled={busy}
              onClick={onDiscard}
            >
              ↩
            </button>
          </Tooltip>
        )}
        <Tooltip label={actionTitle}>
          <button
            aria-label={`${actionTitle} ${displayPath}`}
            className={styles.fileActionBtn}
            disabled={busy}
            onClick={onAction}
          >
            {actionLabel}
          </button>
        </Tooltip>
      </span>
    </div>
  )
}
