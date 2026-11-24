'use strict'

const { app, BrowserWindow, dialog, ipcMain, shell } = require('electron')
const fs = require('node:fs')
const path = require('node:path')

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
// 数据目录放在安装目录下，保持便携模式；开发态就是仓库根目录
const DATA_ROOT = IS_DEV ? APP_DIR : path.resolve(APP_DIR, '..', '..')
const GAMES_DIST = path.join(APP_DIR, 'dist', 'electron', 'games')
const LAUNCHER_HTML = path.join(APP_DIR, 'apps', 'desktop', 'src', 'launcher', 'index.html')
const LAUNCHER_PRELOAD = path.join(APP_DIR, 'apps', 'desktop', 'src', 'launcher', 'preload.js')
const WISH_GAME_ARG = '--wish-game='
const REQUESTED_GAME = getRequestedGame()

app.setAppUserModelId('org.wish-export.unified')

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
 * 启动单个游戏。
 * 这里必须只 require 一个游戏的主进程模块：
 * 两个上游都注册了同名 ipcMain.handle，同时加载会抛
 * "Attempted to register a second handler"。
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

  installReturnToLauncher()
  require(entry.main)
}

/**
 * 关闭游戏窗口后回到启动器，而不是直接退出整个程序。
 *
 * 上游 main.js 会在 window-all-closed 时调用 app.quit()。
 * 这里先注册同事件把状态记下来，再在 before-quit 中拦截一次，
 * 用不带 --wish-game 的参数重启，回到启动器。
 * 第二次 app.quit() 不再拦截，保证代理清理等 will-quit 逻辑正常执行。
 */
function installReturnToLauncher () {
  let allWindowsClosed = false
  let relaunching = false

  app.on('window-all-closed', () => {
    allWindowsClosed = true
  })

  app.on('before-quit', event => {
    if (!allWindowsClosed || relaunching) return

    relaunching = true
    event.preventDefault()

    const args = process.argv
      .slice(1)
      .filter(arg => !arg.startsWith(WISH_GAME_ARG))

    app.relaunch({ args })
    setImmediate(() => app.quit())
  })
}

function startLauncher () {
  const gotLock = app.requestSingleInstanceLock()
  if (!gotLock) {
    app.quit()
    return
  }

  let win = null

  ipcMain.handle('LAUNCHER_STATUS', () => ({
    version: app.getVersion(),
    appRoot: DATA_ROOT,
    dataDir: path.join(DATA_ROOT, 'userData'),
    games: GAME_IDS.map(id => ({
      ...GAMES[id],
      built: isGameBuilt(id)
    }))
  }))

  ipcMain.handle('LAUNCH_GAME', (event, id) => {
    if (!GAMES[id]) {
      return { ok: false, message: '未知的游戏标识' }
    }
    if (!isGameBuilt(id)) {
      return { ok: false, message: `${GAMES[id].name} 尚未构建，请先运行 yarn build:games` }
    }
    // 通过重启进程切换游戏，确保上一个游戏注册的 IPC 与模块状态被彻底清空。
    // app.relaunch 在 Electron 16 不保证透传自定义环境变量，因此用启动参数传递游戏 id。
    const args = process.argv
      .slice(1)
      .filter(arg => !arg.startsWith(WISH_GAME_ARG))
      .concat([`${WISH_GAME_ARG}${id}`])
    app.relaunch({ args })
    app.exit(0)
    return { ok: true }
  })

  ipcMain.handle('OPEN_DATA_DIR', async () => {
    const dir = path.join(DATA_ROOT, 'userData')
    fs.mkdirSync(dir, { recursive: true })
    return shell.openPath(dir)
  })

  ipcMain.handle('QUIT_APP', () => {
    app.quit()
  })

  const createWindow = () => {
    win = new BrowserWindow({
      width: 780,
      height: 540,
      minWidth: 680,
      minHeight: 480,
      show: false,
      autoHideMenuBar: true,
      backgroundColor: '#0e1116',
      webPreferences: {
        preload: LAUNCHER_PRELOAD,
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true
      }
    })

    win.loadFile(LAUNCHER_HTML)
    win.once('ready-to-show', () => win.show())
    win.on('closed', () => {
      win = null
    })
  }

  app.whenReady().then(createWindow)

  app.on('second-instance', () => {
    if (!win) return
    if (win.isMinimized()) win.restore()
    win.show()
    win.focus()
  })

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit()
  })

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
}
