import { app, BrowserWindow, type Rectangle, screen } from 'electron'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs'
import { join } from 'path'
import { debugLog } from '@shared/platform'

interface StoredWindowState {
  bounds: Rectangle
  isMaximized: boolean
}

export interface WindowState {
  bounds?: Rectangle
  isMaximized: boolean
}

const WINDOW_STATE_FILE = 'window-state.json'

function windowStatePath(): string {
  return join(app.getPath('userData'), WINDOW_STATE_FILE)
}

function isRectangleLike(value: unknown): value is Rectangle {
  if (!value || typeof value !== 'object') return false
  const candidate = value as Record<string, unknown>
  return (
    typeof candidate.x === 'number' &&
    typeof candidate.y === 'number' &&
    typeof candidate.width === 'number' &&
    typeof candidate.height === 'number'
  )
}

function intersects(a: Rectangle, b: Rectangle): boolean {
  return (
    a.x < b.x + b.width &&
    a.x + a.width > b.x &&
    a.y < b.y + b.height &&
    a.y + a.height > b.y
  )
}

function hasUsableSize(bounds: Rectangle): boolean {
  return bounds.width >= 400 && bounds.height >= 300
}

function isVisibleOnAnyDisplay(bounds: Rectangle): boolean {
  return screen.getAllDisplays().some((display) => intersects(bounds, display.workArea))
}

function parseStoredWindowState(data: unknown): WindowState {
  if (!data || typeof data !== 'object') return { isMaximized: false }
  const record = data as Record<string, unknown>
  const bounds = isRectangleLike(record.bounds) ? record.bounds : undefined
  const isMaximized = record.isMaximized === true
  if (!bounds || !hasUsableSize(bounds) || !isVisibleOnAnyDisplay(bounds)) {
    return { isMaximized: false }
  }
  return { bounds, isMaximized }
}

export function loadWindowState(): WindowState {
  const filePath = windowStatePath()
  if (!existsSync(filePath)) return { isMaximized: false }

  try {
    const raw = readFileSync(filePath, 'utf-8')
    return parseStoredWindowState(JSON.parse(raw) as unknown)
  } catch (error) {
    debugLog('Failed to load window state', { error })
    return { isMaximized: false }
  }
}

export function saveWindowState(win: BrowserWindow): void {
  const bounds = win.isMaximized()
    ? win.getNormalBounds()
    : win.getBounds()

  const payload: StoredWindowState = {
    bounds,
    isMaximized: win.isMaximized(),
  }

  try {
    mkdirSync(app.getPath('userData'), { recursive: true })
    writeFileSync(windowStatePath(), JSON.stringify(payload, null, 2), 'utf-8')
  } catch (error) {
    debugLog('Failed to save window state', { error })
  }
}
