'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')

const {
  isLegacyDataFile,
  listLegacyDataFiles,
  resolveLegacyDataDir,
  importLegacyData
} = require('../../apps/desktop/src/main/import-legacy-data')

function makeTempDir () {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'wish-import-'))
}

test('isLegacyDataFile: 只认 config.json 与 gacha-list-<uid>.json', () => {
  assert.equal(isLegacyDataFile('config.json'), true)
  assert.equal(isLegacyDataFile('gacha-list-100083870.json'), true)
  assert.equal(isLegacyDataFile('gacha-list-abc.json'), false)
  assert.equal(isLegacyDataFile('gacha-list-100083870.json.bak'), false)
  assert.equal(isLegacyDataFile('log.txt'), false)
  assert.equal(isLegacyDataFile('window-state.json'), false)
})

test('resolveLegacyDataDir: 安装目录、userData 目录、数据目录都能解析', () => {
  const root = makeTempDir()

  try {
    const installDir = path.join(root, 'genshin-wish-export')
    const dataDir = path.join(installDir, 'userData')
    fs.mkdirSync(dataDir, { recursive: true })
    fs.writeFileSync(path.join(dataDir, 'config.json'), '{}')

    assert.equal(resolveLegacyDataDir(installDir), dataDir)
    assert.equal(resolveLegacyDataDir(dataDir), dataDir)
    assert.equal(resolveLegacyDataDir(root), '')
    assert.equal(resolveLegacyDataDir(''), '')
  } finally {
    fs.rmSync(root, { recursive: true, force: true })
  }
})

test('importLegacyData: 只复制数据文件，不覆盖已有文件', () => {
  const root = makeTempDir()

  try {
    const sourceDir = path.join(root, 'legacy', 'userData')
    const targetDir = path.join(root, 'target', 'genshin')
    fs.mkdirSync(sourceDir, { recursive: true })

    fs.writeFileSync(path.join(sourceDir, 'config.json'), 'legacy-config')
    fs.writeFileSync(path.join(sourceDir, 'gacha-list-100.json'), 'legacy-list')
    fs.writeFileSync(path.join(sourceDir, 'log.txt'), 'legacy-log')
    fs.writeFileSync(path.join(sourceDir, 'window-state.json'), '{}')

    fs.mkdirSync(targetDir, { recursive: true })
    fs.writeFileSync(path.join(targetDir, 'config.json'), 'target-config')

    const result = importLegacyData({ sourceDir, targetDir })

    assert.deepEqual(result, { copied: 1, skipped: 1 })
    assert.equal(fs.readFileSync(path.join(targetDir, 'config.json'), 'utf8'), 'target-config')
    assert.equal(fs.readFileSync(path.join(targetDir, 'gacha-list-100.json'), 'utf8'), 'legacy-list')
    assert.equal(fs.existsSync(path.join(targetDir, 'log.txt')), false)
    assert.equal(fs.existsSync(path.join(targetDir, 'window-state.json')), false)
  } finally {
    fs.rmSync(root, { recursive: true, force: true })
  }
})

test('importLegacyData: 目标目录不存在时自动创建', () => {
  const root = makeTempDir()

  try {
    const sourceDir = path.join(root, 'legacy')
    const targetDir = path.join(root, 'target', 'starrail')
    fs.mkdirSync(sourceDir, { recursive: true })
    fs.writeFileSync(path.join(sourceDir, 'config.json'), '{}')

    const result = importLegacyData({ sourceDir, targetDir })

    assert.deepEqual(result, { copied: 1, skipped: 0 })
    assert.equal(fs.existsSync(path.join(targetDir, 'config.json')), true)
  } finally {
    fs.rmSync(root, { recursive: true, force: true })
  }
})

test('listLegacyDataFiles: 文件不存在时返回空数组', () => {
  assert.deepEqual(listLegacyDataFiles(path.join(os.tmpdir(), 'wish-missing-dir')), [])
  assert.deepEqual(listLegacyDataFiles(''), [])
})

test('importLegacyData: 缺少目录参数时抛错', () => {
  assert.throws(() => importLegacyData({ sourceDir: '', targetDir: 'x' }), /缺少原版数据目录/)
  assert.throws(() => importLegacyData({ sourceDir: 'x', targetDir: '' }), /缺少目标数据目录/)
})
