# 统一抽卡记录导出工具设计

- 状态：已实施，持续迭代
- 日期：2026-11-24
- 适用范围：`genshin-wish-export` 与 `star-rail-warp-export` 的合并
- 相关文档：[架构](architecture.md)、[上游同步](upstream-sync.md)、[开发](development.md)、[版本规则](versioning.md)、[任务](tasks.md)

## 1. 背景

现有两个独立项目：

- `genshin-wish-export`：原神祈愿记录导出，Electron 16 + Vue 3 + Vite 2，版本 0.12.1，上游最后提交 2026-03-17。
- `star-rail-warp-export`：崩坏：星穹铁道跃迁记录导出，技术栈相同，版本 0.3.2，上游最后提交 2026-11-11（`idJson` 已更新到 4.7）。

两者同源、结构高度相似：

- 7 个文件完全一致（zip、exceljs、mitmproxy、系统代理、renderer 入口、图表组件）。
- 5 个文件只差 3–16 行（`main.js`、`update/index.js`、`config.js`、`i18n.js`、`renderer/utils.js`）。
- 真正与游戏相关的是数据获取、卡池类型、导出格式、Excel 列、UI 文案和少量专属模块。

因此“合并”有两条完全不同的路线：

1. 把两份代码重构成一份共享 core。
2. 保留两个上游代码，只合并产品和入口。

当前实现选择第 2 条。原因是上游没有共享 core，任何重构成 core 的做法都会让仓库变成永久分叉，后续无法自动同步。

## 2. 目标与非目标

### 2.1 目标

1. 用户只安装一个程序，只从一个入口启动。
2. 两个游戏的数据、配置、缓存互不覆盖。
3. 上游更新后，可以用一条命令或一个自动 PR 完成同步。
4. 同步后能自动发现“上游接口变了，但统一入口没跟上”的问题。
5. 两个游戏的原有界面与导出能力保持不变，降低回归风险。

### 2.2 非目标（当前阶段明确不做）

1. 不做单窗口、同一套 UI 的双游戏切换。
2. 不抽取共享 core，不重写数据获取、合并、导出逻辑。
3. 不统一 element-plus 版本，不迁移 Vue 版本。
4. 不实现统一更新器（先禁用上游自更新）。
5. 不实现原版独立程序的数据导入 UI（统一版旧安装目录已自动迁移）。
6. 不合并原神的 web 构建（`build:web`）与 Gist 功能。
7. 不把两个游戏做成两个安装包。

## 3. 约束与事实

| 约束 | 影响 |
| --- | --- |
| 两个上游没有共享 core | 不能通过 merge 两个仓库得到一份干净代码 |
| 两边 IPC 通道大量重名 | 同一主进程不能同时加载两个游戏 |
| 两边数据文件名相同 | 不隔离目录会互相覆盖 |
| element-plus 版本不同 | 不能简单合并成一份依赖 |
| 原神 UIGF 3.0/4.1，星铁 SRGF/UIGF 4.x | 导出序列化不能共用 |
| 上游更新频率不同 | 星铁以数据文件更新为主，原神以稳定为主 |
| 两边均为 MIT | 保留 LICENSE 与来源说明即可 |
| Electron 16 已停止维护 | 当前不升级，避免放大回归面 |

## 4. 架构选择

| 做法 | 改动量 | 上游同步 | 体验 | 长期维护 | 结论 |
| --- | --- | --- | --- | --- | --- |
| **单仓库 + 双上游 + 统一启动器** | 小 | `git subtree pull`，冲突极少 | 一个安装包、一个入口，界面保持原版 | 低 | **采用** |
| 抽共享 core + 单窗口统一 UI | 大 | 只能人工移植 | 完全统一 | 高 | 后续可选 |
| 单仓库 + 两个独立安装包 | 中 | 最低 | 仍是两个应用 | 低 | 不采用 |
| submodule + patch 队列 | 小 | 每次升级要重新打补丁 | 与当前做法相同 | 最高 | 不采用 |

选择当前做法的关键理由：

