# 版本迭代规则

本文定义统一工具的版本号、分支、提交、发布与回滚规则。所有版本相关操作以本文为准。

## 1. 适用范围

适用于根目录 `package.json` 的 `version`，也就是用户看到的统一工具版本。

两个上游的版本号（原神 0.12.1、星铁 0.3.2）只用于说明来源，不参与统一版本判断，也不直接作为统一版本号。

## 2. 版本号格式

统一版本号采用 `MAJOR.MINOR.PATCH`：

```text
0.1.0
│ │ └─ PATCH：兼容修复、数据同步、文案、构建修复
│ └─── MINOR：新功能、新游戏、新平台、行为增强
└───── MAJOR：破坏性变更
```

### 2.1 1.0.0 之前

当前处于 `0.x.y` 阶段：

- `MINOR` 可以包含破坏性变更，但必须在发布说明中明确写出。
- `PATCH` 只允许兼容修复、上游数据同步、翻译、构建与文档修复。
- 一旦用户数据格式、安装标识、更新协议稳定，再发布 `1.0.0`。

### 2.2 预发布版本

需要小范围验证时使用：

```text
0.2.0-beta.1
0.2.0-beta.2
0.2.0
```

规则：

- 预发布版本不发布为稳定版；
- 不覆盖已发布的预发布标签；
- 正式版发布后，预发布标签保留，不删除。

## 3. 版本号变更判定

| 变更内容 | 版本变化 | 示例 |
| --- | --- | --- |
| 上游仅数据更新 | PATCH | 星铁 `idJson.json` 更新到 4.8 |
| 上游代码更新，但用户行为不变 | PATCH | 内部重构、日志、构建脚本修复 |
| 新增卡池类型并完成适配 | MINOR | 上游新增抽卡类型，统一版可正常统计与导出 |
| 新增功能 | MINOR | 启动器显示最近更新时间、统一设置页 |
| 新增游戏 | MINOR | 未来接入新游戏 |
| 新增平台 | MINOR | 正式支持 macOS |
| 修复 bug | PATCH | 修复数据目录、导出、启动器问题 |
| 文案 / 翻译修正 | PATCH | i18n 文案调整 |
| 依赖补丁升级 | PATCH | 安全修复、兼容性修复 |
| 用户数据目录或格式不兼容 | MAJOR | `userData/<game>/` 结构改变且不自动迁移 |
| `appId` 改变 | MAJOR | 影响安装与更新识别 |
| 移除某个游戏 | MAJOR | 不再支持原神或星铁 |
| 更新协议不兼容 | MAJOR | 旧版无法升级到新版 |
| Electron 大版本升级导致行为变化 | MAJOR | 16 → 22 且需要用户迁移 |

上游同步本身不自动决定版本号。同步后根据实际影响选择 PATCH 或 MINOR。

## 4. 统一版本与上游快照

每次发布必须在发布说明中记录三个来源快照：

| 项目 | 获取方式 | 示例 |
| --- | --- | --- |
| 原神上游提交 | `git log -1 --format=%B -- vendor/genshin` 中的 `git-subtree-split` | `c4675ab...` |
| 星铁上游提交 | `git log -1 --format=%B -- vendor/starrail` 中的 `git-subtree-split` | `8a0b664...` |
| 星铁 idJson 版本 | `vendor/starrail/src/idJson.json` 的 `version` 字段 | `4.7` |

要求：

- 统一版本号不跟随上游版本号；
- 发布说明必须能让用户与维护者知道这一版基于哪个上游快照；
- 上游同步 PR 不自动改版本号，版本号在发布时统一提升。

## 5. 分支与标签

| 名称 | 用途 | 规则 |
| --- | --- | --- |
| `main` | 主分支 | 始终保持可构建、可测试 |
| `feat/<name>` | 新功能 | 从 `main` 拉出，合并后删除 |
| `fix/<name>` | 修复 | 从 `main` 拉出，合并后删除 |
| `hotfix/<version>` | 紧急修复 | 从发布标签拉出，修复后合并回 `main` |
| `bot/sync-upstream` | 上游自动同步 | 由 CI 创建，合并后删除 |

标签：

- 发布使用附注标签：`v0.1.0`；
- 标签只增不改，不覆盖、不移动；
- 预发布标签：`v0.2.0-beta.1`。

## 6. 提交规范

采用 Conventional Commits：

```text
<type>(<scope>): <subject>
```

允许的 `type`：

| type | 用途 | 版本影响 |
| --- | --- | --- |
| `feat` | 新功能 | MINOR |
| `fix` | 修复 | PATCH |
| `perf` | 性能优化 | PATCH |
| `refactor` | 无行为变化的重构 | PATCH |
| `docs` | 文档 | 不直接影响，随发布进入 PATCH |
| `test` | 测试 | 不直接影响，随发布进入 PATCH |
| `build` | 构建、打包 | PATCH |
| `ci` | CI 配置 | 不直接影响，随发布进入 PATCH |
| `chore` | 杂项、同步、版本发布 | 视内容 |

常用 scope：

```text
launcher, vendor, sync, build, docs, tests, deps, release
```

