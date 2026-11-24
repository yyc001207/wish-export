'use strict'

const fs = require('node:fs')
const path = require('node:path')

const CONFIG_FILE = 'config.json'
// 与上游 getData.js 的匹配规则保持一致
const LIST_FILE_PATTERN = /^gacha-list-\d+\.json$/
// 原版独立程序的常见产品名，用于把文件选择框的默认目录填到安装目录
const LEGACY_PRODUCT_NAMES = [
  'genshin-wish-export',
  'star-rail-warp-export',
  'Genshin Wish Export',
  'Star Rail Warp Export'
]

function isLegacyDataFile (name) {
  return name === CONFIG_FILE || LIST_FILE_PATTERN.test(name)
}

/**
 * 只列出原版程序会写入的数据文件：config.json 与 gacha-list-<uid>.json。
 * 不返回日志、窗口状态等其他文件，避免把无关内容复制进新数据目录。
 */
function listLegacyDataFiles (dir) {
  if (!dir) return []

  try {
    return fs
      .readdirSync(dir, { withFileTypes: true })
      .filter(entry => entry.isFile() && isLegacyDataFile(entry.name))
      .map(entry => entry.name)
      .sort()
  } catch (error) {
    return []
  }
}

/**
 * 原版程序把数据写在安装目录的 userData/ 里。
 * 用户可能选安装目录、userData 目录或直接选数据目录，这里统一解析出真正含数据的目录。
 *
 * @param {string} selected 用户选择的目录
 * @returns {string} 数据目录；找不到数据文件时返回空字符串
 */
function resolveLegacyDataDir (selected) {
  if (!selected) return ''

  const direct = path.resolve(selected)
  if (listLegacyDataFiles(direct).length) return direct

  const nested = path.join(direct, 'userData')
  if (listLegacyDataFiles(nested).length) return nested

  return ''
}

/**
 * 把原版独立程序的数据复制到统一版数据目录。
 * 只复制、不移动、不覆盖：目标里已存在的同名文件一律跳过。
 *
 * @param {object} options
 * @param {string} options.sourceDir 原版数据目录（resolveLegacyDataDir 的结果）
 * @param {string} options.targetDir 统一版数据目录 userData/<game>/
 * @returns {{ copied: number, skipped: number }}
 */
function importLegacyData ({ sourceDir, targetDir }) {
  if (!sourceDir) throw new Error('缺少原版数据目录')
  if (!targetDir) throw new Error('缺少目标数据目录')

  const files = listLegacyDataFiles(sourceDir)
  fs.mkdirSync(targetDir, { recursive: true })

  let copied = 0
  let skipped = 0

  for (const name of files) {
    const to = path.join(targetDir, name)
    if (fs.existsSync(to)) {
      skipped += 1
      continue
    }
    fs.copyFileSync(path.join(sourceDir, name), to)
    copied += 1
  }

  return { copied, skipped }
}

/**
 * 猜测原版程序的安装目录，作为文件选择框的默认位置。
 * 只做有限的目录枚举，不递归扫描磁盘。
 */
function findLegacyDataDirHint (env = process.env) {
  if (!env.LOCALAPPDATA) return ''

  const programs = path.join(env.LOCALAPPDATA, 'Programs')
  const candidates = LEGACY_PRODUCT_NAMES.map(name => path.join(programs, name))

  try {
    for (const entry of fs.readdirSync(programs, { withFileTypes: true })) {
      if (entry.isDirectory() && /wish-export|genshin|star.?rail/i.test(entry.name)) {
        candidates.push(path.join(programs, entry.name))
      }
    }
  } catch (error) {
    // Programs 目录不存在或不可读时只依赖固定候选
  }

  for (const dir of [...new Set(candidates)]) {
    if (fs.existsSync(dir) && resolveLegacyDataDir(dir)) return dir
  }

  return ''
}

module.exports = {
  CONFIG_FILE,
  LIST_FILE_PATTERN,
  LEGACY_PRODUCT_NAMES,
  isLegacyDataFile,
  listLegacyDataFiles,
  resolveLegacyDataDir,
  importLegacyData,
  findLegacyDataDirHint
}