- 上游代码保持原样，同步是三方合并，本地 5 类补丁（每个上游各 5 处）能自动保留。
- 产品层只有一个入口，满足“一个工具”的核心诉求。
- 不需要先重构，能最快进入可用状态。
- 后续如果要统一 UI，可以在当前做法的基础上替换启动器与设置页，不影响同步机制。

## 5. 总体架构

```text
┌────────────────────────────────────────────────────────────┐
│ 启动器进程（常驻托盘）                                      │
│ apps/desktop/src/main/bootstrap.js                          │
│                                                            │
│  ├─ 启动器窗口 + Tray                                       │
│  └─ spawn 游戏子进程（--wish-game=<id>）                    │
└───────────────────────────┬────────────────────────────────┘
                            │ 同一时间只启动一个
              ┌─────────────┴─────────────┐
              ▼                           ▼
   dist/electron/games/genshin   dist/electron/games/starrail
   ├─ main/main.js               ├─ main/main.js
   └─ renderer/index.html        └─ renderer/index.html
              │                           │
              ▼                           ▼
   userData/genshin/             userData/starrail/
   gacha-list-<uid>.json         gacha-list-<uid>.json
   config.json                   config.json
```

### 5.1 目录职责

| 目录 | 职责 | 是否手改 |
| --- | --- | --- |
| `apps/desktop/src/main/bootstrap.js` | 统一入口：启动器、游戏启动、环境变量注入 | 是 |
| `apps/desktop/src/launcher/` | 启动器页面与 preload | 是 |
| `scripts/` | 导入、同步、补丁、依赖安装、构建 | 是 |
| `tests/contracts/` | 上游接口与数据契约测试 | 是 |
| `vendor/genshin/` | 原神上游只读副本 | 仅补丁脚本 |
| `vendor/starrail/` | 星铁上游只读副本 | 仅补丁脚本 |
| `dist/electron/games/` | 构建产物，运行时加载 | 否，构建生成 |
| `userData/` | 开发态运行数据；打包后改用 `app.getPath('userData')` | 否，运行时生成 |

## 6. 运行时设计

### 6.1 启动流程

1. 用户启动程序，Electron 加载 `package.json` 的 `main`：`apps/desktop/src/main/bootstrap.js`。
2. `bootstrap.js` 读取 `process.env.WISH_GAME` 与 `--wish-game` 参数。
3. 未设置或值非法：进入启动器进程，创建启动器窗口与托盘。
4. 启动器读取 `LAUNCHER_STATUS`，显示两个游戏是否已构建、是否有游戏正在运行。
5. 用户点击某个游戏：
   - 校验构建产物存在，且当前没有游戏在运行；
   - `spawn(process.execPath, ['--wish-game=<id>'], { env: { WISH_LAUNCHER_CHILD: '1' } })`；
   - 启动器窗口隐藏到托盘，两个入口变灰不可点击。
6. 游戏子进程启动，`bootstrap.js` 注入：
   - `WISH_APP_ROOT`：数据根目录（打包后是 `app.getPath('userData')`）；
   - `WISH_RENDERER`：当前游戏的 `renderer/index.html` 绝对路径；
   - `WISH_UPDATE_DISABLED=1`：禁用上游自更新；
   - 然后 `require` 对应游戏的 `main/main.js`。
7. 游戏的 `main.js` 创建自己的窗口、注册自己的 IPC、加载自己的渲染器。
8. 关闭游戏窗口时，游戏子进程退出；启动器收到 `exit` 事件后重新显示窗口，入口恢复可点击。
9. 关闭启动器窗口时收起到托盘；托盘菜单“退出”会结束游戏子进程并退出整个程序。

### 6.2 为什么用独立子进程，而不是同进程加载两个游戏

两个上游都在模块加载阶段注册 IPC：

| 游戏 | 注册位置 | 典型通道 |
| --- | --- | --- |
| 原神 | `getData.js`、`excel.js`、`UIGFJson.js`、`gists.js` | `FETCH_DATA`、`SAVE_EXCEL`、`EXPORT_UIGF_JSON` |
| 星铁 | `getData.js`、`excel.js`、`UIGFJson.js`、`bridge.js` | `FETCH_DATA`、`SAVE_EXCEL`、`EXPORT_UIGF_JSON` |

