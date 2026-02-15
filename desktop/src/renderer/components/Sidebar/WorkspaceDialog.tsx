import { useState, useEffect, useCallback, useRef } from 'react'
import {
  Dialog,
  DialogSurface,
  DialogBody,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
} from '@fluentui/react-components'
import {
  DEFAULT_AGENT_PERMISSION_MODE,
  DEFAULT_WORKSPACE_TYPE,
  type AgentPermissionMode,
  type Project,
  type WorkspaceType,
} from '../../store/types'
import styles from './WorkspaceDialog.module.css'

/** Live-sanitize a string into a valid git branch name as the user types */
function toBranchName(input: string): string {
  return input
    .replace(/\s+/g, '-')
    .replace(/[\x00-\x1f\x7f~^:?*[\]\\]/g, '')
    .replace(/\.{2,}/g, '.')
    .replace(/\/{2,}/g, '/')
}

interface Props {
  project: Project
  onConfirm: (
    name: string,
    type: WorkspaceType,
    branch: string,
    newBranch: boolean,
    baseBranch: string | undefined,
    agentPermissionMode: AgentPermissionMode,
  ) => void
  onCancel: () => void
  isCreating?: boolean
  createProgressMessage?: string
  showSlowCreateMessage?: boolean
}

export function WorkspaceDialog({
  project,
  onConfirm,
  onCancel,
  isCreating = false,
  createProgressMessage = '',
  showSlowCreateMessage = false,
}: Props) {
  const [name, setName] = useState(`ws-${Date.now().toString(36)}`)
  const [branches, setBranches] = useState<string[]>([])
  const [selectedBranch, setSelectedBranch] = useState('')
  const [isNewBranch, setIsNewBranch] = useState(true)
  const [newBranchName, setNewBranchName] = useState('')
  const [workspaceType, setWorkspaceType] = useState<WorkspaceType>(DEFAULT_WORKSPACE_TYPE)
  const [agentPermissionMode, setAgentPermissionMode] = useState<AgentPermissionMode>(DEFAULT_AGENT_PERMISSION_MODE)
  const [baseBranch, setBaseBranch] = useState('')
  const [loading, setLoading] = useState(true)
  const [pickerOpen, setPickerOpen] = useState(false)
  const [basePickerOpen, setBasePickerOpen] = useState(false)
  const pickerRef = useRef<HTMLDivElement>(null)
  const basePickerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const loadBranches = async () => {
      try {
        // Detect default branch from remote
        const defaultBranch = await window.api.git.getDefaultBranch(project.repoPath)
          .then((ref) => ref.replace(/^origin\//, ''))
          .catch(() => '')

        const b = await window.api.git.getBranches(project.repoPath).catch(() => [] as string[])
        setBranches(b)

        if (defaultBranch && b.includes(defaultBranch)) {
          setSelectedBranch(defaultBranch)
          setBaseBranch(defaultBranch)
        } else if (b.length > 0) {
          setSelectedBranch(b[0])
          setBaseBranch(b[0])
        }
      } finally {
        setLoading(false)
      }
    }
    loadBranches()
  }, [project.repoPath])

  const handleSubmit = useCallback(() => {
    if (isCreating) return
    const branch = isNewBranch ? (newBranchName || name) : selectedBranch
    onConfirm(
      name,
      workspaceType,
      branch,
      isNewBranch,
      isNewBranch ? baseBranch : undefined,
      agentPermissionMode,
    )
  }, [
    name,
    workspaceType,
    isNewBranch,
    newBranchName,
    selectedBranch,
    baseBranch,
    onConfirm,
    isCreating,
    agentPermissionMode,
  ])

  // Close pickers on click outside
  useEffect(() => {
    if (!pickerOpen && !basePickerOpen) return
    const handler = (e: MouseEvent) => {
      if (pickerOpen && pickerRef.current && !pickerRef.current.contains(e.target as Node)) {
        setPickerOpen(false)
      }
      if (basePickerOpen && basePickerRef.current && !basePickerRef.current.contains(e.target as Node)) {
        setBasePickerOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [pickerOpen, basePickerOpen])

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (isCreating) return
    if (e.key === 'Enter') handleSubmit()
  }, [handleSubmit, isCreating])

  return (
    <Dialog open onOpenChange={(_, data) => { if (!data.open && !isCreating) onCancel() }}>
      <DialogSurface className={styles.surface} onKeyDown={handleKeyDown}>
        <DialogBody>
          <DialogTitle>New Workspace</DialogTitle>
          <DialogContent className={styles.content}>
            <label className={styles.label}>Name</label>
            <input
              className={styles.input}
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoFocus
              disabled={isCreating}
              placeholder="workspace-name"
            />

            <label className={styles.label}>Type</label>
            <select
              className={styles.input}
              value={workspaceType}
              onChange={(e) => setWorkspaceType(e.target.value as WorkspaceType)}
              disabled={isCreating}
            >
              <option value="feature">Feature</option>
              <option value="bug">Bug</option>
              <option value="chore">Chore</option>
              <option value="refactor">Refactor</option>
              <option value="docs">Docs</option>
              <option value="test">Test</option>
              <option value="spike">Spike</option>
            </select>

            <label className={styles.label}>Branch</label>
            <div className={styles.branchToggle}>
              <button
                className={`${styles.toggleBtn} ${isNewBranch ? styles.active : ''}`}
                onClick={() => setIsNewBranch(true)}
                disabled={isCreating}
              >
                New branch
              </button>
              <button
                className={`${styles.toggleBtn} ${!isNewBranch ? styles.active : ''}`}
                onClick={() => setIsNewBranch(false)}
                disabled={isCreating}
              >
                Existing
              </button>
            </div>

            {isNewBranch ? (
              <>
                <input
                  className={styles.input}
                  value={newBranchName}
                  onChange={(e) => setNewBranchName(toBranchName(e.target.value))}
                  disabled={isCreating}
                  placeholder={toBranchName(name) || 'branch-name'}
                />
                <label className={styles.label}>Base branch</label>
                <div className={styles.branchInputRow} ref={basePickerRef}>
                  <input
                    className={styles.input}
                    value={baseBranch}
                    onChange={(e) => setBaseBranch(e.target.value)}
                    disabled={loading || isCreating}
                    placeholder="Base branch"
                  />
                  <button
                    className={styles.pickerBtn}
                    onClick={() => setBasePickerOpen((v) => !v)}
                    disabled={loading || isCreating}
                    type="button"
                  >
                    &#9662;
                  </button>
                  {basePickerOpen && (
                    <div className={styles.pickerDropdown}>
                      {branches.map((b) => (
                        <div
                          key={b}
                          className={`${styles.pickerOption} ${b === baseBranch ? styles.pickerOptionActive : ''}`}
                          onClick={() => { setBaseBranch(b); setBasePickerOpen(false) }}
                        >
                          {b}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </>
            ) : (
              <div className={styles.branchInputRow} ref={pickerRef}>
                <input
                  className={styles.input}
                  value={selectedBranch}
                  onChange={(e) => setSelectedBranch(e.target.value)}
                  disabled={loading || isCreating}
                  placeholder="Branch name"
                />
                <button
                  className={styles.pickerBtn}
                  onClick={() => setPickerOpen((v) => !v)}
                  disabled={loading || isCreating}
                  type="button"
                >
                  &#9662;
                </button>
                {pickerOpen && (
                  <div className={styles.pickerDropdown}>
                    {branches.map((b) => (
                      <div
                        key={b}
                        className={`${styles.pickerOption} ${b === selectedBranch ? styles.pickerOptionActive : ''}`}
                        onClick={() => { setSelectedBranch(b); setPickerOpen(false) }}
                      >
                        {b}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            <label className={styles.checkboxRow}>
              <input
                type="checkbox"
                checked={agentPermissionMode === 'full-permissions'}
                onChange={(e) => setAgentPermissionMode(e.target.checked ? 'full-permissions' : 'default')}
                disabled={isCreating}
              />
              <span>Full permissions for codex and claude</span>
            </label>
            <div className={styles.hint}>
              Off keeps standard mode. On expands codex and claude to full permissions.
            </div>

            {isCreating && (
              <div className={styles.createStatus} role="status" aria-live="polite">
                <span className={styles.createSpinner} />
                <span>{createProgressMessage || 'Creating workspace...'}</span>
              </div>
            )}
            {isCreating && showSlowCreateMessage && (
              <div className={styles.createSlowNote}>
                Taking longer than usual. Git network sync may be slow.
              </div>
            )}
          </DialogContent>
          <DialogActions>
            <Button appearance="secondary" onClick={onCancel} disabled={isCreating}>Cancel</Button>
            <Button appearance="primary" onClick={handleSubmit} disabled={!name.trim() || isCreating}>
              {isCreating ? 'Creating...' : 'Create'}
            </Button>
          </DialogActions>
        </DialogBody>
      </DialogSurface>
    </Dialog>
  )
}
