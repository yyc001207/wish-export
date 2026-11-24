# 任务看板

本文是项目的执行清单。AI 编码代理每次开始工作时，从这里领取状态为 `TODO` 的最高优先级任务；完成后更新状态、备注与验收结果。

## 状态说明

| 状态 | 含义 |
| --- | --- |
| `DONE` | 已完成并通过验收 |
| `DOING` | 正在进行，备注里写清当前进度 |
| `TODO` | 待开始 |
| `BLOCKED` | 被外部条件阻塞，备注里写清原因 |
| `SKIP` | 明确不做，备注里写清原因 |

## 当前下一步

**M3 剩余真机确认**（首次启动 / 覆盖升级 / 卸载后数据保留）；之后为 M4 统一更新器。

T3.5 用户文档已于 2026-11-24 完成，根 README 重写为面向使用者的结构：下载安装、使用方法、数据位置与备份、两种旧版迁移、常见问题、开发入口。

T3.6 许可证与署名已于 2026-11-24 完成：根 `LICENSE`（MIT，2026 yyc001207）；`THIRD-PARTY-NOTICES.md` 收录两个上游 MIT 全文与版权归属，并加入 `electron-builder.yml` 的 `files`，随安装包分发；README 注明来源与作者。

M2 构建与启动器联调已于 2026-11-24 在真实桌面验证通过：启动器可打开并显示两个分析工具“已就绪”，两个分析工具分别可进入，导出正常；数据分别写入 `app.getPath('userData')/userData/genshin/` 与 `.../starrail/`，未出现 IPC 重复注册错误。

T3.2 原版数据导入已于 2026-11-24 真机验证通过：启动器“导入原版数据”→ 选择目录（默认探测 `%LOCALAPPDATA%\Programs` 下的原版安装目录）→ 选择游戏归属 → 只复制 `config.json` 与 `gacha-list-*.json` 到 `userData/<game>/`，不覆盖已有文件；重复导入提示“已存在未覆盖”，分析工具运行中入口禁用。已随 v0.2.0 发布。

## M0：文档与骨架（DONE）

| ID | 任务 | 状态 | 产物 / 备注 |
| --- | --- | --- | --- |
| T0.1 | 整体设计文档 | DONE | `docs/design.md` |
| T0.2 | AI 协作入口说明 | DONE | `AGENTS.md` |
| T0.3 | 架构、开发、同步文档 | DONE | `docs/architecture.md`、`docs/development.md`、`docs/upstream-sync.md` |
| T0.4 | 统一入口 bootstrap | DONE | `apps/desktop/src/main/bootstrap.js` |
| T0.5 | 启动器页面 | DONE | `apps/desktop/src/launcher/` |
| T0.6 | 导入 / 同步 / 补丁 / 构建脚本 | DONE | `scripts/` |
| T0.7 | 契约测试与 CI | DONE | `tests/contracts/`、`.github/workflows/`；CI 已在 v0.1.0、v0.1.1、v0.2.0 实际运行并产出产物 |
| T0.8 | 本地验证 | DONE | `node --check` 全部通过；`yarn test` 9 项全部按预期跳过，退出码 0 |
| T0.9 | 版本迭代规则 | DONE | `docs/versioning.md`；AGENTS、README、开发与同步文档已建立引用 |

## M1：上游导入与补丁

| ID | 任务 | 状态 | 验收标准 |
| --- | --- | --- | --- |
| T1.1 | 导入两个上游 | DONE | `vendor/genshin`（c4675ab）、`vendor/starrail`（8a0b664）已存在；两条 subtree 提交已生成 |
| T1.2 | 应用 vendor 补丁 | DONE | 共 10 处（每个上游 5 处），5 类标记齐全；已提交 `93754f0` 与后续单实例补丁 |
| T1.3 | 安装两个上游构建依赖 | DONE | `yarn setup` 成功；两个 vendor 均有 `node_modules/vite` |
| T1.4 | 契约测试转绿 | DONE | `yarn test` 9/9 通过，不再跳过 |
| T1.5 | 校验上游默认分支 | DONE | 两个上游 `main` 均已通过 `git ls-remote` 验证并使用 |

执行顺序：M1、M2、M3 已完成（T3.2 于 2026-11-24 真机验证通过）；随后 T3.5、T3.6。

T1.1 命令：

```powershell
yarn import-upstream
```

T1.2 至 T1.4：

```powershell
yarn patch-vendor
yarn setup
yarn test
```

备注：

- T1.1 会产生 git 提交，执行前需要用户确认。
- 如果 `vendor/` 已存在，不要覆盖，先确认是否已经导入过。
- 如果 `yarn setup` 因网络失败，可进入 `vendor/<game>` 单独重试。

## M2：构建与启动器联调

