import { useEffect, useState, useCallback, useRef } from 'react'
import { basenameSafe, formatShortcut, toPosixPath } from '@shared/platform'
import { SHORTCUT_MAP } from '@shared/shortcuts'
import { useAppStore } from '../../store/app-store'
import { DEFAULT_WORKSPACE_TYPE, type WorkspaceType } from '../../store/types'
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

type CommitFlowAction = 'commit' | 'ship-main' | 'ship-main-close'

interface CommitFlowOption {
  id: CommitFlowAction
  label: string
  tooltip: string
}

const COMMIT_FLOW_OPTIONS: CommitFlowOption[] = [
  {
    id: 'commit',
    label: 'Commit',
    tooltip: 'Commit changes',
  },
  {
    id: 'ship-main',
    label: 'Ship to main',
    tooltip: 'Commit, push branch, and open a PR to main',
  },
  {
    id: 'ship-main-close',
    label: 'Ship to main and close workspace',
    tooltip: 'Commit, push branch, open a PR to main, and close workspace',
  },
]

const COMMIT_PREFIX_BY_TYPE: Record<WorkspaceType, string> = {
  bug: 'fix: ',
  feature: 'feat: ',
  chore: 'chore: ',
  refactor: 'refactor: ',
  docs: 'docs: ',
  test: 'test: ',
  spike: 'spike: ',
}

function commitPrefixForType(workspaceType?: WorkspaceType): string {
  return COMMIT_PREFIX_BY_TYPE[workspaceType ?? DEFAULT_WORKSPACE_TYPE]
}

function formatUserError(err: unknown, fallback: string): string {
  if (!(err instanceof Error)) return fallback
  const invokePrefix = /^Error invoking remote method '[^']+': Error:\s*/i
  return err.message.replace(invokePrefix, '') || fallback
}

