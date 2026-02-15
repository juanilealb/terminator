import { useCallback, useEffect } from 'react'
import {
  Dialog,
  DialogSurface,
  DialogBody,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
} from '@fluentui/react-components'
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
  const showShiftHint = confirmLabel.toLowerCase() === 'delete'

  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (e.key === 'Enter') onConfirm()
  }, [onConfirm])

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [handleKeyDown])

  return (
    <Dialog open onOpenChange={(_, data) => { if (!data.open) onCancel() }}>
      <DialogSurface className={styles.surface}>
        <DialogBody>
          <DialogTitle>{title}</DialogTitle>
          <DialogContent>
            <div className={styles.message}>{message}</div>
            {showShiftHint && (
              <div className={styles.tip}>Tip: Hold Shift while deleting to skip this dialog</div>
            )}
          </DialogContent>
          <DialogActions>
            <Button appearance="secondary" onClick={onCancel}>Cancel</Button>
            <Button
              appearance="primary"
              className={destructive ? styles.destructiveBtn : undefined}
              onClick={onConfirm}
            >
              {confirmLabel}
            </Button>
          </DialogActions>
        </DialogBody>
      </DialogSurface>
    </Dialog>
  )
}
