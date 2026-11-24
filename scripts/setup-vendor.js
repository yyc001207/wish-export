'use strict'

/**
 * 安装两个上游的构建依赖。
 *
 * 跳过 postinstall 与 Electron 二进制下载：
 * - 构建 renderer / main 只需要 vite、rollup、esbuild；
 * - Electron 由根目录 package.json 提供，避免重复下载两份约 100MB 的运行时。
 *
 * 如果需要在 vendor 内使用上游的 `yarn dev` 热更新，请进入对应目录执行
 * 完整安装：yarn install（会下载该目录自己的 Electron）。
 */

const { spawnSync } = require('node:child_process')
const fs = require('node:fs')
const path = require('node:path')

const ROOT = path.resolve(__dirname, '..')
const GAMES = ['genshin', 'starrail']
const YARN = process.platform === 'win32' ? 'yarn.cmd' : 'yarn'

function main () {
  let failed = false

  for (const game of GAMES) {
    const cwd = path.join(ROOT, 'vendor', game)
    if (!fs.existsSync(path.join(cwd, 'package.json'))) {
      console.error(`[setup] vendor/${game} 未导入，跳过。请先运行 yarn import-upstream`)
      failed = true
      continue
    }

    console.log(`\n[setup] 安装 vendor/${game} 依赖（跳过 scripts 与 Electron 二进制）`)
    const result = spawnSync(YARN, ['install', '--ignore-scripts', '--frozen-lockfile'], {
      cwd,
      stdio: 'inherit',
      shell: process.platform === 'win32',
      env: { ...process.env, ELECTRON_SKIP_BINARY_DOWNLOAD: '1' }
    })

    if (result.error) {
      console.error(`[setup] ${game} 执行 yarn 失败：${result.error.message}`)
      failed = true
    } else if (result.status !== 0) {
      console.error(`[setup] ${game} 依赖安装失败，退出码 ${result.status}`)
      failed = true
    }
  }

  if (failed) {
    process.exitCode = 1
    return
  }

  console.log('\n[setup] 完成。下一步：yarn build:games')
}

main()
