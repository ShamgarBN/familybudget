/**
 * Electron main process for "Niemann Family Finances".
 *
 * The renderer is the same Vite-built React SPA that runs in the browser.
 * All app data lives in localStorage, which Electron stores at:
 *   ~/Library/Application Support/Niemann Family Finances/Local Storage/
 * That folder survives app updates — only delete the .app, never that folder,
 * if you want to keep the household's history.
 */

const { app, BrowserWindow, Menu, screen, shell } = require('electron')
const fs = require('node:fs')
const path = require('node:path')

const isDev = !app.isPackaged
const iconPath = path.join(__dirname, '..', 'build', 'icon.png')

/* ------------------------------------------------------------------ *
 * Single-instance lock
 * Two copies of this app pointed at the same Local Storage/ directory
 * would silently overwrite each other. Force focus on the existing window
 * instead, the same pattern Electron uses for its own apps.
 * ------------------------------------------------------------------ */
const gotLock = app.requestSingleInstanceLock()
if (!gotLock) {
  app.quit()
  return
}

/* ------------------------------------------------------------------ *
 * Persist window bounds across launches.
 * Stored next to userData/ so it travels with the app's data, not in
 * Local Storage/ where it would mix with the household's finance state.
 * ------------------------------------------------------------------ */
const DEFAULT_BOUNDS = { width: 1440, height: 900, x: undefined, y: undefined }

function boundsFile() {
  return path.join(app.getPath('userData'), 'window-bounds.json')
}

function loadBounds() {
  try {
    const raw = fs.readFileSync(boundsFile(), 'utf8')
    const parsed = JSON.parse(raw)
    if (
      parsed &&
      typeof parsed.width === 'number' &&
      typeof parsed.height === 'number'
    ) {
      return parsed
    }
  } catch {
    /* file missing or unreadable — fall back to defaults */
  }
  return { ...DEFAULT_BOUNDS }
}

/**
 * Reject saved bounds that would land off the visible desktop (e.g. user
 * unplugged a second monitor since last launch).
 */
function isOnScreen(bounds) {
  if (typeof bounds.x !== 'number' || typeof bounds.y !== 'number') return true
  const displays = screen.getAllDisplays()
  return displays.some((d) => {
    const a = d.workArea
    return (
      bounds.x >= a.x - 50 &&
      bounds.y >= a.y - 50 &&
      bounds.x + bounds.width <= a.x + a.width + 50 &&
      bounds.y + bounds.height <= a.y + a.height + 50
    )
  })
}

function saveBounds(win) {
  if (!win || win.isDestroyed()) return
  const bounds = win.getBounds()
  try {
    fs.writeFileSync(
      boundsFile(),
      JSON.stringify(bounds, null, 2),
      { mode: 0o600 },
    )
  } catch {
    /* ignore — losing window position is non-critical */
  }
}

/**
 * Block in-window navigation to anything other than our local bundle and the
 * Vite dev server. Belt-and-suspenders against a compromised dependency trying
 * to redirect the renderer to a malicious URL.
 */
function lockDownNavigation(contents) {
  const allowed = new Set()
  if (isDev) allowed.add('http://localhost:5173')

  contents.on('will-navigate', (event, url) => {
    if (url.startsWith('file://')) return
    if ([...allowed].some((prefix) => url.startsWith(prefix))) return
    event.preventDefault()
    shell.openExternal(url)
  })

  contents.setWindowOpenHandler(({ url }) => {
    // Anything that tries to spawn a new window is treated as an external link
    // and handed off to the default browser.
    shell.openExternal(url)
    return { action: 'deny' }
  })
}

let mainWindow = null

function createWindow() {
  const saved = loadBounds()
  const bounds = isOnScreen(saved) ? saved : { ...DEFAULT_BOUNDS }

  const win = new BrowserWindow({
    width: bounds.width,
    height: bounds.height,
    x: bounds.x,
    y: bounds.y,
    minWidth: 1024,
    minHeight: 640,
    title: 'Niemann Family Finances',
    backgroundColor: '#f0f3f8',
    icon: iconPath,
    titleBarStyle: 'hiddenInset',
    show: false,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      // No preload exposed; renderer has no Node access by design.
    },
  })

  mainWindow = win

  win.once('ready-to-show', () => win.show())

  // Persist bounds whenever the user moves or resizes (debounced).
  let boundsTimer = null
  const queueSave = () => {
    if (boundsTimer) clearTimeout(boundsTimer)
    boundsTimer = setTimeout(() => saveBounds(win), 500)
  }
  win.on('move', queueSave)
  win.on('resize', queueSave)
  win.on('close', () => saveBounds(win))
  win.on('closed', () => {
    if (mainWindow === win) mainWindow = null
  })

  lockDownNavigation(win.webContents)

  if (isDev) {
    win.loadURL('http://localhost:5173')
    win.webContents.openDevTools({ mode: 'detach' })
  } else {
    win.loadFile(path.join(__dirname, '..', 'dist', 'index.html'))
  }
}

// Second-launch attempts focus the existing window rather than spawning a new one.
app.on('second-instance', () => {
  if (!mainWindow) return
  if (mainWindow.isMinimized()) mainWindow.restore()
  mainWindow.show()
  mainWindow.focus()
})

app.whenReady().then(() => {
  // Default macOS menu is fine for a tool like this — gives the wife
  // standard Edit (undo/redo/copy/paste/select-all) and Window (minimize, zoom)
  // menus. We only override the app menu's "About" label below.
  if (process.platform === 'darwin') {
    const template = Menu.getApplicationMenu()?.items ?? []
    if (template.length > 0) {
      // No-op: keep default menu. Hook left here in case we want to add a
      // "Backup data…" item later.
    }
  }

  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

// Defense-in-depth: refuse any new webContents that aren't our main window.
app.on('web-contents-created', (_event, contents) => {
  lockDownNavigation(contents)
})
