# 上游同步指南

本文说明如何导入、同步两个上游，以及同步后如何验证和处理冲突。

## 1. 同步模型

```text
你的仓库
├─ vendor/genshin   ← git subtree ← https://github.com/biuuu/genshin-wish-export.git (main)
└─ vendor/starrail  ← git subtree ← https://github.com/biuuu/star-rail-warp-export.git (main)
```

选择 `git subtree` 而不是 `git submodule`：

- 上游代码会真实存在于本仓库，可以直接打补丁；
- `git subtree pull` 使用三方合并，本地的 5 类补丁（每个上游各 5 处）会自动保留；
- 只有上游修改了补丁所在行时才会冲突，冲突面很小；
- 不需要为每个补丁维护 fork 或 patch 队列。

不选择 `submodule`：submodule 只能锁 commit，修改要另建 fork，每次升级都要重新应用补丁。

## 2. 首次导入

前置条件：

- 根仓库已提交，工作区没有未提交的已跟踪改动；
- 能访问 GitHub；
- 已安装 git（需要支持 `git subtree`）。

执行：

```powershell
yarn import-upstream
```

等价于：

```powershell
git remote add upstream-genshin  https://github.com/biuuu/genshin-wish-export.git
git remote add upstream-starrail https://github.com/biuuu/star-rail-warp-export.git

git subtree add --prefix=vendor/genshin  upstream-genshin  main --squash
git subtree add --prefix=vendor/starrail upstream-starrail main --squash
```

导入完成后继续：

```powershell
yarn patch-vendor   # 应用 5 类最小补丁（每个上游 5 处）
yarn setup          # 安装两个上游的构建依赖
yarn test           # 契约测试
yarn build:games    # 构建两个分析工具
yarn dev            # 打开启动器
```

注意：

- `vendor/` 目录不能预先存在。如果已经存在，先移走并提交，再重新导入。
- 首次导入会产生 git 提交，这是 `git subtree add` 的正常行为。
- 旧的两个克隆已删除；如需参考，请重新克隆到仓库外的目录（例如 `...\code\_upstream-reference\`），不要放到仓库根目录。根目录 `.gitignore` 保留了忽略规则，防止误提交。
- Git for Windows 可能输出 `git-subtree: line 877: echo: write error: Bad file descriptor`。只要 `git log` 中有 `as 'vendor/<game>'` 的提交，且 `vendor/<game>/package.json` 存在，导入就是成功的；脚本按实际结果判定，不依赖退出码。

导入成功的验证命令：

```powershell
git log --oneline -4
Test-Path vendor/genshin/package.json
Test-Path vendor/starrail/package.json
```

### 2.1 本地已有上游克隆怎么办

如果你在仓库根目录重新克隆了上游，它们会是各自独立的 git 仓库，根仓库不会跟踪它们的内容。`yarn import-upstream` 使用远程 URL，不读取这些目录，所以它们不影响导入。

处理方式：

| 方式 | 操作 | 适合场景 |
| --- | --- | --- |
| 移到仓库外（推荐） | 移到例如 `...\code\_upstream-reference\` | 想保留完整上游历史做对照 |
| 暂时保留 | 根 `.gitignore` 已忽略这两个目录 | 导入与构建验证期间 |
| 删除 | 等 M2 构建验证通过后再删 | 不再需要完整历史 |

注意：

- 不要把这两个目录直接复制进 `vendor/`，也不要把它们的 `.git` 带进 `vendor/`。`vendor/` 只放 `git subtree` 导入的代码。
- 如果必须离线导入，可以用本地路径作为 subtree 来源：

  ```powershell
  git subtree add --prefix=vendor/genshin ./genshin-wish-export main --squash
  ```

  但后续同步脚本与 CI 使用 GitHub URL，建议导入后统一改回远程 URL；本地路径的 `.git` 不会被带进 `vendor/`。
- 旧克隆已删除，不影响统一仓库：`vendor/` 已有代码，GitHub 上游随时可以重新克隆。以后如重新克隆，删除前至少完成一次 `yarn build:games` 和启动器验证。
- 不要用 `git add .` 把这两个目录提交进统一仓库；如果它们出现在 `git status` 里，说明 `.gitignore` 规则被改动了。

## 3. 日常同步

### 3.1 本地同步

```powershell
yarn sync-upstream
```

脚本会依次执行：

1. 检查工作区是否有未提交的已跟踪改动；
2. `git subtree pull` 原神上游；
3. `git subtree pull` 星铁上游；
4. `yarn patch-vendor` 重新校验补丁；
5. `node --test tests/contracts` 运行契约测试。

如果某一步失败，脚本停止并给出提示。同步本身会产生 git 提交，推送到远端由你决定。

只想同步其中一个上游时：

```powershell
git subtree pull --prefix=vendor/starrail upstream-starrail main --squash -m "chore(sync): starrail upstream"
```

### 3.2 自动同步（GitHub Actions）

`.github/workflows/sync-upstream.yml` 每天北京时间 04:00 检查一次，也支持手动触发：

1. checkout 完整历史（`fetch-depth: 0`，subtree 需要）；
2. 拉取两个上游；
3. 重新应用补丁；
4. 运行契约测试；
5. 创建或更新 `bot/sync-upstream` PR。

上游没有变化时不会产生 PR。测试失败时 PR 仍会创建，方便直接看到上游改了什么。

## 4. 补丁清单

补丁由 `scripts/apply-vendor-patches.js` 统一定义与生成，禁止手工修改 vendor。

| id | 文件 | 标记 | 改动 |
| --- | --- | --- | --- |
| `utils-app-root` | `src/main/utils.js` | `WISH_APP_ROOT` | `appRoot` 优先读数据根目录 |
| `utils-user-data` | `src/main/utils.js` | `process.env.WISH_GAME` | `userDataPath` 追加按分析工具划分的子目录 |
| `main-renderer` | `src/main/main.js` | `WISH_RENDERER` | 渲染器入口由统一入口注入 |
| `main-single-instance` | `src/main/main.js` | `WISH_LAUNCHER_CHILD` | 分析工具子进程跳过单实例锁 |
| `update-disabled` | `src/main/update/index.js` | `WISH_UPDATE_DISABLED` | 统一版禁用上游自更新 |

补丁后的代码：

```js
// [wish-export patch] 统一入口注入数据根目录
const appRoot = process.env.WISH_APP_ROOT || (isDev ? path.resolve(__dirname, '..', '..') : path.resolve(app.getAppPath(), '..', '..'))

