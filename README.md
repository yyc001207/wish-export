# Wish Export

把 [genshin-wish-export](https://github.com/biuuu/genshin-wish-export) 与
[star-rail-warp-export](https://github.com/biuuu/star-rail-warp-export) 两个上游项目
合并成**一个安装包、一个入口**的桌面工具：装一次，启动器里选原神或崩坏：星穹铁道。
两个分析工具的数据互相隔离，导出格式与上游完全一致。

- 一个安装包包含原神、星铁两个分析工具；
- 启动器常驻托盘，同一时间只运行一个分析工具；
- 数据按分析工具分别保存，互不覆盖；
- 上游更新通过 `git subtree` 同步，并用契约测试校验。

当前版本：见 [Releases](https://github.com/yyc001207/wish-export/releases)。进度与已知限制见 [docs/tasks.md](docs/tasks.md)。

## 下载与安装

到 [GitHub Releases](https://github.com/yyc001207/wish-export/releases) 下载最新版本：

- `Wish-Export-<version>-x64.exe`：NSIS 安装包，默认安装到当前用户目录，不需要管理员权限；
- `Wish-Export-<version>-x64.zip`：便携包，解压到可写目录后运行 `Wish Export.exe`；
- `SHA256SUMS.txt`：校验文件，可在 PowerShell 里用 `Get-FileHash` 对照。

系统要求：Windows 10/11 x64。目前只提供 Windows 安装包。

安装包未签名，Windows SmartScreen 可能提示“未知发布者”，需要点“更多信息 → 仍要运行”。

## 使用方法

1. 启动 Wish Export，启动器里会显示两个分析工具（原神 / 崩坏：星穹铁道）；
2. 点击要用的那一个，进入它自己的界面；
3. 在游戏里打开**祈愿历史记录**（原神）或**跃迁详情**（星铁）页面；
4. 回到工具点“加载数据”（首次）或“更新数据”（以后每次）；
5. 需要留档时点“导出Excel”，或在设置里的“导入/导出”点“导出数据”生成 UIGF / SRGF 的 JSON。

补充说明：

- 首次读取需要游戏正在运行，并且已经在游戏里打开过对应历史页面；
- 读取到的新记录会与本地已有数据合并后保存，不会重复；
- 多个账号：点界面上的加号，切换账号后重新打开历史页面，再点“加载数据”；
- 关闭分析工具窗口会自动回到启动器；关闭启动器窗口只是收起到托盘，要完全退出请用托盘菜单的“退出”；
- 分析工具运行期间，启动器里的入口会变灰，关闭当前分析工具后才能打开另一个；
- 上游的自动更新已被禁用（避免它用原版包覆盖统一安装目录），需要升级时从 Releases 下载新版直接覆盖安装。

## 数据位置与备份

数据保存在：

```text
%APPDATA%\hoyo-gacha-export\userData\genshin\
%APPDATA%\hoyo-gacha-export\userData\starrail\
```

即 `app.getPath('userData')/userData/<game>/`，里面有 `config.json`、`gacha-list-<uid>.json` 与 `log.txt`。

- 更新、重装、换安装目录都不会覆盖这里；
- 安装、卸载、升级前建议把整个 `%APPDATA%\hoyo-gacha-export\` 目录复制一份备份；
- 卸载程序默认不会删除这个目录，但仍建议卸载前先备份，需要彻底清理时手动删除。

## 从旧版迁移

**从统一版旧安装目录升级**：首次启动时会把 `<旧安装目录>\userData\<game>` 自动复制到 AppData 的新位置，只补齐缺失文件，不覆盖、不删除旧文件。如果新版装到了不同目录，也可以手动把旧目录的 `userData` 复制到上面的数据目录。

**从原版独立程序升级**：启动器底部有“导入原版数据”按钮。

1. 点击按钮，文件选择框默认定位到 `%LOCALAPPDATA%\Programs` 下的原版安装目录，也可以手动选；
2. 选中后选择这份数据属于原神还是星铁；
3. 程序会把 `config.json` 与 `gacha-list-*.json` 复制到对应分析工具的数据目录，只复制、不覆盖，同名文件会跳过；
4. 重新打开对应分析工具即可读到数据。

导入期间如果某个分析工具正在运行，这个按钮会禁用，先关掉它再导入。

## 常见问题

**点了“加载数据”没反应/报错？**
先在游戏里打开祈愿历史记录（或跃迁详情）页面，保持游戏运行，再点一次。工具需要从游戏日志里取 authKey。

**提示有新版本，但工具内更新用不了？**
统一版禁用了上游自更新。到 Releases 下载新版，直接覆盖安装即可，数据在 AppData 不受影响。

**换电脑怎么迁移？**
复制 `%APPDATA%\hoyo-gacha-export\` 整个目录到新电脑的同一位置。

**会同时开两个游戏吗？**
不会，同一时间只运行一个分析工具；关闭当前这个之后才能打开另一个。

**杀毒软件报警？**
安装包未签名，可能被误报。可对照 Releases 里的 `SHA256SUMS.txt` 校验文件；介意的话用 zip 便携包。

## 开发

```powershell
yarn install
yarn import-upstream   # 只在首次导入上游时执行，会创建 git 提交
yarn patch-vendor
yarn setup
yarn test
yarn build:games
yarn dev
```

- 推送 `v*` 标签会自动构建并发布；推 `main` 只跑语法检查与契约测试，不打包；
- 详细环境、构建、调试、打包与发布流程见 [docs/development.md](docs/development.md)；
- 版本规则见 [docs/versioning.md](docs/versioning.md)。

文档索引：

- [AGENTS.md](AGENTS.md)：AI 编码代理入口与项目铁律
- [docs/design.md](docs/design.md)：整体设计与决策记录
- [docs/architecture.md](docs/architecture.md)：模块、IPC、数据模型、导出流程
- [docs/upstream-sync.md](docs/upstream-sync.md)：上游同步与冲突处理
- [docs/tasks.md](docs/tasks.md)：任务看板与验收标准

目录：

```text
apps/desktop/    统一入口与启动器
scripts/         导入、同步、补丁、依赖、构建脚本
tests/           上游契约测试与主进程单测
docs/            设计与开发文档
vendor/          导入后存在：两个上游的只读副本
```

## 许可证

MIT。两个上游同样是 MIT，版权归各自作者所有，详见
`vendor/genshin/LICENSE`、`vendor/starrail/LICENSE`（导入后存在）。