`ipcMain.handle` 对同一通道只能注册一次，第二次注册会抛错。即使手动 `removeHandler`，两个游戏的模块状态、定时器、代理状态也很难彻底清理。

因此采用：**启动器进程常驻托盘，游戏作为独立子进程运行**。这样既避免 IPC 冲突，又不需要关闭启动器，还能在游戏退出后自动恢复入口。

### 6.3 单实例

- 启动器进程获取单实例锁；已有实例时聚焦启动器。
- 游戏子进程带 `WISH_LAUNCHER_CHILD=1`，通过 vendor 补丁跳过单实例锁，避免被启动器持有的锁判定为第二实例。
- 启动器只记录一个 `gameProcess`，游戏运行期间入口不可点击，保证同一时间只运行一个游戏。
- 游戏运行期间再次双击程序，会聚焦启动器窗口。

## 7. 数据目录设计

### 7.1 目标结构

```text
%APPDATA%\<应用名>\userData\
├─ genshin/
│  ├─ gacha-list-<uid>.json
│  └─ config.json
└─ starrail/
   ├─ gacha-list-<uid>.json
   └─ config.json

<安装目录>/
└─ Wish Export.exe
```

打包后数据根目录是 `app.getPath('userData')`；Windows 上通常是
`%APPDATA%\hoyo-gacha-export\userData\<game>`。更新、重装、换安装目录都不会覆盖该目录。

### 7.2 上游原始行为

两个上游的 `utils.js` 都使用：

```js
const appRoot = isDev ? ... : path.resolve(app.getAppPath(), '..', '..')
const userDataPath = path.resolve(appRoot, 'userData')
```

并且都写同名文件：

- `gacha-list-<uid>.json`
- `config.json`

直接合并会互相覆盖，因此必须补丁化。

### 7.3 补丁方式

`scripts/apply-vendor-patches.js` 将两处改为：

```js
// [wish-export patch] 统一入口注入数据根目录
const appRoot = process.env.WISH_APP_ROOT || (isDev ? path.resolve(__dirname, '..', '..') : path.resolve(app.getAppPath(), '..', '..'))

// [wish-export patch] 每个游戏使用独立数据目录
const userDataPath = path.resolve(appRoot, 'userData', process.env.WISH_GAME || 'default')
```

`bootstrap.js` 在 require 游戏主进程之前设置 `WISH_APP_ROOT` 与 `WISH_GAME`。
打包后 `WISH_APP_ROOT` 为 `app.getPath('userData')`。

### 7.4 旧数据迁移

旧版统一工具的测试数据位于安装目录的 `userData/<game>/`。

迁移策略（已实现）：

1. 新程序启动时检查 `<安装目录>/userData/<game>/`。
2. 把文件递归复制到 `app.getPath('userData')/userData/<game>/`。
3. 只复制目标中不存在的文件，不覆盖新版本已经写入的数据。
4. 保留旧文件，不删除。
5. 迁移失败只记录日志，不阻塞程序启动。

原版独立程序的 `userData/` 没有游戏子目录，无法可靠判断归属，仍需要用户手动导入；
这部分导入 UI 属于后续任务。

### 7.5 其他共享状态

- `electron-window-state` 使用 `app.getPath('userData')`（系统 AppData）保存窗口状态，两个游戏会共享。影响很小，暂不处理。
- 代理端口固定 `8325`，因为同一时间只运行一个游戏，不会冲突。

## 8. vendor 补丁边界

补丁只允许 5 类，每个上游各 5 处，全部由脚本生成并带标记：

| 文件 | 标记 | 目的 |
| --- | --- | --- |
| `src/main/utils.js` | `WISH_APP_ROOT` | 让统一入口注入数据根目录 |
| `src/main/utils.js` | `process.env.WISH_GAME` | 每个游戏独立数据目录 |
| `src/main/main.js` | `WISH_RENDERER` | 加载统一入口指定的渲染器入口 |
| `src/main/main.js` | `WISH_LAUNCHER_CHILD` | 游戏子进程跳过单实例锁 |
| `src/main/update/index.js` | `WISH_UPDATE_DISABLED` | 禁用上游自更新 |

补丁后的 `main.js` 渲染器加载逻辑：

