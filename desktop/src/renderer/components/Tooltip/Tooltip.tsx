import type { ReactElement } from 'react'
import {
  Tooltip as FluentTooltip,
  type PositioningShorthand,
} from '@fluentui/react-components'

interface Props {
  label: string
  shortcut?: string
  position?: 'top' | 'bottom'
  children: ReactElement<Record<string, unknown>>
}

const positionMap: Record<string, PositioningShorthand> = {
  top: 'above',
  bottom: 'below',
}

export function Tooltip({ label, shortcut, position = 'top', children }: Props) {
  const content = shortcut ? (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
      {label}
      <kbd
        style={{
          fontSize: 9,
          fontFamily: 'var(--font-ui)',
          fontWeight: 500,
          opacity: 0.7,
          background: 'var(--colorNeutralBackground5)',
          border: '1px solid var(--colorNeutralStroke2)',
          borderRadius: 3,
          padding: '1px 4px',
          lineHeight: 1,
        }}
      >
        {shortcut}
      </kbd>
    </span>
  ) : (
    label
  )

  return (
    <FluentTooltip
      content={content}
      positioning={positionMap[position] ?? 'above'}
      relationship="label"
      showDelay={400}
    >
      {children}
    </FluentTooltip>
  )
}
