import { useState, useCallback, useId } from 'react'
import type { Project, StartupCommand } from '../../store/types'
import { useFocusTrap } from '../../hooks/useFocusTrap'
import styles from './ProjectSettingsDialog.module.css'

interface Props {
  project: Project
  onSave: (commands: StartupCommand[]) => void
  onCancel: () => void
}

export function ProjectSettingsDialog({ project, onSave, onCancel }: Props) {
  const dialogRef = useFocusTrap<HTMLDivElement>()
  const titleId = useId()
  const [commands, setCommands] = useState<StartupCommand[]>(
    project.startupCommands?.length ? [...project.startupCommands] : []
  )

  const handleAdd = useCallback(() => {
    setCommands((prev) => [...prev, { name: '', command: '' }])
  }, [])

  const handleRemove = useCallback((index: number) => {
    setCommands((prev) => prev.filter((_, i) => i !== index))
  }, [])

  const handleChange = useCallback((index: number, field: keyof StartupCommand, value: string) => {
    setCommands((prev) =>
      prev.map((cmd, i) => (i === index ? { ...cmd, [field]: value } : cmd))
    )
  }, [])

  const handleSave = useCallback(() => {
    // Filter out entries with no command
    const filtered = commands.filter((c) => c.command.trim())
    onSave(filtered.length > 0 ? filtered : [])
  }, [commands, onSave])

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Escape') onCancel()
    },
    [onCancel]
  )

  return (
    <div className={styles.overlay} onClick={onCancel}>
      <div
        ref={dialogRef}
        className={styles.dialog}
        onClick={(e) => e.stopPropagation()}
        onKeyDown={handleKeyDown}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
      >
        <div id={titleId} className={styles.title}>{project.name}</div>

        <label className={styles.label}>Startup Commands</label>
        <div className={styles.hint}>
          Run in separate terminals when creating a workspace.
        </div>

        <div className={styles.commandList}>
          {commands.map((cmd, i) => (
            <div key={i} className={styles.commandRow}>
              <input
                className={`${styles.input} ${styles.nameInput}`}
                value={cmd.name}
                onChange={(e) => handleChange(i, 'name', e.target.value)}
                placeholder="Tab name"
              />
              <input
                className={styles.input}
                value={cmd.command}
                onChange={(e) => handleChange(i, 'command', e.target.value)}
                placeholder="command"
                autoFocus={i === commands.length - 1}
              />
              <button
                aria-label={`Remove startup command ${i + 1}`}
                className={styles.removeBtn}
                onClick={() => handleRemove(i)}
                title="Remove"
              >
                ✕
              </button>
            </div>
          ))}

          <button className={styles.addBtn} onClick={handleAdd}>
            <span>+</span>
            <span>Add command</span>
          </button>
        </div>

        <div className={styles.actions}>
          <button className={styles.cancelBtn} onClick={onCancel}>
            Cancel
          </button>
          <button className={styles.saveBtn} onClick={handleSave}>
            Save
          </button>
        </div>
      </div>
    </div>
  )
}
