import { useEffect, useMemo, useState } from 'react'
import { Button, Input } from '@fluentui/react-components'
import {
  GlobeRegular,
  ArrowClockwiseRegular,
  OpenRegular,
} from '@fluentui/react-icons'
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
        <Input
          className={styles.previewUrlInput}
          value={draft}
          onChange={(_e, data) => setDraft(data.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') applyDraft()
          }}
          placeholder="localhost:3000 or 3000"
          size="small"
          appearance="outline"
        />
        <Button
          appearance="subtle"
          size="small"
          onClick={applyDraft}
          icon={<OpenRegular />}
        >
          Open
        </Button>
        <Button
          appearance="subtle"
          size="small"
          onClick={() => setFrameKey((k) => k + 1)}
          icon={<ArrowClockwiseRegular />}
        >
          Refresh
        </Button>
        <Button
          appearance="subtle"
          size="small"
          onClick={openExternal}
          icon={<GlobeRegular />}
        >
          Browser
        </Button>
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
