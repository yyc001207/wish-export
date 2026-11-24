'use strict'

const gameList = document.querySelector('#game-list')
const message = document.querySelector('#message')
const version = document.querySelector('#version')
const openDataButton = document.querySelector('#open-data')
const quitButton = document.querySelector('#quit')
const importButton = document.querySelector('#import-data')
const importDialog = document.querySelector('#import-dialog')
const importDetail = document.querySelector('#import-detail')
const importGenshinButton = document.querySelector('#import-genshin')
const importStarrailButton = document.querySelector('#import-starrail')
const importCancelButton = document.querySelector('#import-cancel')

let runningGameId = ''
let gameNames = {}
let importSource = ''
let importBusy = false

window.launcher.onStatusChanged(status => {
  renderStatus(status)
})

init()

async function init () {
  try {
    const status = await window.launcher.getStatus()
    renderStatus(status)
  } catch (error) {
    showMessage(`读取启动信息失败：${error.message}`)
  }
}

function renderStatus (status) {
  version.textContent = `v${status.version}`

  const runningGame = status.runningGame || ''
  runningGameId = runningGame
  gameNames = {}
  for (const game of status.games) gameNames[game.id] = game.name

  if (runningGame) {
    const game = status.games.find(item => item.id === runningGame)
    showMessage(`${game ? game.name : runningGame} 正在运行，关闭分析工具窗口后会回到启动器`)
  } else {
    showMessage('')
  }

  renderGames(status.games, runningGame)
  syncImportButton()
}

function renderGames (games, runningGame) {
  const fragment = document.createDocumentFragment()
  const locked = Boolean(runningGame)

  for (const game of games) {
    const isRunning = game.id === runningGame
    const disabled = !game.built || locked

    const card = document.createElement('button')
    card.type = 'button'
    card.className = 'game-card'
    card.dataset.game = game.id
    card.disabled = disabled
    card.setAttribute('aria-disabled', String(disabled))

    const head = document.createElement('span')
    head.className = 'game-head'

    const name = document.createElement('span')
    name.className = 'game-name'
    name.textContent = game.name

    const subtitle = document.createElement('span')
    subtitle.className = 'game-subtitle'
    subtitle.textContent = game.subtitle

    head.append(name, subtitle)

    const status = document.createElement('span')
    status.className = isRunning
      ? 'game-status is-running'
      : game.built
        ? 'game-status is-ready'
        : 'game-status'
    status.textContent = isRunning ? '运行中' : game.built ? '已就绪' : '未构建'

    const enter = document.createElement('span')
    enter.className = 'game-enter'
    if (isRunning) {
      enter.textContent = '运行中…'
    } else if (locked) {
      enter.textContent = '请先关闭当前分析工具'
    } else {
      enter.textContent = game.built ? '进入工具 →' : '请先运行 yarn build:games'
    }

    card.append(head, status, enter)
    card.addEventListener('click', () => launchGame(game, card))
    fragment.append(card)
  }

  gameList.replaceChildren(fragment)

  if (!games.some(game => game.built)) {
    const hint = document.createElement('p')
    hint.className = 'empty-hint'
    hint.textContent = '没有检测到任何分析工具构建。先在项目根目录运行 yarn build:games，再重新打开启动器。'
    gameList.append(hint)
  }
}

async function launchGame (game, card) {
  if (card.disabled) return

  card.classList.add('is-loading')
  showMessage('')

  try {
    const result = await window.launcher.launch(game.id)
    card.classList.remove('is-loading')
    if (result && !result.ok) {
      showMessage(result.message)
    }
  } catch (error) {
    card.classList.remove('is-loading')
    showMessage(`启动失败：${error.message}`)
  }
}

openDataButton.addEventListener('click', () => {
  window.launcher.openDataDir()
})

quitButton.addEventListener('click', () => {
  window.launcher.quit()
})

importButton.addEventListener('click', pickAndImport)
importGenshinButton.addEventListener('click', () => applyImport('genshin'))
importStarrailButton.addEventListener('click', () => applyImport('starrail'))
importCancelButton.addEventListener('click', closeImportDialog)

importDialog.addEventListener('click', event => {
  if (event.target === importDialog) closeImportDialog()
})

document.addEventListener('keydown', event => {
  if (event.key === 'Escape' && !importDialog.hidden) closeImportDialog()
})

/**
 * 让用户选择原版独立程序的数据目录；选到数据后再问属于哪个游戏。
 * 选择框默认落在探测到的原版安装目录，用户也可以手动改。
 */
async function pickAndImport () {
  if (importButton.disabled) return

  importBusy = true
  syncImportButton()

  try {
    const picked = await window.launcher.pickLegacyDir()
    if (!picked || picked.canceled) return

    if (!picked.count) {
      showMessage('所选目录里没有找到 config.json 或 gacha-list-*.json。请选择原版程序的安装目录（里面含 userData 文件夹），或直接选择 userData 文件夹。')
      return
    }

    importSource = picked.dir
    importDetail.textContent = `找到 ${picked.count} 个数据文件：${picked.dir}。导入只复制文件，同名的已有文件不会被覆盖。`
    importDialog.hidden = false
    importGenshinButton.focus()
  } catch (error) {
    showMessage(`选择目录失败：${error.message}`)
  } finally {
    importBusy = false
    syncImportButton()
  }
}

async function applyImport (game) {
  if (importBusy || !importSource) return

  const source = importSource
  const name = gameNames[game] || game
  closeImportDialog()

  importBusy = true
  syncImportButton()
  showMessage(`正在把数据导入到 ${name} …`)

  try {
    const result = await window.launcher.importLegacyData(source, game)
    if (!result || !result.ok) {
      showMessage(`导入失败：${result && result.message ? result.message : '未知错误'}`)
      return
    }

    if (result.copied) {
      const skipped = result.skipped ? `，${result.skipped} 个已存在未覆盖` : ''
      showMessage(`已导入 ${result.copied} 个文件到 ${name} 的数据目录${skipped}。重新打开 ${name} 即可读取。`)
    } else {
      showMessage(`没有需要导入的新文件：${result.skipped} 个文件已存在，未覆盖。`)
    }
  } catch (error) {
    showMessage(`导入失败：${error.message}`)
  } finally {
    importBusy = false
    syncImportButton()
  }
}

function closeImportDialog () {
  importDialog.hidden = true
  importDetail.textContent = ''
  importSource = ''
}

function syncImportButton () {
  importButton.disabled = Boolean(runningGameId) || importBusy
  importButton.title = runningGameId ? '请先关闭正在运行的分析工具' : ''
}

function showMessage (text) {
  message.textContent = text
}
