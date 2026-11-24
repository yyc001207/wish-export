'use strict'

const { app, BrowserWindow, dialog, ipcMain, Menu, nativeImage, shell, Tray } = require('electron')
const { spawn } = require('node:child_process')
const fs = require('node:fs')
const path = require('node:path')
const { migrateLegacyUserData } = require('./migrate-user-data')
const {
  findLegacyDataDirHint,
  importLegacyData,
  listLegacyDataFiles,
  resolveLegacyDataDir
} = require('./import-legacy-data')

const GAMES = {
  genshin: {
    id: 'genshin',
    name: '原神',
    subtitle: '祈愿记录导出'
  },
  starrail: {
    id: 'starrail',
    name: '崩坏：星穹铁道',
    subtitle: '跃迁记录导出'
  }
}

const GAME_IDS = Object.keys(GAMES)
const IS_DEV = !app.isPackaged
// 开发态：bootstrap.js 位于 apps/desktop/src/main，向上四级是仓库根目录
const APP_DIR = IS_DEV ? path.resolve(__dirname, '../../../..') : app.getAppPath()
// 打包后数据放到系统用户目录，更新/重装不会覆盖；开发态仍放在仓库根目录
const DATA_ROOT = IS_DEV ? APP_DIR : app.getPath('userData')
const GAMES_DIST = path.join(APP_DIR, 'dist', 'electron', 'games')
const LAUNCHER_HTML = path.join(APP_DIR, 'apps', 'desktop', 'src', 'launcher', 'index.html')
const LAUNCHER_PRELOAD = path.join(APP_DIR, 'apps', 'desktop', 'src', 'launcher', 'preload.js')
const APP_ICON = path.join(APP_DIR, 'apps', 'desktop', 'assets', 'icon.png')
const TRAY_ICON = path.join(APP_DIR, 'apps', 'desktop', 'assets', 'tray.png')
const WISH_GAME_ARG = '--wish-game='
const REQUESTED_GAME = getRequestedGame()

if (!IS_DEV) {
  try {
    // 把旧安装目录里的 userData/<game>/ 复制到 AppData，只补齐缺失文件
    const legacyRoot = path.resolve(APP_DIR, '..', '..', 'userData')
    const targetRoot = path.join(DATA_ROOT, 'userData')
    const { copied } = migrateLegacyUserData({
      legacyRoot,
      targetRoot,
      games: GAME_IDS
    })
    if (copied > 0) {
      console.log(`[data] 已从旧安装目录迁移 ${copied} 个文件到 ${targetRoot}`)
    }
  } catch (error) {
    console.error('[data] 旧数据迁移失败：', error)
  }
}

app.setAppUserModelId('org.wish-export.unified')

if (fs.existsSync(APP_ICON)) {
  app.on('browser-window-created', (event, window) => {
    if (!window.isDestroyed()) window.setIcon(APP_ICON)
  })
}

if (GAMES[REQUESTED_GAME]) {
  startGame(REQUESTED_GAME)
} else {
  startLauncher()
}

function getRequestedGame () {
  const arg = process.argv.find(item => item.startsWith(WISH_GAME_ARG))
  if (arg) return arg.slice(WISH_GAME_ARG.length)
  return process.env.WISH_GAME || ''
}

function getGameEntry (id) {
  return {
    main: path.join(GAMES_DIST, id, 'main', 'main.js'),
    renderer: path.join(GAMES_DIST, id, 'renderer', 'index.html')
  }
}

function isGameBuilt (id) {
  const entry = getGameEntry(id)
  return fs.existsSync(entry.main) && fs.existsSync(entry.renderer)
}

/**
 * 游戏子进程入口。
 * 只加载一个游戏的主进程模块：两个上游都注册了同名 ipcMain.handle，
 * 同时加载会抛 "Attempted to register a second handler"。
 */
function startGame (id) {
  const entry = getGameEntry(id)

  if (!isGameBuilt(id)) {
    app.whenReady().then(() => {
      dialog.showErrorBox(
        '缺少游戏构建',
        `未找到 ${GAMES[id].name} 的构建产物。\n\n请先在项目根目录运行：\n  yarn build:games`
      )
      app.quit()
    })
    return
  }

  process.env.WISH_GAME = id
  process.env.WISH_APP_ROOT = DATA_ROOT
  process.env.WISH_RENDERER = entry.renderer
  // 统一版本禁止触发上游自更新，否则会用原版 zip 覆盖整个安装目录
  process.env.WISH_UPDATE_DISABLED = '1'

  require(entry.main)
}

