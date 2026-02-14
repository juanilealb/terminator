const TERMINAL_UI_ACTION_EVENT = 'terminator:terminal-ui-action'

export type TerminalUiAction = 'find' | 'clear'

interface TerminalUiActionDetail {
  ptyId: string
  action: TerminalUiAction
}

export function dispatchTerminalUiAction(ptyId: string, action: TerminalUiAction): void {
  window.dispatchEvent(
    new CustomEvent<TerminalUiActionDetail>(TERMINAL_UI_ACTION_EVENT, {
      detail: { ptyId, action },
    }),
  )
}

export function subscribeTerminalUiActions(
  ptyId: string,
  onAction: (action: TerminalUiAction) => void,
): () => void {
  const handler = (event: Event) => {
    const customEvent = event as CustomEvent<TerminalUiActionDetail>
    const detail = customEvent.detail
    if (!detail || detail.ptyId !== ptyId) return
    onAction(detail.action)
  }

  window.addEventListener(TERMINAL_UI_ACTION_EVENT, handler)
  return () => window.removeEventListener(TERMINAL_UI_ACTION_EVENT, handler)
}