// [wish-export patch] 每个游戏使用独立数据目录
const userDataPath = path.resolve(appRoot, 'userData', process.env.WISH_GAME || 'default')
```

```js
// [wish-export patch] 渲染进程入口由统一入口注入
const rendererUrl = process.env.WISH_DEV_SERVER_URL
const rendererFile = process.env.WISH_RENDERER || 'dist/electron/renderer/index.html'
if (rendererUrl) win.loadURL(rendererUrl)
else win.loadFile(rendererFile)
```

```js
// [wish-export patch] 托盘启动器拉起的游戏子进程跳过单实例锁
const isFirstInstance = process.env.WISH_LAUNCHER_CHILD === '1' || app.requestSingleInstanceLock()
```

```js
const update = async () => {
  // [wish-export patch] 统一入口禁用上游自更新，避免覆盖统一安装目录
  if (isDev || process.env.WISH_UPDATE_DISABLED === '1') return
  // ...
}
```

### 增加新补丁的流程

1. 在 `scripts/apply-vendor-patches.js` 的 `PATCHES` 数组新增一项；
2. 必须包含 `id`、`file`、`marker`、`target`、`replacement`；
3. `replacement` 必须以 `// [wish-export patch]` 注释开头；
4. 运行 `yarn patch-vendor`；
5. 运行 `yarn test`；
6. 更新本文的补丁清单。

## 5. 冲突处理

### 5.1 什么情况会冲突

只有以下情况需要人工处理：

1. 上游修改了某个补丁所在的同一行；
2. 上游删除了 `src/main/utils.js`、`src/main/main.js`、`src/main/update/index.js` 或改了路径；
3. 两个上游都改了同一个被导入目录（不会发生，目录不同）。

### 5.2 subtree pull 冲突

现象：`git subtree pull` 输出 `CONFLICT`，脚本抛错。

处理步骤：

