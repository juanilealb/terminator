import { mkdirSync, readdirSync, readFileSync, unlinkSync } from 'fs'
import { join } from 'path'
import { app, BrowserWindow, nativeImage, Notification } from 'electron'
import { IPC } from '../shared/ipc-channels'
import { debugLog, getTempDir } from '@shared/platform'
import { sendActivateWorkspace } from './ipc'

const NOTIFY_DIR = join(getTempDir(), 'terminator-notify')
const ACTIVITY_DIR = join(getTempDir(), 'terminator-activity')
const POLL_INTERVAL = 500
const CLAUDE_MARKER_SUFFIX = '.claude'
const CODEX_MARKER_SEGMENT = '.codex.'

function getNotificationIcon() {
  const candidates = [
    join(app.getAppPath(), 'build', 'icon.png'),
    join(process.resourcesPath, 'build', 'icon.png'),
    join(process.resourcesPath, 'icon.png'),
  ]

  for (const iconPath of candidates) {
    const icon = nativeImage.createFromPath(iconPath)
    if (!icon.isEmpty()) return icon
  }

  return nativeImage.createEmpty()
}

export class NotificationWatcher {
  private timer: ReturnType<typeof setInterval> | null = null
  private lastActiveIds: string = ''

  start(): void {
    mkdirSync(NOTIFY_DIR, { recursive: true })
    mkdirSync(ACTIVITY_DIR, { recursive: true })
    this.pollOnce()
    this.timer = setInterval(() => this.pollOnce(), POLL_INTERVAL)
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer)
      this.timer = null
    }
  }

  private pollOnce(): void {
    this.pollNotifications()
    this.pollActivity()
  }

  private pollNotifications(): void {
    try {
      const files = readdirSync(NOTIFY_DIR)
      for (const f of files) {
        this.processFile(join(NOTIFY_DIR, f))
      }
    } catch {
      // Directory may not exist yet
    }
  }

  private pollActivity(): void {
    try {
      const files = readdirSync(ACTIVITY_DIR)
      const workspaceIds = Array.from(new Set(
        files
          .map((name) => {
            const workspaceId = this.workspaceIdFromMarkerName(name)
            if (!workspaceId) {
              this.removeActivityMarker(name)
              return null
            }
            return workspaceId
          })
          .filter((id): id is string => !!id)
      ))
      const sorted = workspaceIds.sort().join(',')
      if (sorted !== this.lastActiveIds) {
        const prevIds = this.lastActiveIds ? this.lastActiveIds.split(',').filter(Boolean) : []
        const nextIdSet = new Set(workspaceIds)
        const becameInactive = prevIds.filter((id) => !nextIdSet.has(id))

        this.lastActiveIds = sorted
        this.sendActivity(workspaceIds)
        debugLog('Activity markers changed', { activeWorkspaceIds: workspaceIds })

        // Fallback completion signal: if a workspace was active and now is not,
        // emit a notify event so renderer can show unread attention dots even
        // when explicit notify files are missed.
        for (const wsId of becameInactive) {
          this.notifyRenderer(wsId)
        }
      }
    } catch {
      if (this.lastActiveIds !== '') {
        const prevIds = this.lastActiveIds.split(',').filter(Boolean)
        this.lastActiveIds = ''
        this.sendActivity([])
        debugLog('Activity markers cleared (activity dir unavailable)')
        for (const wsId of prevIds) {
          this.notifyRenderer(wsId)
        }
      }
    }
  }

  private processFile(filePath: string): void {
    try {
      const wsId = readFileSync(filePath, 'utf-8').trim()
      if (wsId) {
        debugLog('Notify marker found', { workspaceId: wsId, filePath })
        this.notifyRenderer(wsId)
      } else {
        debugLog('Notify marker empty; clearing marker file', { filePath })
      }
      unlinkSync(filePath)
      debugLog('Notify marker cleared', { filePath })
    } catch {
      // File may have been already processed or deleted
    }
  }

  private workspaceIdFromMarkerName(name: string): string | null {
    const marker = name.trim()
    if (!marker) return null

    if (marker.endsWith(CLAUDE_MARKER_SUFFIX)) {
      return marker.slice(0, -CLAUDE_MARKER_SUFFIX.length) || null
    }

    const codexIdx = marker.indexOf(CODEX_MARKER_SEGMENT)
    if (codexIdx > 0) {
      return marker.slice(0, codexIdx) || null
    }

    // Legacy format is no longer written. Ignore and clean it up to avoid
    // stale always-active spinners after upgrading marker formats.
    return null
  }

  private removeActivityMarker(name: string): void {
    const markerPath = join(ACTIVITY_DIR, name)
    try {
      unlinkSync(markerPath)
      debugLog('Activity marker cleared', { markerPath })
    } catch {
      // Marker may already be gone
    }
  }

  private notifyRenderer(workspaceId: string): void {
    this.showNotification(workspaceId)

    for (const win of BrowserWindow.getAllWindows()) {
      if (!win.isDestroyed()) {
        win.webContents.send(IPC.CLAUDE_NOTIFY_WORKSPACE, workspaceId)
      }
    }
  }

  private showNotification(workspaceId: string): void {
    if (!Notification.isSupported()) return

    const notification = new Notification({
      title: 'Terminator',
      body: `Agent completed in workspace ${workspaceId}`,
      icon: getNotificationIcon(),
    })

    notification.on('click', () => {
      const win = BrowserWindow.getAllWindows().find((w) => !w.isDestroyed())
      if (!win) return

      if (win.isMinimized()) win.restore()
      if (!win.isVisible()) win.show()
      win.focus()
      sendActivateWorkspace(workspaceId)
    })

    notification.show()
  }

  private sendActivity(workspaceIds: string[]): void {
    for (const win of BrowserWindow.getAllWindows()) {
      if (!win.isDestroyed()) {
        win.webContents.send(IPC.CLAUDE_ACTIVITY_UPDATE, workspaceIds)
      }
    }
  }
}
