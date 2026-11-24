'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')

const { migrateLegacyUserData } = require('../../apps/desktop/src/main/migrate-user-data')

test('migrateLegacyUserData: 复制缺失文件，不覆盖已存在文件', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'wish-migrate-'))

  try {
    const legacyRoot = path.join(root, 'legacy')
    const targetRoot = path.join(root, 'target')

    fs.mkdirSync(path.join(legacyRoot, 'genshin', 'nested'), { recursive: true })
    fs.writeFileSync(path.join(legacyRoot, 'genshin', 'a.json'), 'old-a')
    fs.writeFileSync(path.join(legacyRoot, 'genshin', 'b.json'), 'old-b')
    fs.writeFileSync(path.join(legacyRoot, 'genshin', 'nested', 'c.json'), 'old-c')

    fs.mkdirSync(path.join(targetRoot, 'genshin'), { recursive: true })
    fs.writeFileSync(path.join(targetRoot, 'genshin', 'a.json'), 'new-a')

    const result = migrateLegacyUserData({
      legacyRoot,
      targetRoot,
      games: ['genshin', 'starrail']
    })

    assert.equal(result.copied, 2)
    assert.equal(fs.readFileSync(path.join(targetRoot, 'genshin', 'a.json'), 'utf8'), 'new-a')
    assert.equal(fs.readFileSync(path.join(targetRoot, 'genshin', 'b.json'), 'utf8'), 'old-b')
    assert.equal(fs.readFileSync(path.join(targetRoot, 'genshin', 'nested', 'c.json'), 'utf8'), 'old-c')
  } finally {
    fs.rmSync(root, { recursive: true, force: true })
  }
})