1. `git status` 查看冲突文件；
2. 打开冲突文件，保留上游新逻辑，同时保留 `[wish-export patch]` 行为；
3. 如果补丁方式需要调整，先修好 vendor 文件，再同步更新 `scripts/apply-vendor-patches.js` 的 `target` / `replacement`；
4. 执行 `git add <文件>`；
5. 执行 `git commit` 完成 subtree merge；
6. 运行 `yarn patch-vendor` 和 `yarn test`；
7. 在 PR 描述或提交信息中说明冲突原因。

### 5.3 补丁脚本失败

现象：`yarn patch-vendor` 报“未找到待替换片段”。

原因：上游重写了补丁所在的代码。

处理步骤：

1. 打开报错文件，找到上游的新写法；
2. 判断新写法是否仍然需要补丁：
   - 需要：更新脚本里的 `target` 和 `replacement`；
   - 不需要（例如上游自己支持了环境变量）：删除对应补丁，并更新文档；
3. 运行 `yarn patch-vendor` 与 `yarn test`；
4. 更新本文和 `docs/design.md` 的补丁清单。

不要为了让脚本通过而把 `target` 改成模糊匹配，也不要跳过校验。

### 5.4 契约测试失败

| 失败项 | 含义 | 处理 |
| --- | --- | --- |
| IPC 通道快照不一致 | 上游新增/删除了通道 | 检查上游 renderer 是否新增调用；更新适配层与快照 |
| gachaType 键集合变化 | 上游新增卡池类型 | 更新映射、Excel/UIGF 逻辑与文案 |
| idJson 结构异常 | 星铁数据格式变化 | 检查 `bridge.js` / `UIGFJson.js` 是否同步修改 |
| 补丁标记缺失 | 上游覆盖了补丁 | 运行 `yarn patch-vendor`；若失败按 5.3 处理 |
| 构建失败 | 上游依赖或代码变了 | 查看构建日志；必要时固定 Node 版本或更新依赖 |

更新快照前先确认产品行为已经跟上，不要只改 `expected-channels.json`。

## 6. 同步后的检查清单

- [ ] `git diff` 确认 `vendor/` 只包含上游改动与 5 类补丁（每个上游 5 处）。
- [ ] `yarn patch-vendor` 成功。
- [ ] `yarn test` 全部通过。
- [ ] `yarn build:games` 两个分析工具构建成功。
- [ ] `yarn dev` 启动器显示两个分析工具“已就绪”。
- [ ] 分别进入两个分析工具，加载数据、导出 Excel、导出 UIGF 各验证一次。
- [ ] 数据仍然写入 `app.getPath('userData')/userData/<game>/`。
- [ ] 更新 `docs/tasks.md` 或 PR 描述。

## 7. 版本与发布策略

- 统一版本号在根 `package.json`，完整规则见 [versioning.md](versioning.md)。
- 两个上游的版本号只用于展示与 UIGF 的 `export_app_version`，不参与统一版本判断。
- 上游同步 PR 不修改版本号；发布时再按变更影响提升 PATCH / MINOR / MAJOR。
- 统一更新器已实现（M4）：由启动器读取本仓库 Release 并安装完整包；上游自更新的禁用补丁永久保留，不要移除 `WISH_UPDATE_DISABLED`。

## 8. 回滚

同步出问题时：

```powershell
git log --oneline -5
git revert <sync-commit>
```

或者：

```powershell
git reset --hard <同步前的提交>
```

`git reset --hard` 属于破坏性操作，执行前必须确认没有未提交的工作，并且需要用户明确同意。

## 9. 上游变化速查

| 上游变化 | 是否需要改统一层 | 需要做什么 |
| --- | --- | --- |
| 星铁 `idJson.json` 更新 | 否 | 同步 + 契约测试 |
| 卡池类型新增 | 可能 | 更新契约快照、检查 Excel/UIGF 是否需要新类型 |
| IPC 通道新增 | 可能 | 检查渲染器是否调用；更新快照 |
| 新增依赖 | 可能 | `yarn setup` 重装；确认构建通过 |
| 改写 `utils.js` 路径逻辑 | 是 | 处理冲突，更新补丁脚本 |
| 改写更新器 | 是 | 确认 `WISH_UPDATE_DISABLED` 仍生效 |
| 上游更换构建工具 | 是 | 单独立项，不在日常同步中处理 |
