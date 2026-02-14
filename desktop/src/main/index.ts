import {
  app,
  BrowserWindow,
  Menu,
  nativeImage,
  shell,
  type BrowserWindowConstructorOptions,
} from 'electron'
import { join } from 'path'
import { arch, platform, release, tmpdir, version as osVersion } from 'os'
import { debugLog, resolveDefaultShell } from '@shared/platform'
import { CREATE_WORKTREE_STAGES, type CreateWorktreeProgressEvent } from '../shared/workspace-creation'
import { registerIpcHandlers } from './ipc'
import { NotificationWatcher } from './notification-watcher'
import { loadWindowState, saveWindowState } from './window-state'

let mainWindow: BrowserWindow | null = null
const notificationWatcher = new NotificationWatcher()
let unreadWorkspaceCount = 0
let windowStateTimer: ReturnType<typeof setTimeout> | null = null

function setMainWindowProgress(progress: CreateWorktreeProgressEvent): void {
  if (!mainWindow || mainWindow.isDestroyed()) return
  const stageIndex = CREATE_WORKTREE_STAGES.indexOf(progress.stage)
  const value = stageIndex >= 0
    ? (stageIndex + 1) / CREATE_WORKTREE_STAGES.length
    : 0.1
  mainWindow.setProgressBar(value)
}

function clearMainWindowProgress(): void {
  if (!mainWindow || mainWindow.isDestroyed()) return
  mainWindow.setProgressBar(-1)
}

function createOverlayBadge(count: number) {
  const label = count > 99 ? '99+' : String(count)
  const fontSize = label.length > 2 ? 16 : 18
  const svg = [
    '<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64">',
    '<circle cx="32" cy="32" r="30" fill="#d12d2d" />',
    `<text x="32" y="40" text-anchor="middle" font-size="${fontSize}" font-family="Segoe UI, sans-serif" font-weight="700" fill="#ffffff">${label}</text>`,
    '</svg>',
  ].join('')
  const dataUrl = `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`
  return nativeImage.createFromDataURL(dataUrl).resize({ width: 32, height: 32 })
}

function syncUnreadOverlay(): void {
  if (!mainWindow || mainWindow.isDestroyed() || process.platform !== 'win32') return
  if (unreadWorkspaceCount <= 0) {
    mainWindow.setOverlayIcon(null, '')
    return
  }
  const badge = createOverlayBadge(unreadWorkspaceCount)
  mainWindow.setOverlayIcon(
    badge,
    `${unreadWorkspaceCount} unread workspace notification${unreadWorkspaceCount === 1 ? '' : 's'}`,
  )
}

function scheduleWindowStateSave(): void {
  if (windowStateTimer) clearTimeout(windowStateTimer)
  windowStateTimer = setTimeout(() => {
    if (!mainWindow || mainWindow.isDestroyed()) return
    saveWindowState(mainWindow)
  }, 200)
}

function createWindow(): void {
  const isWindows = process.platform === 'win32'
  const initialWindowState = loadWindowState()
  const windowOptions: BrowserWindowConstructorOptions = {
    x: initialWindowState.bounds?.x,
    y: initialWindowState.bounds?.y,
    width: initialWindowState.bounds?.width ?? 1400,
    height: initialWindowState.bounds?.height ?? 900,
    minWidth: 900,
    minHeight: 600,
    backgroundColor: '#121013',
    show: false,
    frame: true,
    autoHideMenuBar: true,
    titleBarStyle: isWindows ? 'hidden' : 'default',
    titleBarOverlay: isWindows
      ? {
          color: '#121013',
          symbolColor: '#f4edf7',
          height: 38,
        }
      : false,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: false, // needed for node-pty IPC
    },
  }

  mainWindow = new BrowserWindow(windowOptions)
  mainWindow.removeMenu()
  mainWindow.setMenuBarVisibility(false)
  syncUnreadOverlay()
  mainWindow.on('move', scheduleWindowStateSave)
  mainWindow.on('resize', scheduleWindowStateSave)
  mainWindow.on('maximize', scheduleWindowStateSave)
  mainWindow.on('unmaximize', scheduleWindowStateSave)

  // Show window when ready to avoid white flash (skip in tests)
  if (!process.env.CI_TEST) {
    mainWindow.on('ready-to-show', () => {
      mainWindow?.show()
      if (initialWindowState.isMaximized) {
        mainWindow?.maximize()
      }
    })
  } else if (initialWindowState.isMaximized) {
    mainWindow.maximize()
  }

  // Open external links in browser
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url)
    return { action: 'deny' }
  })

  // Load renderer
  if (process.env.ELECTRON_RENDERER_URL) {
    mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL)
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

app.setName('Terminator')
if (process.platform === 'win32') {
  app.setAppUserModelId('com.terminator.app')
}

function setupWindowsJumpList(): void {
  if (process.platform !== 'win32') return

  app.setJumpList([
    {
      type: 'tasks',
      items: [
        {
          type: 'task',
          title: 'New Terminal',
          description: 'Start Terminator and open a new terminal',
          program: process.execPath,
          args: '--jump-new-terminal',
          iconPath: process.execPath,
          iconIndex: 0,
        },
        {
          type: 'task',
          title: 'Open Project',
          description: 'Start Terminator and open the project picker',
          program: process.execPath,
          args: '--jump-open-project',
          iconPath: process.execPath,
          iconIndex: 0,
        },
      ],
    },
  ])
}

// Isolate test data so e2e tests never touch real app state
if (process.env.CI_TEST) {
  const { mkdtempSync } = require('fs')
  const { join } = require('path')
  const testData = mkdtempSync(join(require('os').tmpdir(), 'terminator-test-'))
  app.setPath('userData', testData)
}

app.whenReady().then(() => {
  const detectedShell = resolveDefaultShell()
  debugLog('Startup info', {
    platform: platform(),
    release: release(),
    version: osVersion(),
    arch: arch(),
    detectedShell,
    tempDir: tmpdir(),
    appPaths: {
      appPath: app.getAppPath(),
      exe: app.getPath('exe'),
      home: app.getPath('home'),
      appData: app.getPath('appData'),
      userData: app.getPath('userData'),
      temp: app.getPath('temp'),
      logs: app.getPath('logs'),
    },
  })

  Menu.setApplicationMenu(null)
  setupWindowsJumpList()

  registerIpcHandlers({
    onCreateWorktreeProgress: setMainWindowProgress,
    onCreateWorktreeComplete: clearMainWindowProgress,
    onUnreadCountChanged: (count) => {
      unreadWorkspaceCount = count
      syncUnreadOverlay()
    },
  })
  notificationWatcher.start()
  createWindow()
})

app.on('window-all-closed', () => {
  app.quit()
})

app.on('before-quit', () => {
  if (windowStateTimer) {
    clearTimeout(windowStateTimer)
    windowStateTimer = null
  }
  if (mainWindow && !mainWindow.isDestroyed()) {
    saveWindowState(mainWindow)
  }
  notificationWatcher.stop()
})
