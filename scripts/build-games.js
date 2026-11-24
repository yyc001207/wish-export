'use strict'

/**
 * 分别构建两个上游的 main / renderer，并收集到统一安装目录：
 *   dist/electron/games/<game>/main/main.js
 *   dist/electron/games/<game>/renderer/index.html
 *
 * 两个游戏各自使用自己的 node_modules，避免 element-plus 等依赖版本冲突。
 */

const { spawnSync } = require('node:child_process')
const fs = require('node:fs')
const path = require('node:path')

const ROOT = path.resolve(__dirname, '..')
const GAMES = ['genshin', 'starrail']
const OUTPUT = path.join(ROOT, 'dist', 'electron', 'games')

function assertVendorReady (game) {
  const vendorRoot = path.join(ROOT, 'vendor', game)
  if (!fs.existsSync(path.join(vendorRoot, 'package.json'))) {
    throw new Error(`vendor/${game} 未导入，请先运行 yarn import-upstream`)
  }
  if (!fs.existsSync(path.join(vendorRoot, 'node_modules', 'vite'))) {
    throw new Error(`vendor/${game} 依赖未安装，请先运行 yarn setup`)
  }
}

function buildGame (game) {
  const vendorRoot = path.join(ROOT, 'vendor', game)
  const vendorDist = path.join(vendorRoot, 'dist', 'electron')

  console.log(`\n[build] ${game}: 清理旧产物`)
  fs.rmSync(vendorDist, { recursive: true, force: true })

  console.log(`[build] ${game}: 构建 main + renderer`)
  const result = spawnSync(process.execPath, ['.electron-vite/build.js'], {
    cwd: vendorRoot,
    stdio: 'inherit',
    env: { ...process.env, NODE_ENV: 'production' }
  })

  if (result.error) throw result.error
  if (result.status !== 0) {
    throw new Error(`${game} 构建失败，退出码 ${result.status}`)
  }

  const builtMain = path.join(vendorDist, 'main', 'main.js')
  const builtRenderer = path.join(vendorDist, 'renderer', 'index.html')
  if (!fs.existsSync(builtMain)) throw new Error(`${game} 缺少 main 产物：${builtMain}`)
  if (!fs.existsSync(builtRenderer)) throw new Error(`${game} 缺少 renderer 产物：${builtRenderer}`)

  const targetRoot = path.join(OUTPUT, game)
  fs.rmSync(targetRoot, { recursive: true, force: true })
  fs.mkdirSync(targetRoot, { recursive: true })
  fs.cpSync(path.join(vendorDist, 'main'), path.join(targetRoot, 'main'), { recursive: true })
  fs.cpSync(path.join(vendorDist, 'renderer'), path.join(targetRoot, 'renderer'), { recursive: true })

  console.log(`[build] ${game}: 已输出到 dist/electron/games/${game}`)
}

function main () {
  fs.rmSync(OUTPUT, { recursive: true, force: true })

  for (const game of GAMES) {
    assertVendorReady(game)
    buildGame(game)
  }

  console.log('\n[build] 全部完成。运行 yarn dev 打开统一启动器。')
}

try {
  main()
} catch (error) {
  console.error(`\n[build] ${error.message}`)
  process.exitCode = 1
}
