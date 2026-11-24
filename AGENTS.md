# AGENTS.md

本文件是 AI 编码代理在本仓库工作的入口说明。开始任何任务前，先读完本文件；涉及具体模块时，再按文末索引阅读对应文档。

## 0. 一句话目标

把 `genshin-wish-export` 与 `star-rail-warp-export` 合并成**一个安装包、一个入口**的桌面工具，同时让两个上游仓库的更新可以**低成本、可验证地同步进来**。

当前架构：`vendor/` 只读引入两个上游 + 托盘启动器 + 一次只运行一个分析工具。

## 1. 必读顺序

| 顺序 | 文档 | 什么时候读 |
| --- | --- | --- |
| 1 | 本文件 | 每次任务开始 |
| 2 | [docs/design.md](docs/design.md) | 理解整体设计、边界与里程碑 |
| 3 | [docs/architecture.md](docs/architecture.md) | 改主进程、IPC、数据模型、导出逻辑 |
| 4 | [docs/upstream-sync.md](docs/upstream-sync.md) | 动 `vendor/`、跑同步、处理冲突 |
| 5 | [docs/development.md](docs/development.md) | 搭环境、构建、调试、打包 |
| 6 | [docs/versioning.md](docs/versioning.md) | 版本号、发布、标签、回滚 |
| 7 | [docs/tasks.md](docs/tasks.md) | 领取任务、更新进度 |

## 2. 当前状态（2026-11-24）

已完成：

- 整体设计文档与协作文档。
- 统一仓库骨架：`apps/desktop`、`scripts/`、`tests/contracts/`、`.github/workflows/`。
- 统一启动器常驻托盘、分析工具子进程切换、按分析工具隔离的数据目录设计。
- 上游导入、补丁、同步、构建、契约测试脚本。
- 两个上游已导入 `vendor/`：原神 `c4675ab`、星铁 `8a0b664`。
- 旧的两个上游克隆已删除；`vendor/` 是唯一代码来源。
- vendor 补丁已应用（10 处），契约测试 9/9 通过。
- 两个上游构建依赖已安装，两个分析工具的 main 与 renderer 构建成功。
- 启动器与两个分析工具界面已在真实桌面验证通过（2026-11-24）：启动器里两个分析工具都可选择，分别可打开、导出正常，数据按分析工具隔离落在 AppData。
- 应用图标已覆盖 Windows 窗口、托盘、exe 与 NSIS 安装包。
- Windows exe 与 zip 由 GitHub Actions 构建产出（v0.2.0：exe 59.8 MB / 62,696,935 B，zip 80.5 MB / 84,448,614 B）；本地不保留 `release/` 产物。
- v0.1.0、v0.1.1、v0.2.0 已发布到 GitHub Releases：exe/zip/SHA256 均由 GitHub Actions 构建上传。

未完成（不要假装已存在）：

- 统一更新器未实现；当前通过补丁禁用上游自更新。
- 统一版旧安装目录的数据会在启动时自动迁移到 AppData；原版独立程序的数据可在启动器里手动导入（T3.2，只复制不覆盖，待真机点击验证）。
- 单窗口统一 UI 未实现，也不在当前范围。

进度以 [docs/tasks.md](docs/tasks.md) 为准。

## 3. 目录结构

```text
wish-export/
├─ AGENTS.md                     # 本文件
├─ package.json                  # 统一脚本与 Electron 运行时
├─ electron-builder.yml          # 打包配置
├─ apps/
│  └─ desktop/
│     ├─ src/main/bootstrap.js   # 统一入口：启动器 / 单个分析工具
│     └─ src/launcher/           # 启动器页面（原生 HTML/CSS/JS）
├─ scripts/
│  ├─ import-upstream.ps1        # 首次导入两个上游（git subtree）
│  ├─ sync-upstream.ps1          # 日常同步两个上游
│  ├─ apply-vendor-patches.js    # 5 类最小补丁，幂等
│  ├─ setup-vendor.js            # 安装两个上游的构建依赖
│  └─ build-games.js             # 分别构建并收集到 dist/electron/games
├─ tests/contracts/              # 上游契约测试（Node 内置 test runner）
├─ docs/                         # 设计、架构、开发、同步、任务文档
├─ vendor/                       # 导入后存在：两个上游的只读副本
├─ dist/electron/games/          # 构建产物：<game>/main、<game>/renderer
└─ release/                      # electron-builder 输出
```

## 4. 铁律

1. **`vendor/` 是只读上游代码。**
   只允许 `scripts/apply-vendor-patches.js` 产生的 5 类、每个上游各 5 处、带 `[wish-export patch]` 标记的改动。禁止格式化、重排、批量改名、升级依赖、删除注释。
