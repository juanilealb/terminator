import { useCallback, useEffect, useId } from 'react'
import { useFocusTrap } from '../../hooks/useFocusTrap'
import styles from './ConfirmDialog.module.css'

interface Props {
  title: string
  message: string
  confirmLabel?: string
  onConfirm: () => void
  onCancel: () => void
  destructive?: boolean
}

export function ConfirmDialog({ title, message, confirmLabel = 'Delete', onConfirm, onCancel, destructive = false }: Props) {
  const dialogRef = useFocusTrap<HTMLDivElement>()
  const titleId = useId()
  const messageId = useId()
  const showShiftHint = confirmLabel.toLowerCase() === 'delete'

  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (e.key === 'Escape') onCancel()
    if (e.key === 'Enter') onConfirm()
  }, [onConfirm, onCancel])

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [handleKeyDown])

  return (
    <div className={styles.overlay} onClick={onCancel}>
      <div
        ref={dialogRef}
        className={styles.dialog}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={messageId}
        tabIndex={-1}
      >
        <div id={titleId} className={styles.title}>{title}</div>
        <div id={messageId} className={styles.message}>{message}</div>
        {showShiftHint && (
          <div className={styles.tip}>Tip: Hold ⇧ Shift while deleting to skip this dialog</div>
        )}
        <div className={styles.actions}>
          <button className={styles.cancelBtn} onClick={onCancel}>Cancel</button>
          <button
            className={destructive ? styles.destructiveBtn : styles.confirmBtn}
            onClick={onConfirm}
            autoFocus
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}