/**
 * 启动器常驻托盘；游戏以独立子进程运行。
 * 关闭游戏窗口时子进程退出，启动器重新显示并把入口恢复为可点击。
 */
function startLauncher () {
  const gotLock = app.requestSingleInstanceLock()
  if (!gotLock) {
    app.quit()
    return
  }

  let win = null
  let tray = null
  let trayReady = false
  let gameProcess = null
  let runningGame = ''
  let isQuitting = false

  ipcMain.handle('LAUNCHER_STATUS', () => getStatus())
  ipcMain.handle('LAUNCH_GAME', (event, id) => launchGame(id))
  ipcMain.handle('OPEN_DATA_DIR', async () => {
    const dir = path.join(DATA_ROOT, 'userData')
    fs.mkdirSync(dir, { recursive: true })
    return shell.openPath(dir)
  })
  ipcMain.handle('QUIT_APP', () => quitApp())
  ipcMain.handle('IMPORT_PICK_DIR', () => pickLegacyDir())
  ipcMain.handle('IMPORT_LEGACY_DATA', (event, payload) => importLegacy(payload))

  app.whenReady().then(async () => {
    await createTray()
    createWindow()
  })

  app.on('second-instance', () => showLauncher())
  app.on('activate', () => showLauncher())
  app.on('before-quit', () => {
    isQuitting = true
    stopGameProcess()
  })
  app.on('window-all-closed', () => {
    // 有托盘时保持常驻；托盘创建失败或明确退出时才结束进程
    if (isQuitting || !trayReady) app.quit()
  })
  app.on('quit', () => {
    if (tray) {
      tray.destroy()
      tray = null
    }
  })

  function getStatus () {
    return {
      version: app.getVersion(),
      dataDir: path.join(DATA_ROOT, 'userData'),
      runningGame,
      games: GAME_IDS.map(id => ({
        ...GAMES[id],
        built: isGameBuilt(id)
      }))
    }
  }

  function sendStatus () {
    if (!win || win.isDestroyed() || win.webContents.isDestroyed()) return
    win.webContents.send('LAUNCHER_STATUS_CHANGED', getStatus())
  }

  function createWindow () {
    if (win && !win.isDestroyed()) {
      showLauncher()
      return
    }

    win = new BrowserWindow({
      width: 780,
      height: 540,
      minWidth: 680,
      minHeight: 480,
      show: false,
      autoHideMenuBar: true,
      backgroundColor: '#0e1116',
      icon: fs.existsSync(APP_ICON) ? APP_ICON : undefined,
      webPreferences: {
        preload: LAUNCHER_PRELOAD,
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true
      }
    })

    win.loadFile(LAUNCHER_HTML)
    win.once('ready-to-show', () => {
      if (!isQuitting) win.show()
    })
    win.on('close', event => {
      // 点击窗口关闭按钮时收起到托盘，而不是退出整个程序
      if (!isQuitting && trayReady) {
        event.preventDefault()
        win.hide()
      }
    })
    win.on('closed', () => {
      win = null
    })
  }

  async function createTray () {
    try {
      let icon = null
      try {
        icon = nativeImage.createFromPath(TRAY_ICON)
      } catch (error) {
        icon = null
      }
      if (!icon || icon.isEmpty()) {
        try {
          icon = await app.getFileIcon(process.execPath, { size: 'small' })
        } catch (error) {
          icon = null
        }
      }
      tray = new Tray(icon || process.execPath)
      tray.setToolTip('Wish Export')
      tray.on('click', () => showLauncher())
      tray.on('double-click', () => showLauncher())
      trayReady = true
      updateTrayMenu()
    } catch (error) {
      tray = null
      trayReady = false
      console.error('[launcher] 创建托盘失败：', error)
    }
  }

  function updateTrayMenu () {
    if (!tray) return

    const items = [
      { label: '显示启动器', click: () => showLauncher() }
    ]
    if (runningGame && GAMES[runningGame]) {
      items.push({ label: `正在运行：${GAMES[runningGame].name}`, enabled: false })
    }
    items.push(
      { type: 'separator' },
      { label: '退出', click: () => quitApp() }
    )
    tray.setContextMenu(Menu.buildFromTemplate(items))
  }

  function showLauncher () {
    if (isQuitting) return
    if (!win || win.isDestroyed()) {
      if (app.isReady()) createWindow()
      return
    }
    if (win.isMinimized()) win.restore()
    win.show()
    win.focus()
  }

  function launchGame (id) {
    if (!GAMES[id]) {
      return { ok: false, message: '未知的游戏标识' }
    }
    if (runningGame) {
      return { ok: false, message: `${GAMES[runningGame].name} 正在运行，请先关闭当前游戏` }
    }
    if (!isGameBuilt(id)) {
      return { ok: false, message: `${GAMES[id].name} 尚未构建，请先运行 yarn build:games` }
    }

    const args = IS_DEV
      ? [APP_DIR, `${WISH_GAME_ARG}${id}`]
      : [`${WISH_GAME_ARG}${id}`]

    let child = null
    try {
      child = spawn(process.execPath, args, {
        env: { ...process.env, WISH_LAUNCHER_CHILD: '1' },
        stdio: IS_DEV ? 'inherit' : 'ignore'
      })
    } catch (error) {
      return { ok: false, message: `启动失败：${error.message}` }
    }

    gameProcess = child
    runningGame = id
    updateTrayMenu()
    sendStatus()
    if (win && !win.isDestroyed()) win.hide()

    child.on('error', error => {
      if (gameProcess !== child) return
      gameProcess = null
      runningGame = ''
      updateTrayMenu()
      sendStatus()
      showLauncher()
      console.error(`[launcher] ${GAMES[id].name} 启动失败：`, error)
    })

    child.on('exit', () => {
      if (gameProcess !== child) return
      gameProcess = null
      runningGame = ''
      updateTrayMenu()
      sendStatus()
      if (!isQuitting) showLauncher()
    })

    return { ok: true }
  }

  function quitApp () {
    isQuitting = true
    stopGameProcess()
    app.quit()
  }

  /**
   * 让用户选择原版独立程序的数据目录。
   * 原版数据在安装目录的 userData/ 下，也允许直接选 userData 或数据目录本身。
   */
  async function pickLegacyDir () {
    try {
      const options = {
        title: '选择原版程序的数据目录',
        buttonLabel: '选择',
        properties: ['openDirectory'],
        defaultPath: findLegacyDataDirHint() || undefined
      }
      const parent = win && !win.isDestroyed() ? win : undefined
      const result = parent
        ? await dialog.showOpenDialog(parent, options)
        : await dialog.showOpenDialog(options)

      if (result.canceled || !result.filePaths.length) return { canceled: true }

      const selected = result.filePaths[0]
      const dir = resolveLegacyDataDir(selected)
      if (!dir) return { canceled: false, dir: selected, count: 0 }
      return { canceled: false, dir, count: listLegacyDataFiles(dir).length }
    } catch (error) {
      console.error('[import] 选择目录失败：', error)
      return { canceled: true, error: error.message }
    }
  }

  /**
   * 把原版数据复制到 userData/<game>/，只复制不覆盖。
   * 游戏运行中允许导入会与上游读写同一目录，直接拒绝。
   */
  function importLegacy (payload) {
    const { dir, game } = payload || {}

    if (!GAMES[game]) return { ok: false, message: '未知的游戏标识' }
    if (runningGame) {
      return { ok: false, message: `${GAMES[runningGame].name} 正在运行，请先关闭当前游戏` }
    }

    try {
      const sourceDir = resolveLegacyDataDir(dir)
      if (!sourceDir) {
        return { ok: false, message: '没有在所选目录中找到 config.json 或 gacha-list-*.json' }
      }

      const targetDir = path.join(DATA_ROOT, 'userData', game)
      const { copied, skipped } = importLegacyData({ sourceDir, targetDir })
      return { ok: true, copied, skipped, targetDir }
    } catch (error) {
      console.error('[import] 导入旧数据失败：', error)
      return { ok: false, message: error.message }
    }
  }

  function stopGameProcess () {
    const child = gameProcess
    if (!child) return

    gameProcess = null
    runningGame = ''
    updateTrayMenu()

    if (process.platform === 'win32' && child.pid) {
      spawn('taskkill', ['/PID', String(child.pid), '/T', '/F'], { stdio: 'ignore' })
    } else {
      child.kill()
    }
  }
}
