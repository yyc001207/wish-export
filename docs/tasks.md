# 任务看板

本文是方案 A 的执行清单。AI 编码代理每次开始工作时，从这里领取状态为 `TODO` 的最高优先级任务；完成后更新状态、备注与验收结果。

## 状态说明

| 状态 | 含义 |
| --- | --- |
| `DONE` | 已完成并通过验收 |
| `DOING` | 正在进行，备注里写清当前进度 |
| `TODO` | 待开始 |
| `BLOCKED` | 被外部条件阻塞，备注里写清原因 |
| `SKIP` | 明确不做，备注里写清原因 |

## 当前下一步

**T1.1：导入两个上游到 `vendor/`。**

这是所有后续任务的前置条件。执行前确认：

- 根仓库已提交；
- 工作区没有未提交的已跟踪改动；
- 用户同意执行会产生 git 提交的 `git subtree add`。

## M0：文档与骨架（DONE）

| ID | 任务 | 状态 | 产物 / 备注 |
| --- | --- | --- | --- |
| T0.1 | 方案 A 设计文档 | DONE | `docs/plan-a-design.md` |
| T0.2 | AI 协作入口说明 | DONE | `AGENTS.md` |
| T0.3 | 架构、开发、同步文档 | DONE | `docs/architecture.md`、`docs/development.md`、`docs/upstream-sync.md` |
| T0.4 | 统一入口 bootstrap | DONE | `apps/desktop/src/main/bootstrap.js` |
| T0.5 | 启动器页面 | DONE | `apps/desktop/src/launcher/` |
| T0.6 | 导入 / 同步 / 补丁 / 构建脚本 | DONE | `scripts/` |
| T0.7 | 契约测试与 CI | DONE | `tests/contracts/`、`.github/workflows/`；CI 尚未在远端实际运行 |
| T0.8 | 本地验证 | DONE | `node --check` 全部通过；`yarn test` 9 项全部按预期跳过，退出码 0 |

## M1：上游导入与补丁

| ID | 任务 | 状态 | 验收标准 |
| --- | --- | --- | --- |
| T1.1 | 导入两个上游 | TODO | `vendor/genshin`、`vendor/starrail` 存在；`git log` 有两条 `git-subtree-dir` 提交 |
| T1.2 | 应用 vendor 补丁 | TODO | `yarn patch-vendor` 首次输出应用 8 处（每个上游 4 处）；源码含 4 类标记 |
| T1.3 | 安装两个上游构建依赖 | TODO | `yarn setup` 成功；两个 vendor 都有 `node_modules/vite` |
| T1.4 | 契约测试转绿 | TODO | `yarn test` 不再跳过；IPC 快照、gachaType、idJson、补丁标记全部通过 |
| T1.5 | 校验上游默认分支 | TODO | 两个上游远程 `main` 可正常拉取；若上游改名，更新脚本与 workflow |

执行顺序：T1.1 → T1.2 → T1.3 → T1.4。

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
| T2.1 | 构建两个游戏 | TODO | `yarn build:games` 成功；四个关键产物存在 |
| T2.2 | 启动器联调 | TODO | `yarn dev` 打开启动器；两个游戏显示“已就绪” |
| T2.3 | 原神入口验证 | TODO | 点击原神进入原版界面；加载数据、导出 Excel、导出 UIGF 正常 |
| T2.4 | 星铁入口验证 | TODO | 点击星铁进入原版界面；加载数据、导出 Excel、导出 UIGF 正常 |
| T2.5 | 数据隔离验证 | TODO | 两个游戏分别写入 `userData/genshin/`、`userData/starrail/`；互不覆盖 |
| T2.6 | 切换与单实例验证 | TODO | 关闭游戏后可切换另一个；游戏运行时再次启动会聚焦当前窗口 |
| T2.7 | 记录体积与耗时 | TODO | 在 `docs/plan-a-design.md` 或本文件记录安装包体积、构建耗时 |

验收时重点观察：

- 控制台是否出现 IPC 重复注册错误；
- 两个游戏是否都写入正确的数据目录；
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
| T3.1 | 旧版数据导入 | TODO | 首次启动可识别旧 `userData/`；导入后数据出现在 `userData/<game>/`；旧文件保留 |
| T3.2 | 旧数据导入 UI | TODO | 启动器提供“导入旧数据”入口；可选择旧安装目录 |
| T3.3 | Windows 打包 | TODO | `yarn package` 产出 zip；解压后启动器可用 |
| T3.4 | 打包后路径验证 | TODO | 打包后 `app.getAppPath()`、`WISH_RENDERER`、`userData` 路径正确 |
| T3.5 | 用户文档 | TODO | 根 README 说明安装、使用、数据位置、从旧版迁移 |
| T3.6 | 许可证与署名 | TODO | 保留两个上游 MIT LICENSE，README 注明来源 |

### T3.1 实现提示

- 旧版两个程序各在自己的安装目录下写 `userData/`；
- 文件名为 `gacha-list-<uid>.json` 与 `config.json`；
- 两个游戏的 UID 可能相同，不能只靠 UID 判断归属；
- 由用户选择“这是原神数据”或“这是星铁数据”；
- 导入时只复制，不移动，不覆盖已有文件；
- 导入后提示需要重启或刷新数据。

### T3.3 打包提示

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
| T5.1 | 统一设置页 | TODO | 两个游戏共用语言、更新、数据目录设置，不影响游戏业务 |
| T5.2 | 启动器显示最近更新时间 | TODO | 读取 `userData/<game>/` 最新 `time` |
| T5.3 | 托盘快速切换 | TODO | 不破坏单进程单游戏约束 |

当前不做：游戏主界面统一、共享 core、单窗口双游戏。

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
| 安装包体积是否可接受 | 需要实测 | M2 完成后记录 |

## 更新规则

1. 开始任务前把状态改为 `DOING`，备注当前进度。
2. 完成后改为 `DONE`，在备注里写验证结果。
3. 被阻塞改为 `BLOCKED`，写清阻塞原因和需要谁处理。
4. 发现新任务追加到对应里程碑，不要插入到已完成里程碑。
5. 不要为了让任务“看起来完成”而跳过验收命令。
