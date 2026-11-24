'use strict'

const assert = require('node:assert')
const crypto = require('node:crypto')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const test = require('node:test')

const updater = require('../../apps/desktop/src/main/updater')

test('parseVersion 支持 v 前缀与预发布后缀', () => {
  assert.deepStrictEqual(updater.parseVersion('v1.2.3'), {
    major: 1,
    minor: 2,
    patch: 3,
    prerelease: ''
  })
  assert.strictEqual(updater.parseVersion('1.2.3-beta.1').prerelease, 'beta.1')
  assert.strictEqual(updater.parseVersion('abc'), null)
  assert.strictEqual(updater.parseVersion(''), null)
})

test('compareVersions 按数字比较，正式版大于预发布版', () => {
  assert.strictEqual(updater.compareVersions('0.2.0', '0.3.0'), -1)
  assert.strictEqual(updater.compareVersions('v0.3.0', '0.2.9'), 1)
  assert.strictEqual(updater.compareVersions('1.10.0', '1.9.0'), 1)
  assert.strictEqual(updater.compareVersions('0.2.0', '0.2.0'), 0)
  assert.strictEqual(updater.compareVersions('1.0.0', '1.0.0-beta.2'), 1)
  assert.strictEqual(updater.compareVersions('1.0.0-beta.1', '1.0.0'), -1)
  assert.strictEqual(updater.compareVersions('1.0.0-beta.2', '1.0.0-beta.1'), 1)
})

test('parseLatestRelease 从 release JSON 里挑出 exe、zip 与校验文件', () => {
  const release = updater.parseLatestRelease({
    tag_name: 'v0.3.0',
    assets: [
      { name: 'Wish-Export-0.3.0-x64.zip', browser_download_url: 'https://example.test/app.zip', size: 20 },
      { name: 'Wish-Export-0.3.0-x64.exe', browser_download_url: 'https://example.test/app.exe', size: 10 },
      { name: 'SHA256SUMS.txt', browser_download_url: 'https://example.test/SHA256SUMS.txt' }
    ]
  })

  assert.strictEqual(release.tag, 'v0.3.0')
  assert.strictEqual(release.version, '0.3.0')
  assert.deepStrictEqual(release.exe, {
    name: 'Wish-Export-0.3.0-x64.exe',
    url: 'https://example.test/app.exe',
    size: 10
  })
  assert.strictEqual(release.zip.name, 'Wish-Export-0.3.0-x64.zip')
  assert.strictEqual(release.sums.name, 'SHA256SUMS.txt')
})

test('parseLatestRelease 缺少 tag 或 exe 时报错', () => {
  assert.throws(() => updater.parseLatestRelease(null), /格式不正确/)
  assert.throws(() => updater.parseLatestRelease({ assets: [] }), /缺少 tag_name/)
  assert.throws(
    () => updater.parseLatestRelease({ tag_name: 'v1.0.0', assets: [{ name: 'notes.txt' }] }),
    /没有找到 x64 安装包/
  )
})

test('parseSha256Sums / expectedSha256 解析 sha256sum 格式', () => {
  const text = [
    'b4df37d4a977d40934ae923f10fbc733b287141a81a01b544daefd2d8ab2145f  Wish-Export-0.2.0-x64.exe',
    '2b117aaae3b5d2ae60310d6648e416b74d86cc8b89eb6b51ba8af8b609e91f5f *Wish-Export-0.2.0-x64.zip',
    '',
    '不是校验行'
  ].join('\r\n')

  const sums = updater.parseSha256Sums(text)
  assert.strictEqual(Object.keys(sums).length, 2)
  assert.strictEqual(
    updater.expectedSha256(text, 'Wish-Export-0.2.0-x64.exe'),
    'b4df37d4a977d40934ae923f10fbc733b287141a81a01b544daefd2d8ab2145f'
  )
  assert.strictEqual(updater.expectedSha256(text, 'other.exe'), '')
  assert.deepStrictEqual(updater.parseSha256Sums(''), {})
})

test('sha256File 计算结果与 crypto 一致', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wish-updater-'))
  try {
    const file = path.join(dir, 'payload.bin')
    fs.writeFileSync(file, 'abc')
    const expected = crypto.createHash('sha256').update('abc').digest('hex')
    assert.strictEqual(await updater.sha256File(file), expected)
  } finally {
    fs.rmSync(dir, { recursive: true, force: true })
  }
})

test('buildInstallerArgs 使用 NSIS 静默安装并在安装后启动程序', () => {
  assert.deepStrictEqual(updater.buildInstallerArgs(), ['/S', '--force-run'])
})