| ID | 任务 | 状态 | 验收标准 |
| --- | --- | --- | --- |
| T2.1 | 构建两个分析工具 | DONE | `yarn build:games` 成功；main 与 renderer 产物齐全 |
| T2.2 | 启动器联调 | DONE | 2026-11-24 真实桌面验证：启动器显示两个分析工具“已就绪”，点击后隐藏到托盘、入口变灰，关闭分析工具后自动回到启动器 |
| T2.3 | 原神入口验证 | DONE | 真实桌面验证：入口加载正常，导出正常 |
| T2.4 | 星铁入口验证 | DONE | 真实桌面验证：入口加载正常，导出正常 |
| T2.5 | 数据隔离验证 | DONE | 真实运行确认数据分别写入 `%APPDATA%\hoyo-gacha-export\userData\genshin\`、`...\starrail\` |
| T2.6 | 切换与单实例验证 | DONE | 真机验证：运行中入口禁用，关闭后可切到另一分析工具；未出现 IPC 重复注册错误 |
| T2.7 | 记录体积与耗时 | DONE | v0.2.0（Actions）exe 59.8 MB（62,696,935 B）、zip 80.5 MB（84,448,614 B）；v0.1.1 为 exe 62,693,202 B、zip 84,444,599 B；本地构建 248.5s、打包 33.2s（v0.1.0 记录） |
| T2.8 | 托盘常驻与分析工具子进程 | DONE | 真机验证：启动器常驻托盘、分析工具子进程独立、入口禁用/恢复均正常 |

验收时重点观察：

- 控制台是否出现 IPC 重复注册错误；
- 两个分析工具是否都写入正确的数据目录；
- 原神/星铁界面是否因为路径变化出现空白、资源 404；
- DevTools 是否有 CSP 或 preload 报错。

如果构建失败：

1. 先进入 `vendor/<game>` 单独执行 `node .electron-vite/build.js`；
2. 记录完整错误；
3. 判断是 Node 版本、依赖缺失还是上游代码变化；
4. 不要直接升级依赖或重写构建配置。

## M3：数据迁移与打包

| ID | 任务 | 状态 | 验收标准 |
| --- | --- | --- | --- |
| T3.1 | 统一版旧安装目录数据迁移 | DONE | 启动时复制 `<旧安装目录>/userData/<game>` 到 `app.getPath('userData')/userData/<game>`；只补齐缺失文件、不覆盖、不删除；有单测 |
| T3.2 | 原版独立程序数据导入 UI | DONE | 启动器提供“导入原版数据”入口，默认定位原版安装目录，选目录后选择游戏归属，只复制 `config.json` 与 `gacha-list-*.json`、不覆盖；单测 6 项通过；已随 v0.2.0 发布；2026-11-24 真机验证通过（导入、重复导入不覆盖、运行中禁用） |
| T3.3 | Windows 打包 | DONE | GitHub Actions 产出 `Wish-Export-0.2.0-x64.exe`（59.8 MB）与 `.zip`（80.5 MB）；v0.1.0、v0.1.1、v0.2.0 已发布 |
| T3.4 | 打包后路径验证 | DONE | `win-unpacked/resources/app` 中 bootstrap、两个分析工具的 main/renderer 均存在 |
| T3.5 | 用户文档 | DONE | 根 README 覆盖下载安装、使用流程、数据位置与备份、从统一版旧目录/原版独立程序迁移、常见问题、开发入口 |
| T3.6 | 许可证与署名 | DONE | 根 `LICENSE`（MIT，2026 yyc001207）；`THIRD-PARTY-NOTICES.md` 收录两个上游 MIT 全文与版权归属，并随安装包分发（`electron-builder.yml` files）；README 注明来源 |
| T3.7 | GitHub Releases 自动发布 | DONE | `release.yml` 已在 v0.1.0、v0.1.1、v0.2.0 实际运行成功，exe/zip/SHA256 已上传 |

### T3.1 实现提示

- 统一版旧安装目录的数据结构是 `userData/<game>/`；
- 新位置为 `app.getPath('userData')/userData/<game>/`；
- 启动时递归复制，目标已存在的文件不覆盖；
- 旧文件保留，不删除；
- 迁移失败只记录日志，不阻塞启动。

### T3.2 实现提示

实现（2026-11-24）：

- 主进程 `apps/desktop/src/main/import-legacy-data.js`：识别 `config.json` 与 `gacha-list-<uid>.json`，解析安装目录 / `userData` / 数据目录三种选择，只复制不覆盖，探测 `%LOCALAPPDATA%\Programs` 下的原版安装目录作默认值；
- `bootstrap.js` 新增 IPC `IMPORT_PICK_DIR`、`IMPORT_LEGACY_DATA`：选择目录、校验游戏归属、分析工具运行中拒绝导入、目标为 `app.getPath('userData')/userData/<game>/`；
- 启动器 `apps/desktop/src/launcher/`：footer 增加“导入原版数据”按钮、选择游戏归属的模态框、运行中禁用、Esc 取消、结果提示；
- 单测 `tests/unit/import-legacy-data.test.js` 覆盖：文件识别、三种目录解析、忽略日志/窗口状态、不覆盖、自动建目录、异常参数。

真机验证步骤：

1. `yarn build:games` 后 `yarn dev`（或运行已安装的 v0.2.0）；
2. 点击“导入原版数据”，确认文件选择框默认落在原版安装目录，也可手动选择；
3. 选中后出现“这份数据属于哪个游戏？”模态框，分别对原神、星铁各导入一次；
4. 确认提示“已导入 N 个文件”，`%APPDATA%\hoyo-gacha-export\userData\<game>\` 出现 `gacha-list-*.json` / `config.json`；
5. 重复导入同一目录，确认提示“已存在未覆盖”，文件未被改动；
6. 运行分析工具时点击导入，确认按钮禁用（主进程也会拒绝）。

验证结果（2026-11-24，真实桌面）：通过；T3.2 已改为 DONE。

### T3.3 打包提示

- Windows 产物由 GitHub Actions 构建，不在本地运行 electron-builder；
- 推送 `v*` 标签触发 `release.yml`（构建并发布），安装包只由打标签产出；推 `main` 或提 PR 触发 `ci.yml`（语法检查 + 契约测试）；需要临时安装包时手动运行 `build.yml`；
- NSIS 默认安装到当前用户目录，避免 Program Files 写入权限问题；
- 数据写在 `app.getPath('userData')/userData/<game>/`，更新/重装不会覆盖；安装/卸载前仍建议备份；
- 安装包未签名，SmartScreen 可能提示未知发布者；
- 当前 `electron-builder.yml` 已配置 `asar: false`；
- 不要打包 `vendor/` 与 `node_modules/`；
- 检查 `app.getAppPath()` 在打包后的实际值；
- 确认 zip 解压路径没有中文/空格兼容问题。

## M4：统一更新器

| ID | 任务 | 状态 | 验收标准 |
| --- | --- | --- | --- |
| T4.1 | 更新器设计 | TODO | 明确 manifest 格式、更新包结构、版本比较、回滚 |
| T4.2 | 实现统一更新器 | TODO | 能从自己的发布源下载完整统一包并替换 |
| T4.3 | 关闭临时禁用 | TODO | 移除 `WISH_UPDATE_DISABLED` 或改为由统一更新器接管 |
| T4.4 | 更新失败回滚 | TODO | 下载失败、校验失败、替换失败都不破坏现有安装 |

约束：

- 更新包必须覆盖整个统一应用目录；
- 不能复用上游的 `app.zip` 更新逻辑；
- 更新前备份 `userData/`；
- 版本号统一使用根 `package.json`。

## M5：可选 UI 统一

| ID | 任务 | 状态 | 验收标准 |
| --- | --- | --- | --- |
| T5.1 | 统一设置页 | TODO | 两个分析工具共用语言、更新、数据目录设置，不影响分析工具业务 |
| T5.2 | 启动器显示最近更新时间 | TODO | 读取 `app.getPath('userData')/userData/<game>/` 最新 `time` |
| T5.3 | 托盘快速切换 | TODO | 不破坏单进程单工具约束 |

当前不做：分析工具主界面统一、共享 core、单窗口双分析工具。

## 任务模板

新增任务时复制：

```markdown
| T?.? | 任务名 | TODO | 可观测的验收标准 |
```

如果任务涉及代码，补充：

```markdown
### T?.? 实现提示

- 涉及文件：
- 关键约束：
- 验证命令：
```

## 已知阻塞与人工确认项

| 事项 | 类型 | 说明 |
| --- | --- | --- |
| 执行 `git subtree add/pull` | 需要人工确认 | 会产生提交；AI 不主动执行 |
| 旧版数据迁移策略 | 需要产品确认 | 自动扫描还是手动选择目录 |
| 统一版 `appId` 与发布渠道 | 需要产品确认 | 影响旧用户升级感知 |
| macOS/Linux 支持 | 需要环境 | 当前只在 Windows 验证 |
| 安装包体积是否可接受 | 需要产品确认 | 已实测 v0.2.0：exe 59.8 MB（62,696,935 B）、zip 80.5 MB（84,448,614 B） |

## 更新规则

1. 开始任务前把状态改为 `DOING`，备注当前进度。
2. 完成后改为 `DONE`，在备注里写验证结果。
3. 被阻塞改为 `BLOCKED`，写清阻塞原因和需要谁处理。
4. 发现新任务追加到对应里程碑，不要插入到已完成里程碑。
5. 不要为了让任务“看起来完成”而跳过验收命令。
