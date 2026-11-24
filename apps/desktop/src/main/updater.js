/**
 * 统一更新器：从本仓库自己的 GitHub Release 读取最新版本，
 * 下载完整安装包、校验 SHA256，然后交给 NSIS 安装器替换整个应用目录。
 *
 * 这里不依赖 electron，方便在主进程里注入、也方便单测；
 * 网络部分只使用 Node 内置的 https/http，不引入新依赖。
 */

const crypto = require('crypto');
const fs = require('fs');
const http = require('http');
const https = require('https');
const path = require('path');

const DEFAULT_REPO = 'yyc001207/wish-export';
const RELEASES_API = 'https://api.github.com/repos/';
const USER_AGENT = 'Wish-Export-Updater';
const REQUEST_TIMEOUT = 20000;
const MAX_REDIRECTS = 5;

/** 解析 "v1.2.3" / "1.2.3" / "1.2.3-beta.1"，失败返回 null。 */
function parseVersion(text) {
  const match = /^v?(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?$/.exec(String(text || '').trim());
  if (!match) return null;
  return {
    major: Number(match[1]),
    minor: Number(match[2]),
    patch: Number(match[3]),
    prerelease: match[4] || '',
  };
}

/** 语义化比较：a>b 返回 1，a<b 返回 -1，相等返回 0；无法解析时退回字符串比较。 */
function compareVersions(a, b) {
  const left = parseVersion(a);
  const right = parseVersion(b);
  if (!left || !right) {
    const x = String(a || '');
    const y = String(b || '');
    return x === y ? 0 : x > y ? 1 : -1;
  }
  for (const key of ['major', 'minor', 'patch']) {
    if (left[key] !== right[key]) return left[key] > right[key] ? 1 : -1;
  }
  // 正式版大于预发布版；两个预发布版按字符串比较（够用，不追求完整 semver 规则）。
  if (!left.prerelease && right.prerelease) return 1;
  if (left.prerelease && !right.prerelease) return -1;
  if (left.prerelease === right.prerelease) return 0;
  return left.prerelease > right.prerelease ? 1 : -1;
}

function request(url, { timeout = REQUEST_TIMEOUT, redirects = MAX_REDIRECTS } = {}) {
  return new Promise((resolve, reject) => {
    const transport = url.startsWith('https:') ? https : http;
    const req = transport.get(
      url,
      {
        headers: {
          'User-Agent': USER_AGENT,
          Accept: 'application/vnd.github+json',
        },
      },
      (res) => {
        const status = res.statusCode || 0;
        if ([301, 302, 303, 307, 308].includes(status) && res.headers.location) {
          res.resume();
          if (redirects <= 0) {
            reject(new Error('重定向次数过多'));
            return;
          }
          const next = new URL(res.headers.location, url).toString();
          resolve(request(next, { timeout, redirects: redirects - 1 }));
          return;
        }
        if (status !== 200) {
          res.resume();
          reject(new Error(`请求失败：HTTP ${status}`));
          return;
        }
        resolve(res);
      }
    );
    req.setTimeout(timeout, () => req.destroy(new Error('请求超时')));
    req.on('error', reject);
  });
}

function readStream(stream) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    stream.on('data', (chunk) => chunks.push(chunk));
    stream.on('end', () => resolve(Buffer.concat(chunks)));
    stream.on('error', reject);
  });
}

async function fetchText(url) {
  const res = await request(url);
  const buffer = await readStream(res);
  return buffer.toString('utf8');
}

async function fetchJson(url) {
  return JSON.parse(await fetchText(url));
}

/** 把 release JSON 归一化成更新器需要的字段；缺少 exe 资产时抛错。 */
function parseLatestRelease(json) {
  if (!json || typeof json !== 'object') throw new Error('发布信息格式不正确');
  const tag = typeof json.tag_name === 'string' ? json.tag_name : '';
  if (!tag) throw new Error('发布信息缺少 tag_name');
  const assets = Array.isArray(json.assets) ? json.assets : [];
  const exe = assets.find((asset) => /-x64\.exe$/i.test(String(asset.name || '')));
  if (!exe) throw new Error(`版本 ${tag} 没有找到 x64 安装包`);
  const zip = assets.find((asset) => /-x64\.zip$/i.test(String(asset.name || ''))) || null;
  const sums =
    assets.find((asset) => /^SHA256SUMS\.txt$/i.test(String(asset.name || ''))) || null;
  return {
    tag,
    version: tag.replace(/^v/, ''),
    exe: { name: exe.name, url: exe.browser_download_url, size: Number(exe.size) || 0 },
    zip: zip ? { name: zip.name, url: zip.browser_download_url, size: Number(zip.size) || 0 } : null,
    sums: sums ? { name: sums.name, url: sums.browser_download_url, size: Number(sums.size) || 0 } : null,
  };
}

