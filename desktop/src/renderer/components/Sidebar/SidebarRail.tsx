import { Fragment, useMemo } from 'react'
import { useAppStore } from '../../store/app-store'
import styles from './SidebarRail.module.css'

interface WorkspaceWithState {
  id: string
  name: string
  projectId: string
  projectName: string
  isActive: boolean
  isRunning: boolean
  isWaiting: boolean
  isUnread: boolean
}

export function SidebarRail() {
  const projects = useAppStore((s) => s.projects)
  const workspaces = useAppStore((s) => s.workspaces)
  const activeWorkspaceId = useAppStore((s) => s.activeWorkspaceId)
  const activeClaudeWorkspaceIds = useAppStore((s) => s.activeClaudeWorkspaceIds)
  const waitingClaudeWorkspaceIds = useAppStore((s) => s.waitingClaudeWorkspaceIds)
  const unreadWorkspaceIds = useAppStore((s) => s.unreadWorkspaceIds)
  const setActiveWorkspace = useAppStore((s) => s.setActiveWorkspace)
  const toggleSidebar = useAppStore((s) => s.toggleSidebar)

  const ordered = useMemo<WorkspaceWithState[]>(() => {
    const projectNameById = new Map(projects.map((project) => [project.id, project.name]))
    return projects.flatMap((project) =>
      workspaces
        .filter((workspace) => workspace.projectId === project.id)
        .map((workspace) => {
          const isRunning = activeClaudeWorkspaceIds.has(workspace.id)
          const isWaiting = !isRunning && waitingClaudeWorkspaceIds.has(workspace.id)
          const isUnread = !isRunning && !isWaiting && unreadWorkspaceIds.has(workspace.id)
          return {
            id: workspace.id,
            name: workspace.name,
            projectId: workspace.projectId,
            projectName: projectNameById.get(workspace.projectId) ?? 'Project',
            isActive: workspace.id === activeWorkspaceId,
            isRunning,
            isWaiting,
            isUnread,
          }
        }),
    )
  }, [
    projects,
    workspaces,
    activeWorkspaceId,
    activeClaudeWorkspaceIds,
    waitingClaudeWorkspaceIds,
    unreadWorkspaceIds,
  ])

  return (
    <div className={styles.rail}>
      <div className={styles.railHeader}>
        <button
          className={styles.expandButton}
          onClick={() => toggleSidebar()}
          title="Expand sidebar"
          aria-label="Expand sidebar"
        >
          <span className={styles.expandGlyph} />
        </button>
      </div>

      <div className={styles.workspaceList}>
        {ordered.length === 0 ? (
          <div className={styles.emptyMarker} title="No workspaces" aria-hidden="true" />
        ) : (
          ordered.map((workspace, index) => {
            const stateClass = workspace.isRunning
              ? styles.running
              : workspace.isWaiting
                ? styles.waiting
                : workspace.isUnread
                  ? styles.unread
                  : ''
            const hasProjectDivider =
              index > 0 && ordered[index - 1]?.projectId !== workspace.projectId

            return (
              <Fragment key={workspace.id}>
                {hasProjectDivider && <div className={styles.projectDivider} aria-hidden="true" />}
                <button
                  className={`${styles.workspaceButton} ${workspace.isActive ? styles.active : ''} ${stateClass}`}
                  onClick={() => setActiveWorkspace(workspace.id)}
                  title={`${workspace.projectName} - ${workspace.name}`}
                  aria-label={`${workspace.projectName} ${workspace.name}`}
                />
              </Fragment>
            )
          })
        )}
      </div>
    </div>
  )
}