2. **同一进程只加载一个分析工具的主进程模块。**
   两个上游都在 `getData.js` / `excel.js` / `UIGFJson.js` 里注册同名 `ipcMain.handle`。不要同时 `require` 两个分析工具，也不要试图在进程内切换分析工具。启动器一次只 spawn 一个分析工具子进程，分析工具退出后才能启动另一个。
3. **数据目录必须按分析工具隔离。**
   分析工具数据写入 `userData/<game>/`，不得写回 `userData/` 根目录。禁止把 `gacha-list-<uid>.json` 写到两个分析工具共享的位置。
4. **不改导出语义。**
   UIGF/SRGF 的字段名、时间格式、排序、`uigf_version` / `srgf_version` 都按上游实现。不要为了“统一”而重写序列化。
5. **不改技术栈与关键版本。**
   主进程 CommonJS，渲染器 Vue 3 + Vite 2，Electron 16，`asar: false`。升级 Electron、Vite、element-plus 必须单独立项。
6. **不手工修改 `vendor/`。**
   需要新补丁时，改 `scripts/apply-vendor-patches.js`，在文档里登记，再运行脚本。不要在编辑器里直接改完就算数。
7. **允许直接提交，禁止其他 git 操作。**
   改动完成后可以按第 12 条的提交粒度规则直接 `git commit`，无需询问。但不得执行 `git push`、`git pull`、`git fetch`、`git rebase`、`git merge`、`git reset`、`git tag`、`git subtree add/pull` 等其他 git 操作，除非用户明确要求。
8. **不做无关重构。**
   不引入 TypeScript、Pinia、新 UI 框架、新状态管理、新打包工具；不为了“代码好看”重写上游模块。
9. **不记录敏感信息。**
   `authkey`、`stoken`、cookie、用户 UID 不写入日志、不提交、不外传。调试输出必须脱敏。
10. **任务闭环。**
    改完代码要更新 [docs/tasks.md](docs/tasks.md) 的状态，并在汇报中写清：改了什么、怎么验证、还剩什么、有什么风险。
11. **版本与发布遵循 [docs/versioning.md](docs/versioning.md)。**
    AI 不得主动提升版本号、打标签或推送，除非任务明确标注为发布。
12. **一次提交只做一类变更。**
    不同 `type` 的改动必须拆成多个提交；禁止把功能、修复、文档、构建、CI 混在同一个 commit。同一类变更可以跨多个文件。
13. **打包只在 GitHub Actions 执行。**
    本地只做 `yarn build:games` 和 `yarn dev`；不在本地运行 electron-builder 作为发布流程。

## 5. 常用命令

| 命令 | 作用 | 备注 |
| --- | --- | --- |
| `yarn install` | 安装根依赖（Electron、electron-builder） | 首次执行 |
| `yarn import-upstream` | 用 `git subtree` 导入两个上游到 `vendor/` | 会创建 git 提交；只需一次 |
| `yarn patch-vendor` | 应用 5 类 vendor 补丁（每个上游 5 处） | 幂等；同步上游后也要跑 |
| `yarn setup` | 安装两个上游的构建依赖 | 跳过 Electron 二进制与 postinstall |
| `yarn test` | 运行契约测试 | 未导入 vendor 时自动跳过 |
| `yarn build:games` | 构建两个分析工具的 main + renderer | 输出到 `dist/electron/games/` |
| `yarn dev` | 打开统一启动器 | 需要先 `build:games` |
| `yarn start:genshin` | 直接启动原神模块 | 跳过启动器 |
| `yarn start:starrail` | 直接启动星铁模块 | 跳过启动器 |
| `yarn sync-upstream` | 同步两个上游 + 补丁 + 契约测试 | 会创建 git 提交 |

官方打包只在 GitHub Actions 执行：

- 推送到 `main` 且涉及代码、图标、构建或 `vendor/`：`build.yml` 自动构建 exe/zip 并上传 workflow artifact；
- 推送 `v*` 标签：`release.yml` 构建并创建 GitHub Release。

单个分析工具热更新开发不要走统一入口，直接在上游目录里跑：

```powershell
yarn --cwd vendor/genshin dev
yarn --cwd vendor/starrail dev
```

这需要对应目录执行过完整 `yarn install`（会下载该目录自己的 Electron）。

## 6. 一次任务的标准流程

1. 在 [docs/tasks.md](docs/tasks.md) 找到任务，确认状态与验收标准。
2. 用 `Grep` / `Read` 查清相关文件，不凭记忆改代码。
3. 只做当前任务需要的最小改动；一次只解决一个可验证的问题。
4. 运行最小验证：
   - 改脚本或契约测试：`yarn test`
   - 改启动器或 bootstrap：`yarn build:games` + `yarn dev` 手工点两个入口
   - 改 vendor 补丁：`yarn patch-vendor` + `yarn test`
