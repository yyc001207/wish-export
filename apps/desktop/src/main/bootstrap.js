'use strict'

const { app, BrowserWindow, dialog, ipcMain, Menu, nativeImage, shell, Tray } = require('electron')
const { spawn } = require('node:child_process')
const fs = require('node:fs')
const path = require('node:path')
const { copyDirMissing, migrateLegacyUserData } = require('./migrate-user-data')
const {
  findLegacyDataDirHint,
  importLegacyData,
  listLegacyDataFiles,
  resolveLegacyDataDir
} = require('./import-legacy-data')
const updater = require('./updater')

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
const RELEASES_PAGE = 'https://github.com/yyc001207/wish-export/releases'
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
 * 分析工具子进程入口。
 * 只加载一个分析工具的主进程模块：两个上游都注册了同名 ipcMain.handle，
 * 同时加载会抛 "Attempted to register a second handler"。
 */
function startGame (id) {
  const entry = getGameEntry(id)

  if (!isGameBuilt(id)) {
    app.whenReady().then(() => {
      dialog.showErrorBox(
        '缺少分析工具构建',
        `未找到 ${GAMES[id].name} 的构建产物。\n\n请先在项目根目录运行：\n  yarn build:games`
      )
      app.quit()
    })
    return
  }

  process.env.WISH_GAME = id
  process.env.WISH_APP_ROOT = DATA_ROOT
  process.env.WISH_RENDERER = entry.renderer
  // 上游自更新永久禁用，否则会用原版 zip 覆盖整个安装目录；
  // 统一版本由启动器里的统一更新器负责更新（apps/desktop/src/main/updater.js）。
  process.env.WISH_UPDATE_DISABLED = '1'

  require(entry.main)
}

