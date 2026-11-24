'use strict'

/**
 * 上游契约测试。
 *
 * 目的：subtree 同步之后，快速发现“上游接口/数据格式变了，
 * 但统一入口和适配层还没跟上”的情况。
 *
 * vendor 尚未导入时全部跳过，保证初始仓库与 CI 是绿的。
 */

const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const ROOT = path.resolve(__dirname, '..', '..')
const EXPECTED_CHANNELS = require('./expected-channels.json')
const GAMES = ['genshin', 'starrail']

const GACHA_TYPE_KEYS = {
  genshin: ['100', '200', '301', '302', '400', '500'],
  starrail: ['1', '2', '11', '12', '21', '22']
}

function walk (dir) {
  if (!fs.existsSync(dir)) return []
  const files = []
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name)
    if (entry.isDirectory()) files.push(...walk(fullPath))
    else files.push(fullPath)
  }
  return files
}

function readFile (...parts) {
  return fs.readFileSync(path.join(...parts), 'utf8')
}

function collectIpcChannels (gameRoot) {
  const mainDir = path.join(gameRoot, 'src', 'main')
  const moduleDir = path.join(mainDir, 'module') + path.sep
  const channels = new Set()

  for (const file of walk(mainDir).filter(file => {
    return file.endsWith('.js') && !file.startsWith(moduleDir)
  })) {
    const source = fs.readFileSync(file, 'utf8')
    for (const match of source.matchAll(/ipcMain\.handle\(\s*'([^']+)'/g)) {
      channels.add(match[1])
    }
  }

  return [...channels].sort()
}

for (const game of GAMES) {
  const gameRoot = path.join(ROOT, 'vendor', game)
  const imported = fs.existsSync(path.join(gameRoot, 'package.json'))
  const skip = imported ? false : `vendor/${game} 尚未导入，先运行 yarn import-upstream`

  test(`${game}: vendor 已导入`, { skip }, () => {
    assert.ok(imported)
  })

  test(`${game}: IPC 通道与快照一致`, { skip }, () => {
    assert.deepEqual(collectIpcChannels(gameRoot), [...EXPECTED_CHANNELS[game]].sort())
  })

  test(`${game}: gachaType 键集合未变化`, { skip }, () => {
    const data = JSON.parse(readFile(gameRoot, 'src', 'gachaType.json'))
    const lists = game === 'genshin'
      ? Object.values(data)
      : data.map(item => item[1])

    assert.ok(Array.isArray(lists) && lists.length > 0, 'gachaType 结构异常')

    const union = new Set()
    for (const list of lists) {
      assert.ok(list.length > 0, 'gachaType 存在空语言条目')
      for (const item of list) union.add(item.key)
    }

    assert.deepEqual([...union].sort(), [...GACHA_TYPE_KEYS[game]].sort())
  })

  test(`${game}: vendor 补丁标记存在`, { skip }, () => {
    const utils = readFile(gameRoot, 'src', 'main', 'utils.js')
    const main = readFile(gameRoot, 'src', 'main', 'main.js')
    const update = readFile(gameRoot, 'src', 'main', 'update', 'index.js')

    assert.match(utils, /WISH_APP_ROOT/, 'utils.js 缺少 WISH_APP_ROOT 补丁')
    assert.match(utils, /process\.env\.WISH_GAME/, 'utils.js 缺少 WISH_GAME 数据目录补丁')
    assert.match(main, /WISH_RENDERER/, 'main.js 缺少 WISH_RENDERER 补丁')
    assert.match(update, /WISH_UPDATE_DISABLED/, 'update/index.js 缺少禁用自更新补丁')
  })
}

test(
  'starrail: idJson 结构可用',
  { skip: !fs.existsSync(path.join(ROOT, 'vendor', 'starrail', 'src', 'idJson.json')) && 'vendor/starrail 尚未导入' },
  () => {
    const data = JSON.parse(readFile(ROOT, 'vendor', 'starrail', 'src', 'idJson.json'))
    // 顶层除了语言，还有一个 version 字段
    const locales = Object.keys(data).filter(key => key !== 'version')

    assert.ok(locales.length >= 1, 'idJson 缺少语言')
    assert.equal(typeof data.version, 'string', 'idJson 缺少 version 字段')

    for (const locale of locales) {
      const entries = Object.values(data[locale])
      assert.ok(entries.length > 100, `${locale} 条目数量异常`)
      for (const key of ['name', 'item_type', 'rank_type']) {
        assert.ok(key in entries[0], `${locale} 条目缺少字段 ${key}`)
      }
    }
  }
)