export function ChangedFiles({ worktreePath, workspaceId, isActive }: Props) {
  const [files, setFiles] = useState<FileStatus[]>([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [commitMsg, setCommitMsg] = useState('')
  const [commitFlow, setCommitFlow] = useState<CommitFlowAction>('commit')
  const [commitMenuOpen, setCommitMenuOpen] = useState(false)
  const refreshSeqRef = useRef(0)
  const lastAutofilledCommitMsgRef = useRef<string>('')
  const commitMenuRef = useRef<HTMLDivElement | null>(null)
  const {
    openDiffTab,
    addToast,
    deleteWorkspace,
    workspaces,
    projects,
  } = useAppStore()

  const workspace = workspaces.find((w) => w.id === workspaceId)
  const project = workspace ? projects.find((p) => p.id === workspace.projectId) : undefined
  const defaultCommitPrefix = commitPrefixForType(workspace?.type)

  useEffect(() => {
    setCommitMsg((prev) => {
      if (prev.trim().length === 0 || prev === lastAutofilledCommitMsgRef.current) {
        lastAutofilledCommitMsgRef.current = defaultCommitPrefix
        return defaultCommitPrefix
      }
      return prev
    })
  }, [defaultCommitPrefix, workspaceId])

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

  useEffect(() => {
    if (!commitMenuOpen) return

    const handlePointerDown = (event: MouseEvent) => {
      if (!commitMenuRef.current?.contains(event.target as Node)) {
        setCommitMenuOpen(false)
      }
    }
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setCommitMenuOpen(false)
      }
    }

    window.addEventListener('mousedown', handlePointerDown, true)
    window.addEventListener('keydown', handleEscape)
    return () => {
      window.removeEventListener('mousedown', handlePointerDown, true)
      window.removeEventListener('keydown', handleEscape)
    }
  }, [commitMenuOpen])

  const staged = files.filter((f) => f.staged)
  const unstaged = files.filter((f) => !f.staged)

  const runGitOp = useCallback(async (op: () => Promise<void>) => {
    setBusy(true)
    try {
      await op()
    } catch (err) {
      const msg = formatUserError(err, 'Git operation failed')
      addToast({ id: crypto.randomUUID(), message: msg, type: 'error' })
    } finally {
      await refresh()
      setBusy(false)
    }
  }, [refresh, addToast])

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

  const handleCommitFlow = useCallback(() => {
    const message = commitMsg.trim()
    if (!message) return

    setCommitMenuOpen(false)
    const shouldStageAllFirst = staged.length === 0 && unstaged.length > 0
    if (staged.length === 0 && !shouldStageAllFirst) return

    void runGitOp(async () => {
      if (shouldStageAllFirst) {
        await window.api.git.stage(worktreePath, unstaged.map((f) => f.path))
      }
      await window.api.git.commit(worktreePath, message)

      if (commitFlow === 'ship-main' || commitFlow === 'ship-main-close') {
        if (!project) {
          throw new Error('Project not found for this workspace')
        }
        const sourceBranch = await window.api.git.getCurrentBranch(worktreePath)
        if (!sourceBranch || sourceBranch === 'HEAD') {
          throw new Error('Cannot ship workspace from detached HEAD')
        }
        const closesWorkspace = commitFlow === 'ship-main-close'
        const result = await window.api.git.shipBranchToMain(project.repoPath, sourceBranch)

        if (result.prUrl) {
          const prMsg = result.prCreated
            ? `PR to ${result.mainBranch} created.`
            : `PR to ${result.mainBranch} already exists.`
          addToast({
            id: crypto.randomUUID(),
            message: closesWorkspace
              ? `Pushed ${sourceBranch}, and closed workspace. ${prMsg}`
              : `Pushed ${sourceBranch}. ${prMsg}`,
            type: 'info',
          })
          window.open(result.prUrl)
        } else {
          addToast({
            id: crypto.randomUUID(),
            message: closesWorkspace
              ? `Pushed ${sourceBranch} and closed workspace.`
              : `Pushed ${sourceBranch}.`,
            type: 'info',
          })
        }

        if (closesWorkspace) {
          await deleteWorkspace(workspaceId)
        }
        lastAutofilledCommitMsgRef.current = defaultCommitPrefix
        setCommitMsg(defaultCommitPrefix)
        return
      }

      addToast({
        id: crypto.randomUUID(),
        message: 'Commit created',
        type: 'info',
      })
      lastAutofilledCommitMsgRef.current = defaultCommitPrefix
      setCommitMsg(defaultCommitPrefix)
    })
  }, [
    commitMsg,
    staged.length,
    unstaged,
    runGitOp,
    worktreePath,
    commitFlow,
    defaultCommitPrefix,
    project,
    deleteWorkspace,
    workspaceId,
    addToast,
  ])

  const handleCommitFlowSelect = useCallback((flow: CommitFlowAction) => {
    setCommitFlow(flow)
    setCommitMenuOpen(false)
  }, [])

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
      handleCommitFlow()
    }
  }

  const canCommit = !busy && !!commitMsg.trim() && (staged.length > 0 || unstaged.length > 0)
  const commitFlowOption = COMMIT_FLOW_OPTIONS.find((option) => option.id === commitFlow) ?? COMMIT_FLOW_OPTIONS[0]

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
        <div className={styles.commitActions} ref={commitMenuRef}>
          <Tooltip
            label={commitFlowOption.tooltip}
            shortcut={formatShortcut(
              SHORTCUT_MAP.commitStagedChanges.mac,
              SHORTCUT_MAP.commitStagedChanges.win
            )}
          >
            <button
              className={styles.commitButton}
              disabled={!canCommit}
              onClick={handleCommitFlow}
            >
              {commitFlowOption.label}
            </button>
          </Tooltip>
          <button
            className={styles.commitMenuToggle}
            aria-label="Commit flow options"
            aria-expanded={commitMenuOpen}
            disabled={busy}
            onClick={() => setCommitMenuOpen((open) => !open)}
          >
            ▾
          </button>
          {commitMenuOpen && (
            <div className={styles.commitMenu}>
              {COMMIT_FLOW_OPTIONS.map((option) => (
                <button
                  key={option.id}
                  className={`${styles.commitMenuItem} ${commitFlow === option.id ? styles.activeCommitMenuItem : ''}`}
                  onClick={() => handleCommitFlowSelect(option.id)}
                >
                  {option.label}
                </button>
              ))}
            </div>
          )}
        </div>
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