/** 解析 SHA256SUMS.txt（sha256sum 格式：<hash>  <file>）。 */
function parseSha256Sums(text) {
  const result = {};
  for (const line of String(text || '').split(/\r?\n/)) {
    const match = /^([0-9a-fA-F]{64})\s+\*?(.+?)\s*$/.exec(line);
    if (match) result[match[2]] = match[1].toLowerCase();
  }
  return result;
}

function expectedSha256(sumsText, fileName) {
  const sums = parseSha256Sums(sumsText);
  return sums[fileName] || '';
}

async function sha256File(filePath) {
  const hash = crypto.createHash('sha256');
  await new Promise((resolve, reject) => {
    const stream = fs.createReadStream(filePath);
    stream.on('data', (chunk) => hash.update(chunk));
    stream.on('end', resolve);
    stream.on('error', reject);
  });
  return hash.digest('hex');
}

/**
 * 检查最新版本。
 * @returns {Promise<{updateAvailable:boolean, currentVersion:string, version:string, release:object|null}>}
 */
async function checkForUpdate({ repo = DEFAULT_REPO, currentVersion }) {
  const json = await fetchJson(`${RELEASES_API}${repo}/releases/latest`);
  const release = parseLatestRelease(json);
  const updateAvailable = compareVersions(release.version, currentVersion) > 0;
  return { updateAvailable, currentVersion, version: release.version, release };
}

/**
 * 下载安装包到 dir，并用 SHA256SUMS.txt 校验。
 * @returns {Promise<{filePath:string, bytes:number, verified:boolean}>}
 */
async function downloadUpdate({ release, dir, onProgress = () => {} }) {
  if (!release || !release.exe) throw new Error('缺少可下载的安装包信息');
  fs.mkdirSync(dir, { recursive: true });
  const filePath = path.join(dir, release.exe.name);
  const tempPath = `${filePath}.part`;

  const res = await request(release.exe.url);
  const total = Number(res.headers['content-length']) || release.exe.size || 0;
  let received = 0;
  const out = fs.createWriteStream(tempPath);
  try {
    await new Promise((resolve, reject) => {
      res.on('data', (chunk) => {
        received += chunk.length;
        if (total > 0) onProgress(Math.min(1, received / total));
      });
      res.on('error', (error) => {
        out.destroy();
        reject(error);
      });
      out.on('error', (error) => {
        res.destroy();
        reject(error);
      });
      out.on('finish', resolve);
      res.pipe(out);
    });
  } catch (error) {
    fs.rmSync(tempPath, { force: true });
    throw error;
  }

  let verified = false;
  try {
    if (release.sums) {
      const sumsText = await fetchText(release.sums.url);
      const expected = expectedSha256(sumsText, release.exe.name);
      if (expected) {
        const actual = await sha256File(tempPath);
        if (actual !== expected) throw new Error('安装包 SHA256 校验失败，已删除下载文件');
        verified = true;
      }
    }
    fs.rmSync(filePath, { force: true });
    fs.renameSync(tempPath, filePath);
  } catch (error) {
    fs.rmSync(tempPath, { force: true });
    throw error;
  }
  onProgress(1);
  return { filePath, bytes: received, verified };
}

/** NSIS 安装参数：静默安装，装完后启动新版本。 */
function buildInstallerArgs() {
  return ['/S', '--force-run'];
}

module.exports = {
  DEFAULT_REPO,
  buildInstallerArgs,
  checkForUpdate,
  compareVersions,
  downloadUpdate,
  expectedSha256,
  parseLatestRelease,
  parseSha256Sums,
  parseVersion,
  sha256File,
};
