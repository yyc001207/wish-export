'use strict'

const fs = require('node:fs')
const path = require('node:path')

/**
 * 递归复制目录，但只复制目标中不存在的文件。
 * 用于把旧安装目录里的 userData 迁移到 AppData，避免覆盖新版本已经写入的数据。
 */
function copyDirMissing (source, target) {
  if (!fs.existsSync(source)) return 0

  fs.mkdirSync(target, { recursive: true })
  let copied = 0

  for (const entry of fs.readdirSync(source, { withFileTypes: true })) {
    const from = path.join(source, entry.name)
    const to = path.join(target, entry.name)

    if (entry.isDirectory()) {
      copied += copyDirMissing(from, to)
    } else if (!fs.existsSync(to)) {
      fs.copyFileSync(from, to)
      copied += 1
    }
  }

  return copied
}

/**
 * @param {object} options
 * @param {string} options.legacyRoot 旧安装目录下的 userData
 * @param {string} options.targetRoot 新数据根目录下的 userData
 * @param {string[]} options.games 需要迁移的游戏 id
 * @returns {{ copied: number }}
 */
function migrateLegacyUserData ({ legacyRoot, targetRoot, games }) {
  if (!legacyRoot || !targetRoot) return { copied: 0 }

  let copied = 0
  for (const game of games) {
    copied += copyDirMissing(
      path.join(legacyRoot, game),
      path.join(targetRoot, game)
    )
  }

  return { copied }
}

module.exports = { copyDirMissing, migrateLegacyUserData }