```js
// [wish-export patch] 渲染进程入口由统一入口注入
const rendererUrl = process.env.WISH_DEV_SERVER_URL
const rendererFile = process.env.WISH_RENDERER || 'dist/electron/renderer/index.html'
if (rendererUrl) win.loadURL(rendererUrl)
else win.loadFile(rendererFile)
```

补丁后的单实例逻辑：

```js
// [wish-export patch] 托盘启动器拉起的游戏子进程跳过单实例锁
const isFirstInstance = process.env.WISH_LAUNCHER_CHILD === '1' || app.requestSingleInstanceLock()
```

补丁后的更新逻辑：

```js
const update = async () => {
  // [wish-export patch] 统一入口禁用上游自更新，避免覆盖统一安装目录
  if (isDev || process.env.WISH_UPDATE_DISABLED === '1') return
  // ...
}
```

为什么必须禁用上游更新：上游更新器会下载原版 `app.zip`，清空并覆盖整个应用目录。统一版如果继续运行它，会把启动器和另一个游戏一起删掉。

## 9. 构建与打包

### 9.1 构建流程

```text
yarn build:games
  ├─ vendor/genshin: node .electron-vite/build.js
  │    ├─ vendor/genshin/dist/electron/main/main.js
  │    └─ vendor/genshin/dist/electron/renderer/index.html
  ├─ copy → dist/electron/games/genshin/{main,renderer}
  ├─ vendor/starrail: node .electron-vite/build.js
  │    ├─ vendor/starrail/dist/electron/main/main.js
  │    └─ vendor/starrail/dist/electron/renderer/index.html
  └─ copy → dist/electron/games/starrail/{main,renderer}
```

每个游戏使用自己的 `node_modules` 构建：

- 原神使用 `element-plus@1.3.0-beta.7`；
- 星铁使用 `element-plus@2.3.7`；
- 两套依赖不会互相污染，渲染器产物各带各的依赖。

根目录只保留 Electron、electron-builder、cross-env，避免重复下载两份 Electron 运行时。

### 9.2 打包产物

```text
release/
├─ Wish-Export-0.1.0-x64.exe      # NSIS 安装包
└─ Wish-Export-0.1.0-x64.zip      # 便携包
   └─ Wish Export/
      ├─ Wish Export.exe
      ├─ resources/app/
      │  ├─ package.json
      │  ├─ apps/desktop/src/main/bootstrap.js
      │  ├─ apps/desktop/src/launcher/
      │  └─ dist/electron/games/
      │     ├─ genshin/{main,renderer}
      │     └─ starrail/{main,renderer}
```

数据不放在安装目录，而是放在 `app.getPath('userData')/userData/<game>/`；
更新、重装、换安装目录不会覆盖。

关键配置：

- `asar: false`：上游更新器与文件替换逻辑依赖真实文件路径，保持不打包成 asar。
- `main`：`apps/desktop/src/main/bootstrap.js`。
- 打包只包含统一入口、启动器、两个游戏产物，不包含 `vendor/` 源码与 `node_modules`。
- `electron-builder.yml` 中 `productName`、`appId` 使用新值，旧版不会自动升级到统一版。
- Windows 产物为 NSIS exe 安装包与 zip 便携包；安装包默认安装到当前用户目录。
- 安装包未签名，Windows SmartScreen 可能提示未知发布者；数据目录建议定期备份。

### 9.3 体积

- Electron 运行时只打包一份。
- 两个渲染器各自带 Vue、element-plus、echarts，体积增加主要来自重复的 UI 依赖。
- 本地实测：exe 59.5 MB，zip 80.5 MB；构建 248.5s，打包 33.2s（Windows x64，Node 20）。
- 如果后续体积不可接受，再考虑将共享依赖外置（当前不做）。

## 10. 上游同步

详细流程见 [upstream-sync.md](upstream-sync.md)，这里只列设计要点。

### 10.1 用 subtree 而不是 submodule

- subtree：上游代码进入本仓库，可打补丁；`git subtree pull` 三方合并能保留本地补丁。
- submodule：只能锁 commit，任何修改都要另建 fork 或 patch 队列，升级成本高。

