import { useEffect, useMemo, useState } from 'react'
import { normalizePreviewUrl } from '../../utils/prompt-template'
import styles from './RightPanel.module.css'

interface Props {
  previewUrl: string
  onChangeUrl: (url: string) => void
}

export function PreviewPanel({ previewUrl, onChangeUrl }: Props) {
  const [draft, setDraft] = useState(previewUrl)
  const [frameKey, setFrameKey] = useState(0)

  useEffect(() => {
    setDraft(previewUrl)
  }, [previewUrl])

  const normalizedPreviewUrl = useMemo(() => normalizePreviewUrl(previewUrl), [previewUrl])

  const applyDraft = () => {
    const normalized = normalizePreviewUrl(draft)
    onChangeUrl(normalized)
  }

  const openExternal = () => {
    if (!normalizedPreviewUrl) return
    window.open(normalizedPreviewUrl, '_blank')
  }

  return (
    <div className={styles.previewPanel}>
      <div className={styles.previewToolbar}>
        <input
          className={styles.previewInput}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') applyDraft()
          }}
          placeholder="localhost:3000 or 3000"
        />
        <button className={styles.previewButton} onClick={applyDraft}>
          Open
        </button>
        <button className={styles.previewButton} onClick={() => setFrameKey((k) => k + 1)}>
          Refresh
        </button>
        <button className={styles.previewButton} onClick={openExternal}>
          Browser
        </button>
      </div>

      {!normalizedPreviewUrl ? (
        <div className={styles.previewEmpty}>
          Enter a localhost URL or port to view your app preview.
        </div>
      ) : (
        <iframe
          key={`${normalizedPreviewUrl}-${frameKey}`}
          className={styles.previewFrame}
          src={normalizedPreviewUrl}
          title="Local preview"
        />
      )}
    </div>
  )
}
