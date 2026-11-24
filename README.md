# wish-export

把 [genshin-wish-export](https://github.com/biuuu/genshin-wish-export) 与
[star-rail-warp-export](https://github.com/biuuu/star-rail-warp-export) 合并为
一个安装包、一个入口的抽卡记录导出工具。

当前采用**方案 A**：

- 两个上游以 `git subtree` 只读引入到 `vendor/`；
- 统一启动器选择原神或崩坏：星穹铁道；
- 同一时间只运行一个游戏，数据分别写入 `userData/<game>/`；
- 上游更新通过 `yarn sync-upstream` 同步，并用契约测试校验。

## 当前状态

方案 A 的骨架、文档、上游导入、vendor 补丁、两个游戏构建与 Windows exe/zip 打包已完成。
启动器与游戏界面仍需在真实桌面点击验证；旧数据迁移与统一更新器尚未实现。
进度见 [docs/tasks.md](docs/tasks.md)。

## 文档

- [AGENTS.md](AGENTS.md)：AI 编码代理的入口说明与项目铁律
- [docs/plan-a-design.md](docs/plan-a-design.md)：方案 A 设计与决策记录
- [docs/architecture.md](docs/architecture.md)：模块、IPC、数据模型、导出流程
- [docs/upstream-sync.md](docs/upstream-sync.md)：上游同步与冲突处理
- [docs/development.md](docs/development.md)：环境、开发、构建、调试、打包
- [docs/versioning.md](docs/versioning.md)：版本号、提交规范、发布与回滚
- [docs/tasks.md](docs/tasks.md)：任务看板与验收标准

## 下载

发布后可在 GitHub Releases 下载：

- `Wish-Export-<version>-x64.exe`：NSIS 安装包，默认安装到当前用户目录；
- `Wish-Export-<version>-x64.zip`：便携包，解压到可写目录后运行；
- `SHA256SUMS.txt`：校验文件。

数据保存在程序目录的 `userData/<game>/`。安装、卸载或升级前请备份该目录。
安装包未签名，Windows SmartScreen 可能提示未知发布者。

启动器会常驻托盘；点击游戏后启动器隐藏到托盘，入口变灰不可点击。关闭游戏窗口会自动回到启动器。关闭启动器窗口只是收起到托盘，托盘菜单“退出”才会结束程序。

## 快速开始（开发）

```powershell
yarn install
yarn import-upstream   # 会创建 git 提交
yarn patch-vendor
yarn setup
yarn test
yarn build:games
yarn dev
```

## 目录

```text
apps/desktop/    统一入口与启动器
scripts/         导入、同步、补丁、依赖、构建脚本
tests/contracts/ 上游契约测试
docs/            设计与开发文档
vendor/          导入后存在：两个上游的只读副本
```

## 许可证

MIT。两个上游同样是 MIT，版权归各自作者所有，详见：
`vendor/genshin/LICENSE`、`vendor/starrail/LICENSE`（导入后存在）。