5. 更新 `docs/tasks.md` 的状态与备注。
6. 按下面格式汇报。

```text
改动：
- 文件 A：做了什么
- 文件 B：做了什么

验证：
- 执行的命令与结果
- 手工验证的步骤与结果

未完成 / 风险：
- 仍需处理的事项
- 已知副作用
```

## 7. 修改 vendor 的唯一方式

1. 在 `scripts/apply-vendor-patches.js` 里新增一条 patch，包含：
   - `id`：唯一名称
   - `file`：相对 `vendor/<game>/` 的路径
   - `marker`：补丁完成后源码里必须存在的字符串
   - `target`：上游原始代码片段
   - `replacement`：替换后的代码，必须带 `// [wish-export patch]` 注释
2. 运行 `yarn patch-vendor`。
3. 运行 `yarn test`，确认补丁标记与 IPC 快照都通过。
4. 在 [docs/upstream-sync.md](docs/upstream-sync.md) 的补丁清单里登记。
5. 如果上游改写了 `target`，脚本会失败并指出文件。不要绕过，按冲突流程处理。

## 8. 验收标准

一个任务算完成，至少满足对应项：

- [ ] `yarn test` 全部通过（未导入 vendor 时允许跳过）。
- [ ] `yarn build:games` 两个分析工具都构建成功。
- [ ] `yarn dev` 能打开启动器，并正确显示两个分析工具的构建状态。
- [ ] 点击任一分析工具能打开对应界面；两个分析工具不会同时运行。
- [ ] 数据分别写入 `userData/genshin/`、`userData/starrail/`。
- [ ] 没有出现 “Attempted to register a second handler” 或 IPC 重复注册错误。
- [ ] 没有修改 `vendor/` 里补丁标记之外的内容。
- [ ] `docs/tasks.md` 已更新。

## 9. 已知坑

| 坑 | 现象 | 处理 |
| --- | --- | --- |
| IPC 通道重名 | 同时加载两个分析工具时直接抛错 | 启动器一次只 spawn 一个分析工具子进程 |
| 数据文件重名 | 两个分析工具都写 `userData/gacha-list-<uid>.json`，互相覆盖 | 已通过补丁改为 `userData/<game>/` |
| 上游路径假设 | 上游认为 `main.js` 在 `src/main/`、renderer 在 `dist/electron/renderer/` | 统一入口注入 `WISH_APP_ROOT` / `WISH_RENDERER` |
| 上游自更新 | 会用原版 app.zip 覆盖整个统一安装目录 | 已通过 `WISH_UPDATE_DISABLED` 禁用；统一更新器另行实现 |
| element-plus 版本不同 | 原神 1.3.0-beta.7，星铁 2.3.7 | 每个分析工具使用自己的 `node_modules` 构建，不合并依赖 |
| UIGF / SRGF 差异 | 原神 UIGF 3.0/4.1，星铁 SRGF/UIGF 4.x | 导出逻辑留在各自 vendor，不抽公共序列化器 |
| 星铁数据频繁更新 | `idJson.json` 随游戏版本更新 | 依赖 `yarn sync-upstream` + 契约测试 |
| 原神上游长期低活跃 | 最后提交 2026-03-17 | 原神改动以修复为主，不要等待上游新功能 |
| 旧版数据目录 | 旧程序各自在安装目录下写 `userData/` | 统一版旧安装目录会自动迁移到 AppData；原版独立程序的数据用启动器“导入原版数据”手动导入 |
| 上游 `RELAUNCH` | 上游重启不带 `--wish-game`，会回到启动器 | 当前更新已禁用，不会触发；统一更新器上线前处理 |
| NSIS 安装目录 | 程序安装到只读目录会失败；数据现在在 AppData，不受安装目录影响 | 默认安装到当前用户目录；数据目录定期备份 |
| 分析工具子进程单实例锁 | 启动器已持有单实例锁，分析工具子进程会被判定为第二实例 | 子进程带 `WISH_LAUNCHER_CHILD=1`，由 vendor 补丁跳过单实例锁 |

## 10. 文档地图

- [docs/design.md](docs/design.md)：整体设计与决策记录。
- [docs/architecture.md](docs/architecture.md)：模块职责、IPC 通道、数据模型、导出流程。
- [docs/upstream-sync.md](docs/upstream-sync.md)：subtree 同步、补丁清单、冲突处理、CI。
- [docs/development.md](docs/development.md)：环境搭建、开发、构建、调试、打包、发布。
- [docs/versioning.md](docs/versioning.md)：版本号规则、提交规范、发布流程、热修复与回滚。
- [docs/tasks.md](docs/tasks.md)：里程碑、任务清单、验收标准、当前进度。
