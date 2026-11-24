# 开发指南

本文说明如何搭环境、开发、构建、调试和打包。首次接手请先读完 [AGENTS.md](../AGENTS.md) 与 [设计文档](design.md)。

## 1. 环境要求

| 工具 | 版本 | 说明 |
| --- | --- | --- |
| Windows | 10/11 | 当前主要验证平台 |
| Node.js | 18 LTS 或 20 LTS | 本机验证版本为 20.20.2；上游构建链较旧，若遇构建异常优先尝试 Node 18 |
| Yarn | 1.22.x | 两个上游都使用 Yarn 1 与 `yarn.lock` |
| Git | 2.4+ | 需要 `git subtree` |
| PowerShell | 5.1+ | 导入/同步脚本使用 |

不需要全局安装 Electron 或 electron-builder。

## 2. 首次搭建

在仓库根目录依次执行：

```powershell
# 1. 安装根依赖：Electron、electron-builder、cross-env
yarn install

# 2. 导入两个上游到 vendor/（会创建 git 提交）
yarn import-upstream

# 3. 应用 vendor 补丁（5 类，每个上游 5 处）
yarn patch-vendor

# 4. 安装两个上游的构建依赖（跳过 Electron 二进制）
yarn setup

# 5. 运行契约测试
yarn test

# 6. 构建两个游戏
yarn build:games

# 7. 打开统一启动器
yarn dev
```

每一步的作用：

| 步骤 | 产物 | 失败时 |
| --- | --- | --- |
| `yarn install` | 根 `node_modules` | 检查网络与 npm registry |
| `import-upstream` | `vendor/genshin`、`vendor/starrail` | 检查工作区是否干净、GitHub 是否可访问 |
| `patch-vendor` | 5 类带标记的补丁（每个上游 5 处） | 按 [upstream-sync.md](upstream-sync.md) 5.3 处理 |
| `setup` | 两个 vendor 的 `node_modules` | 检查 Yarn 与网络；可单独在 vendor 目录执行 |
| `test` | 契约测试结果 | 见 [upstream-sync.md](upstream-sync.md) 5.4 |
| `build:games` | `dist/electron/games/` | 查看具体游戏的构建日志 |
| `dev` | 启动器窗口 | 确认两个游戏显示“已就绪” |

### 2.1 导入脚本做了什么

`yarn import-upstream` 等价于：

```powershell
git remote add upstream-genshin  https://github.com/biuuu/genshin-wish-export.git
git remote add upstream-starrail https://github.com/biuuu/star-rail-warp-export.git

git subtree add --prefix=vendor/genshin  upstream-genshin  main --squash
git subtree add --prefix=vendor/starrail upstream-starrail main --squash
```

`--squash` 会把上游历史压成一个提交。后续 `git subtree pull` 仍然能正确做三方合并。

### 2.2 关于 `yarn setup`

`scripts/setup-vendor.js` 在两个 vendor 目录执行：

```text
yarn install --ignore-scripts --frozen-lockfile
```

并设置 `ELECTRON_SKIP_BINARY_DOWNLOAD=1`，原因：

- 构建 main/renderer 只需要 vite、rollup、esbuild；
- Electron 由根目录统一提供，避免重复下载两份约 100MB 的运行时；
- `--ignore-scripts` 跳过 `electron-builder install-app-deps`，统一版不用它。

如果需要在 vendor 目录里跑上游自带的热更新（`yarn --cwd vendor/genshin dev`），需要在对应目录执行一次完整安装：

```powershell
yarn --cwd vendor/genshin install
```

这会下载 vendor 自己的 Electron。

## 3. 开发模式

### 3.1 统一入口开发

```powershell
yarn build:games
yarn dev
```

流程：

1. `bootstrap.js` 打开启动器；
2. 点击游戏后进程重启，加载 `dist/electron/games/<game>/main/main.js`；
3. 渲染器加载 `dist/electron/games/<game>/renderer/index.html`。

这是**构建产物模式**，不提供渲染器热更新。每次改 vendor 代码后需要重新 `yarn build:games`。

适合：

- 验证启动器、进程切换、数据目录隔离、打包路径；
- 验证两个游戏能否正常加载。

### 3.2 单游戏热更新

```powershell
yarn --cwd vendor/genshin dev
yarn --cwd vendor/starrail dev
```

上游自带的 `.electron-vite/dev-runner.js` 会：

- 启动 Vite dev server；
- 编译主进程；
- 启动 Electron 并加载 `http://localhost:<port>`。

注意：

- 需要该目录执行过完整 `yarn install`；
- 数据目录为 `vendor/<game>/userData/default/`（因为 `WISH_GAME` 未设置）；
- 这个模式不经过统一启动器，只用于单游戏 UI/逻辑开发。

