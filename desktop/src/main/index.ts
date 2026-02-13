import {
  app,
  BrowserWindow,
  Menu,
  shell,
  type BrowserWindowConstructorOptions,
  type MenuItemConstructorOptions,
} from 'electron'
import { join } from 'path'
import { registerIpcHandlers } from './ipc'
import { NotificationWatcher } from './notification-watcher'
import { isMac, isWindows } from '../shared/platform'

let mainWindow: BrowserWindow | null = null
const notificationWatcher = new NotificationWatcher()

function buildMenuTemplate(): MenuItemConstructorOptions[] {
  if (isMac) {
    return [
      {
        label: app.name,
        submenu: [
          { role: 'about' },
          { type: 'separator' },
          { role: 'hide' },
          { role: 'hideOthers' },
          { role: 'unhide' },
          { type: 'separator' },
          { role: 'quit' },
        ],
      },
      {
        label: 'Edit',
        submenu: [
          { role: 'undo' },
          { role: 'redo' },
          { type: 'separator' },
          { role: 'cut' },
          { role: 'copy' },
          { role: 'paste' },
          { role: 'selectAll' },
        ],
      },
      {
        label: 'Window',
        submenu: [{ role: 'minimize' }, { role: 'zoom' }],
      },
    ]
  }

  return [
    {
      label: 'File',
      submenu: [{ role: 'close' }, { type: 'separator' }, { role: 'quit' }],
    },
    {
      label: 'Edit',
      submenu: [
        { role: 'undo' },
        { role: 'redo' },
        { type: 'separator' },
        { role: 'cut' },
        { role: 'copy' },
        { role: 'paste' },
        { role: 'delete' },
        { role: 'selectAll' },
      ],
    },
    {
      label: 'View',
      submenu: [
        { role: 'reload' },
        { role: 'forceReload' },
        { role: 'toggleDevTools' },
        { type: 'separator' },
        { role: 'resetZoom' },
        { role: 'zoomIn' },
        { role: 'zoomOut' },
        { type: 'separator' },
        { role: 'togglefullscreen' },
      ],
    },
    {
      label: 'Window',
      submenu: [{ role: 'minimize' }, { role: 'zoom' }, { role: 'close' }],
    },
  ]
}

function createWindow(): void {
  const windowOptions: BrowserWindowConstructorOptions = {
    width: 1400,
    height: 900,
    minWidth: 900,
    minHeight: 600,
    backgroundColor: '#13141b',
    show: false,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: false, // needed for node-pty IPC
    },
  }

  if (isMac) {
    windowOptions.titleBarStyle = 'hiddenInset'
    windowOptions.trafficLightPosition = { x: 12, y: 12 }
  } else if (isWindows) {
    windowOptions.frame = true
  }

  mainWindow = new BrowserWindow(windowOptions)

  // Show window when ready to avoid white flash (skip in tests)
  if (!process.env.CI_TEST) {
    mainWindow.on('ready-to-show', () => {
      mainWindow?.show()
    })
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

app.setName('Constellagent')

// Isolate test data so e2e tests never touch real app state
if (process.env.CI_TEST) {
  const { mkdtempSync } = require('fs')
  const { join } = require('path')
  const testData = mkdtempSync(join(require('os').tmpdir(), 'constellagent-test-'))
  app.setPath('userData', testData)
}

app.whenReady().then(() => {
  const menu = Menu.buildFromTemplate(buildMenuTemplate())
  Menu.setApplicationMenu(menu)

  registerIpcHandlers()
  notificationWatcher.start()
  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow()
    }
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

app.on('before-quit', () => {
  notificationWatcher.stop()
})
