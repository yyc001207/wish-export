'use strict'

const gameList = document.querySelector('#game-list')
const message = document.querySelector('#message')
const version = document.querySelector('#version')
const openDataButton = document.querySelector('#open-data')
const quitButton = document.querySelector('#quit')

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
  if (runningGame) {
    const game = status.games.find(item => item.id === runningGame)
    showMessage(`${game ? game.name : runningGame} 正在运行，关闭游戏窗口后会回到启动器`)
  } else {
    showMessage('')
  }

  renderGames(status.games, runningGame)
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
      enter.textContent = '请先关闭当前游戏'
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
    hint.textContent = '没有检测到任何游戏构建。先在项目根目录运行 yarn build:games，再重新打开启动器。'
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

function showMessage (text) {
  message.textContent = text
}