示例：

```text
feat(launcher): 显示两个游戏的最近更新时间
fix(vendor): 修复星铁数据目录迁移
chore(sync): starrail upstream
chore(release): v0.2.0
```

破坏性变更必须在提交正文或 footer 写明：

```text
BREAKING CHANGE: userData 目录改为按游戏分区，旧数据需要重新导入
```

版本号提交必须独立：

```text
chore(release): v0.2.0
```

不要把版本号修改混在功能提交里。

## 7. 发布流程

发布前必须满足：

- [ ] `git status` 干净；
- [ ] 上游已同步到预期快照；
- [ ] `yarn patch-vendor` 成功；
- [ ] `yarn test` 全部通过；
- [ ] `yarn build:games` 两个游戏构建成功；
- [ ] `yarn dev` 启动器正常，两个游戏都能进入；
- [ ] 两个游戏的数据分别写入 `userData/<game>/`；
- [ ] Excel、UIGF 导出各验证一次；
- [ ] 上游自更新仍处于禁用状态。

发布步骤：

1. 确认版本号变化符合第 3 节。
2. 修改根 `package.json` 的 `version`。
3. 运行完整验证：

   ```powershell
   yarn patch-vendor
   yarn test
   yarn build:games
   yarn dev
   ```

4. 打包：

   ```powershell
   yarn package
   ```

5. 在 Windows 上解压 `release/` 产物，按第 7 节清单手工验证。
6. 提交版本号：

   ```powershell
   git add package.json
   git commit -m "chore(release): v0.1.1"
   ```

7. 打附注标签：

   ```powershell
   git tag -a v0.1.1 -m "v0.1.1"
   ```

8. 推送提交与标签：

   ```powershell
   git push origin main
   git push origin v0.1.1
   ```

9. 上传 `release/` 中的安装包。
10. 创建 GitHub Release，填写第 8 节的发布说明。

推送与打标签属于人工确认操作，AI 代理不得自行执行。

## 8. 发布说明模板

```markdown
## vX.Y.Z

发布日期：YYYY-MM-DD

### 上游快照

- 原神：<git-subtree-split>
- 星铁：<git-subtree-split>
- 星铁 idJson：<version>

### 变更

- feat: ...
- fix: ...
- chore(sync): ...

### 破坏性变更 / 迁移

- 无 / 具体说明

### 已知问题

- ...

### 校验

- 安装包：Wish Export-X.Y.Z-win.zip
- 构建时间：YYYY-MM-DD HH:mm
```

## 9. 数据兼容性

| 版本变化 | 数据兼容要求 |
| --- | --- |
| PATCH | 必须兼容现有 `userData/<game>/`，不得要求用户迁移 |
| MINOR | 尽量兼容；如新增字段，必须能读取旧数据 |
| MAJOR | 可以提供迁移工具，但必须在发布说明中写清步骤 |

额外约束：

- `config.json` 中的 `urls` 使用应用名派生的密钥加密，不要在 PATCH/MINOR 中修改应用名。
- `userData/<game>/` 结构变更属于破坏性变更。
- UID 相同的数据不能只靠 UID 判断游戏归属。

## 10. 热修复

适用：已发布版本存在严重问题，且 `main` 上还有未完成的功能。

步骤：

1. 从问题版本标签拉出 `hotfix/<version>`；
2. 只包含最小修复；
3. 运行 `yarn test`、`yarn build:games` 与手工验证；
4. 提升 PATCH 版本；
5. 打标签、发布；
6. 将修复合并回 `main`。

不要在热修复分支中同步上游或做重构。

## 11. 回滚与撤包

- 已发布标签不删除、不移动。
- 发现严重问题时：
  1. 在发布页标记该版本不可用；
  2. 从上一个稳定版本拉出 `hotfix`；
  3. 修复后发布新的 PATCH；
  4. 在发布说明中说明回滚原因。
- 不要用强制推送改写 `main` 历史。

## 12. 与上游同步的关系

| 场景 | 版本动作 |
| --- | --- |
| 每日同步 PR | 不改版本号 |
| 同步后发现上游新增卡池类型 | 完成适配后 MINOR |
| 同步仅更新 idJson | 发布时 PATCH |
| 同步导致补丁冲突 | 先修复适配，再决定 PATCH/MINOR |
| 上游破坏性变化 | 评估是否 MAJOR |

版本号只在准备发布时提升，不在同步 PR 中提升。

## 13. 版本号唯一来源

- 唯一来源：根 `package.json` 的 `version`。
- 启动器通过 `app.getVersion()` 显示。
- 子项目与 vendor 的 `package.json` 版本不作为统一版本。
- UIGF 导出中的 `export_app_version` 仍由上游代码写入，属于导出格式的一部分，不需要与统一版本一致。

## 14. AI 代理约束

- 不得自行执行 `git tag`、`git push`、`git commit`，除非用户明确要求。
- 不得自行提升版本号，除非任务明确标注为「发布」。
- 发布前必须逐项执行第 7 节检查清单。
- 不得修改已发布标签。
- 版本规则变更必须更新本文，并在提交中说明原因。
