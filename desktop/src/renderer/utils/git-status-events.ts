const GIT_STATUS_CHANGED_EVENT = 'terminator:git-status-changed'

interface GitStatusChangedDetail {
  worktreePath: string
  count: number
}

export function dispatchGitStatusChanged(worktreePath: string, count: number): void {
  window.dispatchEvent(
    new CustomEvent<GitStatusChangedDetail>(GIT_STATUS_CHANGED_EVENT, {
      detail: { worktreePath, count },
    }),
  )
}

export function subscribeGitStatusChanged(
  worktreePath: string,
  onChange: (count: number) => void,
): () => void {
  const handler = (event: Event) => {
    const customEvent = event as CustomEvent<GitStatusChangedDetail>
    const detail = customEvent.detail
    if (!detail || detail.worktreePath !== worktreePath) return
    onChange(detail.count)
  }

  window.addEventListener(GIT_STATUS_CHANGED_EVENT, handler)
  return () => window.removeEventListener(GIT_STATUS_CHANGED_EVENT, handler)
}