### 10.2 同步策略

```text
yarn sync-upstream
  ├─ git subtree pull vendor/genshin  ← biuuu/genshin-wish-export main
  ├─ git subtree pull vendor/starrail ← biuuu/star-rail-warp-export main
  ├─ yarn patch-vendor                # 幂等校验 5 类补丁
  └─ yarn test                        # 契约测试
```

自动同步：

- GitHub Actions 每天检查一次；
- 有更新时自动创建 `bot/sync-upstream` PR；
- PR 内容包含上游提交、补丁校验结果、契约测试结果。

### 10.3 同步质量控制

契约测试覆盖：

1. 两个游戏的 IPC 通道快照（16 / 15 个）。
2. `gachaType.json` 的卡池类型键集合。
3. 星铁 `idJson.json` 的语言数量、条目数量、字段结构。
4. 5 类 vendor 补丁标记是否仍然存在。
5. 两个游戏是否能完成构建（M2 加入 CI）。

## 11. 更新策略

当前阶段：

- 禁用两个上游的自更新。
- 统一版本通过自己的发布渠道分发。
- 发布前人工执行验证，发布打包由 GitHub Actions 执行。

后续（M4）：

- 实现统一更新器，替换两个 `update/index.js` 的生效路径。
- 更新包结构为整个统一应用目录，而不是单个游戏的 `app.zip`。
- 版本号统一使用根 `package.json` 的 `version`。
- 保留 `autoUpdate` 配置项语义，但由统一更新器读取。

## 12. 风险与应对

| 风险 | 概率 | 影响 | 应对 |
| --- | --- | --- | --- |
| 上游改写了补丁所在行 | 中 | 补丁脚本失败 | 脚本直接报错并指出文件；按冲突流程人工修复后更新脚本 |
| 上游新增 IPC 通道 | 中 | 渲染器可能缺功能 | 契约测试失败；检查上游 renderer 是否同步新增调用 |
| 上游新增卡池类型 | 中 | 导出缺类型 | `gachaType` 测试失败；更新映射与文案 |
| 星铁 idJson 结构变化 | 低 | 名称映射失效 | `idJson` 测试失败 |
| 原神老依赖在 Node 20 下构建失败 | 中 | 无法构建 | 固定 Node 18 或单独升级构建链；先记录实际错误再处理 |
| 上游自更新覆盖统一目录 | 低（已禁用） | 安装损坏 | 保留 `WISH_UPDATE_DISABLED` 补丁；统一更新器上线前不放开 |
| 旧用户数据丢失 | 中 | 用户投诉 | 已改为 AppData 并在启动时从旧安装目录复制；原版独立程序仍需手动导入 |
| 更新覆盖数据 | 低（已解决） | 历史记录丢失 | 数据移出安装目录；更新/重装不影响 AppData |
| 安装包体积增加 | 低 | 下载变慢 | M2 记录实际体积；必要时做依赖外置 |
| 两个游戏同时运行导致代理端口冲突 | 低 | 代理失败 | 单实例锁 + 启动器只允许一个游戏运行 |
| 许可证/署名缺失 | 低 | 合规问题 | 保留两个上游 LICENSE，README 注明来源 |

## 13. 里程碑

### M0 文档与骨架（已完成）

- [x] 整体设计文档。
- [x] `AGENTS.md` 与协作规则。
- [x] 统一启动器与 bootstrap。
- [x] 导入、补丁、依赖、构建、同步脚本。
- [x] 契约测试骨架与 CI 配置。

验收：`yarn test` 在未导入 vendor 时全部跳过且退出码为 0。

### M1 上游导入与补丁（已完成）

- [x] `yarn import-upstream` 导入两个上游（原神 `c4675ab`、星铁 `8a0b664`）。
- [x] `yarn patch-vendor` 应用 5 类补丁（每个上游 5 处）。
- [x] `yarn setup` 安装依赖。
- [x] `yarn test` 通过（10/10）。

验收：契约测试不再跳过，IPC 快照、卡池类型、补丁标记全部通过。

### M2 构建与启动器联调（进行中）