/**
 * 启动器常驻托盘；分析工具以独立子进程运行。
 * 关闭分析工具窗口时子进程退出，启动器重新显示并把入口恢复为可点击。
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
  let latestRelease = null
  let installerPath = ''
  let updateState = { status: 'idle', version: '', progress: 0, message: '' }

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
  ipcMain.handle('UPDATE_STATUS', () => updateState)
  ipcMain.handle('UPDATE_CHECK', () => checkUpdate({ manual: true }))
  ipcMain.handle('UPDATE_DOWNLOAD', () => downloadUpdate())
  ipcMain.handle('UPDATE_INSTALL', () => installUpdate())
  ipcMain.handle('OPEN_RELEASES', () => shell.openExternal(RELEASES_PAGE))

  app.whenReady().then(async () => {
    await createTray()
    createWindow()
    // 启动后静默检查一次；检查失败不打扰用户，底部按钮仍可手动重试
    setTimeout(() => {
      if (!isQuitting) checkUpdate()
    }, 1200)
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
      return { ok: false, message: '未知的分析工具标识' }
    }
    if (runningGame) {
      return { ok: false, message: `${GAMES[runningGame].name} 正在运行，请先关闭当前分析工具` }
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
   * 分析工具运行中允许导入会与上游读写同一目录，直接拒绝。
   */
  function importLegacy (payload) {
    const { dir, game } = payload || {}

    if (!GAMES[game]) return { ok: false, message: '未知的分析工具标识' }
    if (runningGame) {
      return { ok: false, message: `${GAMES[runningGame].name} 正在运行，请先关闭当前分析工具` }
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

  /**
   * 统一更新器：检查 → 下载并校验 → 退出启动器后由 NSIS 静默安装。
   * 上游自更新始终保持禁用（WISH_UPDATE_DISABLED），更新只走这里。
   */
  function setUpdaterState (patch) {
    updateState = { ...updateState, ...patch }
    if (win && !win.isDestroyed() && !win.webContents.isDestroyed()) {
      win.webContents.send('UPDATE_STATE_CHANGED', updateState)
    }
  }

  async function checkUpdate ({ manual = false } = {}) {
    if (!app.isPackaged) {
      setUpdaterState({ status: 'disabled', message: '开发模式不检查更新' })
      return updateState
    }
    if (updateState.status === 'downloading' || updateState.status === 'installing') {
      return updateState
    }

    setUpdaterState({ status: 'checking', message: '正在检查更新…', progress: 0 })
    try {
      const result = await updater.checkForUpdate({ currentVersion: app.getVersion() })
      if (result.updateAvailable) {
        latestRelease = result.release
        setUpdaterState({
          status: 'available',
          version: result.version,
          message: `发现新版本 v${result.version}`
        })
      } else {
        latestRelease = null
        setUpdaterState({ status: 'none', version: result.currentVersion, message: '已是最新版本' })
      }
    } catch (error) {
      console.error('[update] 检查更新失败：', error)
      setUpdaterState({
        status: 'error',
        message: manual ? `检查更新失败：${error.message}` : ''
      })
    }
    return updateState
  }

  async function downloadUpdate () {
    if (!latestRelease) await checkUpdate({ manual: true })
    if (!latestRelease) return updateState
    if (updateState.status === 'downloading') return updateState

    const dir = path.join(DATA_ROOT, 'updates')
    let lastPercent = -1
    setUpdaterState({ status: 'downloading', progress: 0, message: '正在下载新版本…' })
    try {
      const { filePath, verified } = await updater.downloadUpdate({
        release: latestRelease,
        dir,
        onProgress: (progress) => {
          const percent = Math.floor(progress * 100)
          if (percent === lastPercent) return
          lastPercent = percent
          setUpdaterState({ progress })
        }
      })
      installerPath = filePath
      setUpdaterState({
        status: 'ready',
        progress: 1,
        message: verified ? '新版本已下载并通过 SHA256 校验' : '新版本已下载（发布包未提供校验文件）'
      })
    } catch (error) {
      console.error('[update] 下载更新失败：', error)
      setUpdaterState({ status: 'error', message: `下载失败：${error.message}` })
    }
    return updateState
  }

  /** 安装前把 userData/ 再备份一份；备份失败不阻断，但会写日志。 */
  function backupUserData () {
    try {
      const source = path.join(DATA_ROOT, 'userData')
      if (!fs.existsSync(source)) return ''
      const target = path.join(DATA_ROOT, 'updates', `userData-backup-${app.getVersion()}`)
      if (fs.existsSync(target)) return target
      copyDirMissing(source, target)
      return target
    } catch (error) {
      console.error('[update] 备份 userData 失败：', error)
      return ''
    }
  }

  /**
   * 安装包会替换整个应用目录，必须等启动器退出后再运行。
   * 用一个等待脚本延迟 2 秒启动 NSIS，避免安装器读到被占用的 exe。
   */
  function installUpdate () {
    if (!installerPath || !fs.existsSync(installerPath)) {
      return { ok: false, message: '还没有下载安装包' }
    }
    if (runningGame) {
      return { ok: false, message: `${GAMES[runningGame].name} 正在运行，请先关闭当前分析工具` }
    }
    if (process.platform !== 'win32') {
      return { ok: false, message: '当前系统不支持自动安装，请从 Releases 手动下载' }
    }

    try {
      const backup = backupUserData()
      const scriptPath = path.join(DATA_ROOT, 'updates', 'install-update.cmd')
      const args = updater.buildInstallerArgs().join(' ')
      fs.writeFileSync(
        scriptPath,
        ['@echo off', 'timeout /t 2 /nobreak >nul', `start "" "${installerPath}" ${args}`].join('\r\n'),
        'utf8'
      )

      setUpdaterState({ status: 'installing', message: '正在安装新版本，程序即将重启…' })
      const child = spawn('cmd.exe', ['/c', scriptPath], { detached: true, stdio: 'ignore' })
      child.unref()

      isQuitting = true
      stopGameProcess()
      setTimeout(() => app.quit(), 300)
      return { ok: true, backup }
    } catch (error) {
      console.error('[update] 启动安装失败：', error)
      setUpdaterState({ status: 'error', message: `安装失败：${error.message}` })
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