### 3.3 直接启动某个游戏

```powershell
yarn start:genshin
yarn start:starrail
```

跳过启动器，直接以对应 `WISH_GAME` 启动。适合调试游戏模块本身。

### 3.4 可选：让统一入口加载 Vite dev server

补丁后的 `main.js` 支持 `WISH_DEV_SERVER_URL`。如果你手动启动了 Vite dev server，可以：

```powershell
$env:WISH_GAME='genshin'
$env:WISH_DEV_SERVER_URL='http://localhost:3000'
yarn dev
```

注意：上游 dev-runner 同时启动 Vite 与 Electron，不能直接复用它来只启动 Vite。这个方式需要自己启动 Vite，当前不作为标准流程。

## 4. 构建

```powershell
yarn build:games
```

实际执行：

1. 删除 `dist/electron/games/`；
2. 对每个游戏：
   - 删除 `vendor/<game>/dist/electron`；
   - 在该目录执行 `node .electron-vite/build.js`；
   - 校验 `dist/electron/main/main.js` 与 `dist/electron/renderer/index.html`；
   - 复制到 `dist/electron/games/<game>/{main,renderer}`。

产物：

```text
dist/electron/games/genshin/main/main.js
dist/electron/games/genshin/renderer/index.html
dist/electron/games/starrail/main/main.js
dist/electron/games/starrail/renderer/index.html
```

排查构建失败：

1. 先单独进入 vendor 目录执行 `node .electron-vite/build.js`，看完整日志；
2. 确认 `node_modules` 存在；
3. 确认 Node 版本（必要时切到 18）；
4. 确认上游没有新增需要系统工具的原生依赖。

## 5. 调试

### 5.1 开发者工具

- 开发态：上游 `main.js` 在 `!app.isPackaged` 时会自动打开 DevTools。
- 打包后：默认不打开。需要时可在 `bootstrap.js` 或上游 `main.js` 临时加 `openDevTools`，验证完删除。

### 5.2 日志

- 主进程 `console.log` 输出到终端。
- 上游会把日志写入 `app.getPath('userData')/userData/<game>/log.txt`（由 `utils.js` 的 `log` 逻辑决定）。
- 渲染器错误通过 `ERROR` 事件显示在界面上，同时打印到 DevTools。

### 5.3 数据目录

| 场景 | 数据目录 |
| --- | --- |
| 统一入口开发 | `<仓库根>/userData/genshin/`、`<仓库根>/userData/starrail/` |
| 统一入口打包后 | `app.getPath('userData')/userData/genshin/`、`.../starrail/`；Windows 通常为 `%APPDATA%\hoyo-gacha-export\userData\...` |
| vendor 单游戏热更新 | `vendor/<game>/userData/default/` |
| 旧版统一工具 | `<旧安装目录>/userData/`，首次启动自动复制到 AppData |
| 原版独立程序 | `<旧安装目录>/userData/`，需要手动导入 |

查看当前数据：

```powershell
Get-ChildItem .\userData -Recurse
```

### 5.4 代理模式

两个上游都使用系统代理 + mitmproxy，端口固定 `8325`。

常见问题：

- 程序异常退出后代理没关闭：重新打开工具，进入设置关闭代理，或在 Windows 设置里手动关闭系统代理。
- 端口被占用：确认没有另一个游戏/旧版程序在运行。
- 抓不到 URL：确认游戏已打开抽卡记录页面，且代理模式开启。

### 5.5 常见错误

| 错误 | 原因 | 处理 |
| --- | --- | --- |
| `缺少游戏构建` | `dist/electron/games/<game>/` 不存在 | `yarn build:games` |
| `Attempted to register a second handler` | 同时加载了两个游戏 | 检查是否直接 require 了两个 vendor main |
| `vendor/genshin 未导入` | 没执行导入 | `yarn import-upstream` |
| `vendor/genshin 依赖未安装` | 没执行 setup | `yarn setup` |
| Electron 下载失败 | 网络问题 | 设置 `ELECTRON_MIRROR` 后重试 `yarn install` |
| vendor 热更新启动失败 | `--ignore-scripts` 安装，没有 Electron 二进制 | 在 vendor 目录执行完整 `yarn install` |
| 构建时 esbuild 报错 | Node 版本或平台二进制问题 | 切换 Node 18，删除 `node_modules` 重装 |

## 6. 打包

```powershell
yarn package
```

等价于：

```powershell
yarn build:games
electron-builder
```

输出：`release/`。

产物示例：

```text
release/
├─ Wish-Export-0.1.0-x64.exe   # NSIS 安装包
└─ Wish-Export-0.1.0-x64.zip   # 便携包
```