- [x] `yarn build:games` 两个游戏构建成功。
- [ ] `yarn dev` 显示两个游戏“已就绪”（本地沙箱无法启动 Electron GUI，待真实桌面验证）。
- [ ] 分别点击进入原神/星铁，界面正常加载（同上）。
- [ ] 数据写入 `app.getPath('userData')/userData/<game>/`（同上）。
- [x] 统一定位数据到 AppData，并在启动时迁移旧安装目录数据。
- [x] 记录安装包体积与构建耗时：exe 59.5 MB，zip 80.5 MB；构建 248.5s，打包 33.2s。

### M3 数据迁移与打包

- [x] 统一版旧安装目录 `userData/<game>` 自动迁移到 AppData。
- [ ] 原版独立程序 `userData` 的数据导入 UI。
- [x] Windows exe 安装包与 zip 打包验证。
- [ ] 首次启动、升级、卸载路径验证。
- [ ] GitHub Release 自动发布验证（工作流已配置，尚未在远端发版）。
- [ ] README 用户文档。

### M4 统一更新器

- [ ] 统一 manifest 与更新包。
- [ ] 关闭 `WISH_UPDATE_DISABLED` 的临时做法。
- [ ] 更新失败回滚。

### M5 可选：UI 统一

- [ ] 统一启动页、设置页、更新提示。
- [ ] 游戏主界面仍使用 vendor 原版。
- [ ] 不破坏 subtree 同步。

## 14. 决策记录（ADR）

### ADR-001：使用 git subtree，而不是 submodule

- 背景：需要保留两个上游的更新能力，同时要打少量本地补丁。
- 决策：`git subtree add --squash` 导入到 `vendor/`。
- 理由：subtree pull 是三方合并，本地补丁可保留；submodule 无法直接修改上游代码。
- 代价：仓库体积略大；补丁冲突需要人工处理。

### ADR-002：托盘常驻 + 独立游戏子进程

- 背景：两个上游的 IPC 通道大量重名，且用户需要在关闭游戏后继续使用启动器。
- 决策：启动器进程常驻托盘，点击游戏时 `spawn` 一个带 `--wish-game=<id>` 的子进程；子进程带 `WISH_LAUNCHER_CHILD=1` 跳过单实例锁。
- 理由：避免 IPC 冲突，启动器无需退出，关闭游戏后可自动恢复入口。
- 代价：游戏运行时多一个 Electron 子进程；需要新增单实例 vendor 补丁。

### ADR-003：保留两套构建与依赖

- 背景：element-plus 版本不同，UI 结构不同。
- 决策：每个游戏使用自己的 `node_modules` 和 `.electron-vite` 配置构建。
- 理由：避免依赖冲突与大范围 UI 回归。
- 代价：安装依赖时间更长，产物中 UI 依赖重复。

### ADR-004：禁用上游自更新

- 背景：上游更新器会覆盖整个应用目录。
- 决策：补丁增加 `WISH_UPDATE_DISABLED` 提前返回。
- 理由：防止统一安装被原版包破坏。
- 代价：M4 之前没有自动更新。

### ADR-005：不做共享 core

- 背景：两份代码有大量相同文件，但差异集中在核心业务。
- 决策：不抽取 core，游戏逻辑留在 vendor。
- 理由：抽取 core 会使上游同步从自动合并退化为手工移植。
- 代价：存在重复代码；通过统一入口和文档降低维护成本。

## 15. 开放问题

1. 原版独立程序的老用户如何导入数据？统一版旧安装目录已自动迁移，原版独立程序仍需手动导入引导。
2. 是否需要保留原神的 Gist 上传功能？当前保留在 vendor 中，入口不变。
3. 两个游戏是否需要在启动器中显示最近一次数据更新时间？需要读取各自 `app.getPath('userData')/userData/<game>/`，属于 M5。
4. 安装包体积若明显增大，是否将 Vue/element-plus/echarts 外置为共享资源？需要 M2 实测后决定。
5. 是否支持 macOS/Linux？当前配置保留目标，但只在 Windows 上验证。
6. 上游的 `RELAUNCH` 通道没有携带 `--wish-game`，重启后会回到启动器。当前更新已禁用，不会触发；统一更新器上线时需要改为自定义重启逻辑。
