'use strict'

/**
 * 对 vendor/ 下的上游代码应用最小补丁。
 *
 * 设计原则：
 * 1. 只改 3 个文件、4 处代码，每处都带 [wish-export patch] 标记；
 * 2. 脚本可重复执行，已打过补丁的片段会跳过；
 * 3. 上游改动导致待替换片段消失时，脚本直接失败并指出文件，
 *    避免静默保留过期补丁。
 */

const fs = require('node:fs')
const path = require('node:path')

const ROOT = path.resolve(__dirname, '..')
const GAMES = ['genshin', 'starrail']

const PATCHES = [
  {
    id: 'utils-app-root',
    file: 'src/main/utils.js',
    marker: 'WISH_APP_ROOT',
    target: "const appRoot = isDev ? path.resolve(__dirname, '..', '..') : path.resolve(app.getAppPath(), '..', '..')",
    replacement: [
      '// [wish-export patch] 统一入口注入数据根目录',
      "const appRoot = process.env.WISH_APP_ROOT || (isDev ? path.resolve(__dirname, '..', '..') : path.resolve(app.getAppPath(), '..', '..'))"
    ].join('\n')
  },
  {
    id: 'utils-user-data',
    file: 'src/main/utils.js',
    marker: "path.resolve(appRoot, 'userData', process.env.WISH_GAME",
    target: "const userDataPath = path.resolve(appRoot, 'userData')",
    replacement: [
      '// [wish-export patch] 每个游戏使用独立数据目录',
      "const userDataPath = path.resolve(appRoot, 'userData', process.env.WISH_GAME || 'default')"
    ].join('\n')
  },
  {
    id: 'main-renderer',
    file: 'src/main/main.js',
    marker: 'WISH_RENDERER',
    target: "isDev ? win.loadURL(`http://localhost:${process.env.PORT}`) : win.loadFile('dist/electron/renderer/index.html')",
    replacement: [
      '// [wish-export patch] 渲染进程入口由统一入口注入',
      '  const rendererUrl = process.env.WISH_DEV_SERVER_URL',
      "  const rendererFile = process.env.WISH_RENDERER || 'dist/electron/renderer/index.html'",
      '  if (rendererUrl) win.loadURL(rendererUrl)',
      '  else win.loadFile(rendererFile)'
    ].join('\n')
  },
  {
    id: 'update-disabled',
    file: 'src/main/update/index.js',
    marker: 'WISH_UPDATE_DISABLED',
    target: 'const update = async () => {\n  if (isDev) return',
    replacement: [
      'const update = async () => {',
      '  // [wish-export patch] 统一入口禁用上游自更新，避免覆盖统一安装目录',
      "  if (isDev || process.env.WISH_UPDATE_DISABLED === '1') return"
    ].join('\n')
  }
]

function toEol (text, eol) {
  return text.replace(/\r?\n/g, eol)
}

function main () {
  const missing = GAMES.filter(game => !fs.existsSync(path.join(ROOT, 'vendor', game, 'package.json')))
  if (missing.length) {
    console.error('[patch-vendor] 以下上游目录尚未导入：')
    for (const game of missing) console.error(`  - vendor/${game}`)
    console.error('[patch-vendor] 请先运行：yarn import-upstream')
    process.exitCode = 1
    return
  }

  let applied = 0
  let skipped = 0

  for (const game of GAMES) {
    for (const patch of PATCHES) {
      const filePath = path.join(ROOT, 'vendor', game, patch.file)
      let source = fs.readFileSync(filePath, 'utf8')

      if (source.includes(patch.marker)) {
        skipped += 1
        continue
      }

      // 上游文件使用 CRLF，按原文件换行符匹配与写入，避免整文件换行变更
      const eol = source.includes('\r\n') ? '\r\n' : '\n'
      const target = toEol(patch.target, eol)
      const replacement = toEol(patch.replacement, eol)

      if (!source.includes(target)) {
        throw new Error(
          `[patch-vendor] ${game}/${patch.file} 未找到待替换片段（${patch.id}）。\n` +
          '上游可能改写了这段代码，请阅读 docs/upstream-sync.md 的冲突处理流程。'
        )
      }

      source = source.replace(target, replacement)
      fs.writeFileSync(filePath, source)
      applied += 1
      console.log(`[patch-vendor] ${game}/${patch.file} -> ${patch.id}`)
    }
  }

  console.log(`[patch-vendor] 完成：应用 ${applied} 处，跳过 ${skipped} 处（已存在）。`)
}

try {
  main()
} catch (error) {
  console.error(error.message)
  process.exitCode = 1
}