当前配置：

- `appId`：`org.wish-export.unified`
- `productName`：`Wish Export`
- `asar: false`
- Windows：NSIS 安装包（exe）+ zip 便携包
- macOS：dmg
- Linux：deb

打包检查：

- `release/Wish-Export-<version>-x64.exe` 存在；
- `release/Wish-Export-<version>-x64.zip` 存在；
- `release/win-unpacked/resources/app/apps/desktop/src/main/bootstrap.js` 存在；
- `resources/app/dist/electron/games/genshin/main/main.js` 存在；
- `resources/app/dist/electron/games/starrail/main/main.js` 存在；
- 安装 exe 或解压 zip 后，双击程序能打开启动器；
- 进入游戏后数据写入 `app.getPath('userData')/userData/<game>/`，不是安装目录；
- 不要把程序安装到只读目录，安装/卸载前备份 `userData`。

当前只在 Windows 上验证。macOS/Linux 配置保留但未验证，不要声称已支持。

## 7. 发布

完整规则见 [versioning.md](versioning.md)。这里只列执行顺序：

1. 确认工作区干净，上游已同步到预期快照；
2. `yarn patch-vendor`、`yarn test`、`yarn build:games` 全部通过；
3. 按版本规则修改根 `package.json` 的 `version`；
4. `yarn package`，安装 exe 或解压 zip 后手工验证两个游戏；
5. 提交 `chore(release): vX.Y.Z`，打附注标签 `vX.Y.Z`；
6. 推送标签，由 `.github/workflows/release.yml` 自动上传 exe/zip/SHA256 并创建 GitHub Release。

注意：

- GitHub Release 只在推送 `v*` 标签时触发，且 `package.json` 版本必须与标签一致；
- 发布说明必须记录两个上游的 `git-subtree-split` 与星铁 `idJson` 版本；
- 旧版不会自动升级到统一版，发布说明要写清迁移方式；
- 安装包未签名，Windows SmartScreen 可能提示未知发布者；
- 不要恢复上游自更新：`WISH_UPDATE_DISABLED` 必须保持为 `1`，直到统一更新器上线；
- 不要自行打标签或推送，除非任务明确要求发布。

## 8. 代码风格

- 主进程：CommonJS，2 空格缩进，单引号，不写分号（与上游一致）。
- 渲染器：沿用上游 Vue 3 写法；新代码不引入新框架。
- 注释：统一入口、脚本、测试使用中文注释；vendor 代码保持原样。
- 命名：
  - 环境变量统一 `WISH_` 前缀；
  - 脚本使用 kebab-case 文件名；
  - 测试文件 `*.test.js`。
- 依赖：新增根依赖前先确认不能用 Node 内置能力或已有依赖实现。

## 9. 常见开发任务

### 9.1 修改启动器

文件：

- `apps/desktop/src/launcher/index.html`
- `apps/desktop/src/launcher/launcher.css`
- `apps/desktop/src/launcher/launcher.js`
- `apps/desktop/src/launcher/preload.js`

约束：

- 不引入前端框架；
- 保持 CSP；
- 只通过 `window.launcher` 暴露的 4 个方法通信；
- 新增 IPC 时同步更新 `bootstrap.js` 与 preload。

验证：

```powershell
yarn build:games
yarn dev
```

### 9.2 修改数据目录

如果必须改数据目录结构：

1. 修改 `scripts/apply-vendor-patches.js`；
2. 修改 `bootstrap.js` 注入的环境变量；
3. 更新 `tests/contracts` 的补丁标记断言；
4. 更新 [architecture.md](architecture.md) 与 [design.md](design.md)；
5. 考虑旧数据迁移。

### 9.3 新增一个游戏（未来）

1. 用 subtree 导入到 `vendor/<game>`；
2. 在 `bootstrap.js` 的 `GAMES` 增加配置；
3. 在 `scripts/build-games.js` 的 `GAMES` 增加 id；
4. 在 `tests/contracts/expected-channels.json` 增加通道快照；
5. 在 `tests/contracts/vendor-shape.test.js` 增加数据断言；
6. 视情况增加 vendor 补丁；
7. 更新所有文档。

不要改动已有游戏的行为。

## 10. 文档维护

改代码时同步更新：

| 改动 | 需要更新的文档 |
| --- | --- |
| 启动流程、环境变量 | `design.md`、`architecture.md` |
| IPC、数据模型、导出 | `architecture.md` |
| 补丁、同步流程 | `upstream-sync.md` |
| 命令、构建、打包 | `development.md`、`AGENTS.md` |
| 任务进度 | `tasks.md` |
