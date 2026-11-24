# 架构说明

本文描述统一仓库的运行时结构、两个上游的模块职责、IPC 契约、数据模型与导出流程。改主进程、数据、导出相关代码前先读本文。

## 1. 系统边界

统一工具由三部分组成：

1. **统一入口**：`apps/desktop`，负责启动器、单实例、分析工具选择、环境变量注入。
2. **两个只读上游**：`vendor/genshin`、`vendor/starrail`，各自包含完整的 Electron 主进程与 Vue 渲染器。
3. **同步与验证设施**：`scripts/`、`tests/contracts/`、`.github/workflows/`。

统一入口不实现任何抽卡业务逻辑。数据获取、合并、导出、统计全部留在上游代码中。

## 2. 运行时拓扑

```text
启动器进程（常驻托盘）
└─ bootstrap.js
   ├─ 启动器窗口 + Tray
   ├─ LAUNCHER_STATUS
   ├─ LAUNCH_GAME
   ├─ OPEN_DATA_DIR
   ├─ IMPORT_PICK_DIR
   ├─ IMPORT_LEGACY_DATA
   ├─ UPDATE_STATUS / UPDATE_CHECK / UPDATE_DOWNLOAD / UPDATE_INSTALL
   ├─ OPEN_RELEASES
   ├─ QUIT_APP
   └─ spawn 分析工具子进程（--wish-game=<id>, WISH_LAUNCHER_CHILD=1）
      └─ require dist/electron/games/<game>/main/main.js
         ├─ 创建窗口
         ├─ 加载 dist/electron/games/<game>/renderer/index.html
         ├─ 注册该分析工具的 IPC
         └─ 读写 app.getPath('userData')/userData/<game>/
```

关键点：

- 启动器进程常驻托盘，分析工具作为独立子进程运行。
- 一个分析工具子进程只加载一个分析工具模块。
- 关闭分析工具窗口后子进程退出，启动器重新显示并恢复入口。
- 关闭启动器窗口只隐藏到托盘；托盘菜单“退出”才结束程序。
- 分析工具窗口的渲染器仍然使用上游原版 Vue 应用。
- 统一更新器只在启动器进程里运行；下载与备份都在 `app.getPath('userData')/updates/`，不写安装目录。

## 3. 上游文件职责

### 3.1 原神 `vendor/genshin/src`

| 文件 | 职责 |
| --- | --- |
| `main/main.js` | 创建窗口、单实例、退出时关闭代理、检查更新状态 |
| `main/getData.js` | 检测日志与缓存、提取 `authkey`、分页拉取、合并、保存、代理模式 |
| `main/gachaTypeMap.js` | 读取 `gachaType.json`，按语言输出卡池类型 Map |
| `gachaType.json` | 原神卡池类型多语言数据（键：`100/200/301/302/400/500`） |
| `main/UIGFJson.js` | UIGF v3.0 / v4.1 导出，UIGF v3.0 / v4.0 / v4.1 导入 |
| `main/excel.js` | Excel 导出，按卡池类型分 Sheet |
| `main/gists.js` | 导出 UIGF JSON 到 GitHub Gist |
| `main/config.js` | 配置读写，`urls` 使用 AES 加密 |
| `main/i18n.js` | 加载 13 种语言，按点号路径展开 |
| `main/utils.js` | 路径、窗口、JSON 读写、hash、AES、日志、本地 IP |
| `main/module/*` | mitmproxy、系统代理、zip 解压、exceljs |
| `main/update/index.js` | 上游自更新（统一版已禁用） |
| `renderer/App.vue` | 主界面：加载数据、统计、五星历史、详情、导入导出入口 |
| `renderer/components/Setting.vue` | 设置：语言、日志类型、代理、UIGF、Gist、JSON 可读化 |
| `renderer/components/GachaDetail.vue` | 抽卡明细表 |
| `renderer/components/PieChart.vue` | 星级/类型饼图 |
| `renderer/gachaDetail.js` | 详情表列定义与计算 |
| `renderer/utils.js` | 渲染器工具函数 |
| `renderer/main.js` | 挂载 Vue 应用 |

### 3.2 星铁 `vendor/starrail/src`

| 文件 | 职责 |
| --- | --- |
| `main/main.js` | 创建窗口、单实例、退出时关闭代理、检查更新状态 |
| `main/getData.js` | 检测日志与缓存、提取 `authkey`、分页拉取、合并、保存、代理模式 |
| `main/bridge.js` | `COPY_URL`、`DELETE_DATA` 两个 IPC |
| `gachaType.json` | 星铁卡池类型多语言数据（键：`1/2/11/12/21/22`） |
| `idJson.json` | 物品 ID → 名称/类型/星级，随游戏版本更新；含 5 个语言与 `version` 字段 |
| `main/UIGFJson.js` | UIGF v4.1 导出，UIGF v4.0/v4.1 与 SRGF 导入 |
| `main/excel.js` | Excel 导出，含 `rawData` 与按类型 Sheet |
| `main/config.js` | 配置读写，`urls` 使用 AES 加密 |
| `main/i18n.js` | 与原文一致的多语言加载器 |
| `main/utils.js` | 与原文基本一致的路径、窗口、JSON、hash、AES、日志 |
| `main/utils/mergeData.js` | 按 `id` 去重并排序的合并逻辑，带 Jest 测试 |
| `main/module/*` | 与原文一致的 mitmproxy、系统代理、zip、exceljs |
| `main/update/index.js` | 上游自更新（统一版已禁用） |
| `renderer/App.vue` | 主界面：加载数据、统计、五星历史、UIGF 导入导出 |
| `renderer/components/Setting.vue` | 设置：语言、日志类型、代理、删除数据 |
| `renderer/components/GachaDetail.vue` | 抽卡明细表 |
| `renderer/components/PieChart.vue` | 星级/类型饼图 |
| `renderer/gachaDetail.js` | 详情表列定义与计算 |

## 4. IPC 通道契约

两个上游的通道重叠严重，这是必须一次只运行一个分析工具的直接原因。

| 通道 | 原神 | 星铁 | 注册文件（原神 / 星铁） | 说明 |
| --- | --- | --- | --- | --- |
| `FETCH_DATA` | 有 | 有 | `getData.js` / `getData.js` | 加载/更新抽卡数据，支持 `'proxy'` |
| `READ_DATA` | 有 | 有 | `getData.js` / `getData.js` | 读取本地缓存数据 |
| `FORCE_READ_DATA` | 有 | 无 | `getData.js` / - | 强制重新读取本地文件 |
| `CHANGE_UID` | 有 | 有 | `getData.js` / `getData.js` | 切换当前账号 |
| `GET_CONFIG` | 有 | 有 | `getData.js` / `getData.js` | 读取配置 |
| `LANG_MAP` | 有 | 有 | `getData.js` / `getData.js` | 语言映射 |
| `SAVE_CONFIG` | 有 | 有 | `getData.js` / `getData.js` | 保存单个配置项 |
| `DISABLE_PROXY` | 有 | 有 | `getData.js` / `getData.js` | 关闭系统代理 |
| `I18N_DATA` | 有 | 有 | `getData.js` / `getData.js` | 读取 i18n 文案 |
| `OPEN_CACHE_FOLDER` | 有 | 有 | `getData.js` / `getData.js` | 打开网页缓存目录 |
| `COPY_URL` | 有 | 有 | `getData.js` / `bridge.js` | 复制抽卡记录 URL |
| `SAVE_EXCEL` | 有 | 有 | `excel.js` / `excel.js` | 导出 Excel |
| `EXPORT_UIGF_JSON` | 有 | 有 | `UIGFJson.js` / `UIGFJson.js` | 导出 UIGF |
| `IMPORT_UIGF_JSON` | 有 | 有 | `UIGFJson.js` / `UIGFJson.js` | 导入 UIGF/SRGF |
| `RELAUNCH` | 有 | 有 | `main.js` / `main.js` | 重启应用 |
| `EXPORT_UIGF_JSON_GISTS` | 有 | 无 | `gists.js` / - | 上传到 GitHub Gist |
| `DELETE_DATA` | 无 | 有 | - / `bridge.js` | 删除某账号数据 |

主进程 → 渲染器的事件：

| 事件 | 说明 |
| --- | --- |
| `LOAD_DATA_STATUS` | 加载进度、重试提示 |
| `ERROR` | 通用错误 |
| `UPDATE_HINT` | 更新相关提示 |
| `AUTHKEY_TIMEOUT` | `authkey` 失效提示 |
| `NEW_VERSION` | 发现新版本（统一版已禁用上游更新，事件不再触发） |

修改任何通道时，必须同步更新：

1. 本文的通道表。
2. `tests/contracts/expected-channels.json`。
3. 对应上游的 `renderer` 调用（如果上游新增）。

### 4.1 统一层 IPC（启动器）

启动器自己的通道与上游无关，由 `apps/desktop/src/main/bootstrap.js` 注册：

| 通道 | 方向 | 说明 |
| --- | --- | --- |
| `LAUNCHER_STATUS` | 启动器渲染器 → 主进程 | 返回 `{version, dataDir, runningGame, games:[{id,name,subtitle,built}]}` |
| `LAUNCH_GAME` | 启动器渲染器 → 主进程 | 启动指定分析工具子进程；已运行、未构建或参数非法时返回 `{ok:false,message}` |
| `OPEN_DATA_DIR` | 启动器渲染器 → 主进程 | 打开数据根目录 |
| `IMPORT_PICK_DIR` | 启动器渲染器 → 主进程 | 弹出目录选择框，返回 `{canceled, dir, count}` |
| `IMPORT_LEGACY_DATA` | 启动器渲染器 → 主进程 | 参数 `{dir, game}`，复制原版数据，返回 `{ok, copied, skipped, targetDir}` 或 `{ok:false, message}` |
| `UPDATE_STATUS` | 启动器渲染器 → 主进程 | 返回当前更新状态 `{status, version, progress, message}` |
| `UPDATE_CHECK` | 启动器渲染器 → 主进程 | 检查 GitHub 最新 Release，返回最新状态；开发态返回 `disabled` |
| `UPDATE_DOWNLOAD` | 启动器渲染器 → 主进程 | 下载安装包到 `updates/` 并用 `SHA256SUMS.txt` 校验，返回最新状态 |
| `UPDATE_INSTALL` | 启动器渲染器 → 主进程 | 备份 `userData/`、写入等待脚本并退出，由 NSIS 静默安装；返回 `{ok, backup}` 或 `{ok:false, message}` |
| `OPEN_RELEASES` | 启动器渲染器 → 主进程 | 用系统浏览器打开发布页（更新失败时的兜底） |
| `QUIT_APP` | 启动器渲染器 → 主进程 | 结束分析工具子进程并退出程序 |

主进程 → 启动器渲染器的事件：`LAUNCHER_STATUS_CHANGED`（运行状态变化后推送完整 status）、`UPDATE_STATE_CHANGED`（检查/下载/安装状态变化后推送）。

启动器只通过 `apps/desktop/src/launcher/preload.js` 暴露的 `window.launcher` 调用这些通道；窗口开启 `contextIsolation` 与 `sandbox`，CSP 为 `default-src 'self'`。

## 5. 数据模型

### 5.1 本地文件

每个账号一个文件：`app.getPath('userData')/userData/<game>/gacha-list-<uid>.json`。开发态数据根目录是仓库根目录。

原神：

```json
{
  "result": {
    "301": [
      ["2026-01-01 12:00:00", "角色名", "角色", 5, "301", "1700000000000000000"]
    ],
    "302": []
  },
  "typeMap": [
    ["301", "角色活动祈愿"],
    ["302", "武器活动祈愿"],
    ["500", "集录祈愿"],
    ["200", "常驻祈愿"],
    ["100", "新手祈愿"]
  ],
  "time": 1767225600000,
  "uid": "100000000",
  "lang": "zh-cn"
}
```

每条记录是 6 元组：

```text
[time, name, item_type, rank_type(number), gacha_type, id]
```

星铁：

```json
{
  "result": {
    "11": [
      {
        "id": "1700000000000000000",
        "item_id": "1401",
        "item_type": "角色",
        "name": "角色名",
        "rank_type": "5",
        "time": "2026-01-01 12:00:00",
        "gacha_id": "2001",
        "gacha_type": "11",
        "count": "1"
      }
    ]
  },
  "typeMap": [
    ["11", "角色活动跃迁"],
    ["12", "光锥活动跃迁"],
    ["1", "常驻跃迁"],
    ["2", "新手跃迁"]
  ],
  "time": 1767225600000,
  "uid": "100000000",
  "lang": "zh-cn",
  "region": "prod_official_asia",
  "region_time_zone": 8
}
```

**两个分析工具的记录结构不同，不要合并数据结构。** 原神是数组元组，星铁是对象；星铁还多 `region`、`region_time_zone`、`gacha_id`、`count`。

### 5.2 配置

原神 `config.json` 字段：

```text
urls, logType, lang, current, proxyPort, proxyMode,
autoUpdate, fetchFullHistory, hideNovice,
gistsToken, gistsId, readableJSON
```

星铁 `config.json` 字段：

```text
urls, logType, lang, current, proxyPort, proxyMode,
autoUpdate, fetchFullHistory, hideNovice
```

`urls` 在落盘前使用 AES-192-CBC 加密，密钥由 `app.getPath('userData')` 经 scrypt（盐 `hk4e`）派生。这意味着：

- 不要随意修改应用名称，否则旧配置里的 URL 无法解密。
- 统一版没有修改 `app.setName`，保持默认应用名。
- 账号 URL 会过期，丢失可重新从日志/缓存获取。

### 5.3 原版独立程序数据导入

原版两个独立程序把数据写在各自安装目录的 `userData/` 下（没有按分析工具划分的子目录），文件名同样是 `config.json` 与 `gacha-list-<uid>.json`。统一版在启动器提供手动导入（T3.2）：

1. `IMPORT_PICK_DIR` 打开目录选择框，默认值由 `findLegacyDataDirHint()` 探测 `%LOCALAPPDATA%\Programs` 下与原版产品名相关的目录；
2. `resolveLegacyDataDir()` 依次尝试所选目录本身与 `<所选目录>/userData/`，返回第一个含数据文件的目录；
3. 用户选择游戏归属后，`IMPORT_LEGACY_DATA` 只复制顶层 `config.json` 与 `gacha-list-<uid>.json` 到 `app.getPath('userData')/userData/<game>/`，同名文件跳过，不覆盖、不移动、不删除原文件；
4. 分析工具运行中拒绝导入，避免与上游同时读写同一目录。

实现：`apps/desktop/src/main/import-legacy-data.js`；单测：`tests/unit/import-legacy-data.test.js`。

### 5.4 统一更新流程

```text
启动器启动（打包态）
        │  1.2s 后静默检查 / 用户点“检查更新”
        ▼
GET api.github.com/repos/yyc001207/wish-export/releases/latest
        │  解析 tag_name 与资产（exe / zip / SHA256SUMS.txt）
        ▼
compareVersions(tag, app.getVersion()) > 0 ?
        │ 否 → 状态 none（已是最新版本）
        ▼ 是
状态 available → 用户点“下载并安装”
        │
        ▼
GET Wish-Export-<version>-x64.exe → %APPDATA%\hoyo-gacha-export\updates\<file>.part
        │  按 content-length 报进度
        ▼
GET SHA256SUMS.txt → 校验 .part
        │ 失败 → 删除 .part，状态 error，安装目录不变
        ▼ 成功 → 重命名为正式文件，状态 ready
        │
        ▼ 用户点“立即安装并重启”
copy %APPDATA%\hoyo-gacha-export\userData → updates\userData-backup-<旧版本>\
写 updates\install-update.cmd：
  @echo off
  timeout /t 2 /nobreak >nul
  start "" "<安装包.exe>" /S --force-run
        │
        ▼
启动器退出 → cmd 等待 2 秒后运行 NSIS → 覆盖安装目录 → --force-run 启动新版本
```

要点：

- 更新器不修改安装目录，替换动作全部交给 NSIS；下载失败、校验失败、启动器退出前取消都不会动现有安装。
- `--force-run` 让静默安装在结束后启动新版本；启动的是新 exe，因此不经过上游 `RELAUNCH`。
- 无法访问 GitHub 时，状态为 `error` 并显示“打开发布页”，用户手动下载覆盖安装，数据目录不受影响。
- `updates/` 下的安装包与 `userData-backup-*` 保留，便于失败后重试；用户可手动清理。

实现：`apps/desktop/src/main/updater.js`（网络、版本比较、校验）与 `apps/desktop/src/main/bootstrap.js`（状态机、备份、安装脚本）；单测：`tests/unit/updater.test.js`。

## 6. 数据获取流程

```text
游戏日志 / 网页缓存 / 手动 URL / 代理抓包
                │
                ▼
        提取 authkey 与查询参数
                │
                ▼
        请求抽卡记录 API（分页）
                │
                ▼
        按卡池类型收集 → 按 id 合并
                │
                ▼
        app.getPath('userData')/userData/<game>/gacha-list-<uid>.json
                │
                ▼
        渲染器统计 / Excel / UIGF / SRGF
```

### 6.1 authkey 来源

原神：

- `%USERPROFILE%/AppData/LocalLow/miHoYo/GenshinImpact/output_log.txt`
- `%USERPROFILE%/AppData/LocalLow/miHoYo/YuanShen/output_log.txt`
- 云游戏日志：`AppData/Local/miHoYo/GenshinImpactCloudGame/config/logs/MiHoYoSDK.log`
- 游戏 WebCache 的 `data_2`
- 手动粘贴 URL
- 代理模式拦截 `webstatic*.mihoyo.com` / `webstatic*.hoyoverse.com`

星铁：

- `detectGameLocale(userPath)` 返回的日志路径
- `StarRail_Data` 对应的 WebCache `data_2`
- 手动粘贴 URL
- 代理模式拦截 `webstatic*` 与 `hkrpg` 相关域名

### 6.2 API 域名

| 游戏 | 国服 | 国际服 |
| --- | --- | --- |
| 原神 | `https://public-operation-hk4e.mihoyo.com` | `https://public-operation-hk4e-sg.hoyoverse.com` |
| 星铁 | `https://public-operation-hkrpg.mihoyo.com` | `https://public-operation-hkrpg-sg.hoyoverse.com` |

原神接口：

```text
/gacha_info/api/getGachaLog
/gacha_info/api/getConfigList
```

星铁接口：

```text
/common/hkrpg_gacha_record/api/getGachaLog
/common/hkrpg_gacha_record/api/getLdGachaLog   # 卡池键 21/22
```

### 6.3 合并语义

原神 `mergeList`：

- 比较前 4 个字段（时间、名称、类型、星级）拼接的字符串；
- 处理分页重叠与本地/远端数据拼接。

星铁 `mergeList`：

- 以 `id` 去重；
- 使用 `BigInt` 比较 `id` 排序；
- 有独立 Jest 测试。

两套合并语义不同，统一层不得介入。

## 7. 导出流程

| 能力 | 原神 | 星铁 |
| --- | --- | --- |
| Excel | 按卡池类型分 Sheet，列为 `time/name/type/rank/total/pity/remark` | `rawData` + 按类型分 Sheet |
| UIGF 导出 | v3.0 / v4.1 | v4.1（`hkrpg` 字段） |
| UIGF 导入 | v3.0 / v4.0 / v4.1 | v4.0 / v4.1 |
| SRGF 导入 | 不支持 | 支持 |
| Gist 上传 | 支持 | 不支持 |

导出逻辑全部位于各自 `main/UIGFJson.js`、`main/excel.js`，统一入口不参与。

## 8. 游戏差异对照

| 维度 | 原神 | 星铁 |
| --- | --- | --- |
| 上游版本 | 0.12.1 | 0.3.2 |
| 卡池键 | `100/200/301/302/400/500` | `1/2/11/12/21/22` |
| 记录结构 | 6 元组数组 | 9 字段对象 |
| 时区 | 未单独存储 | `region_time_zone` |
| 导入格式 | UIGF | UIGF + SRGF |
| 特有模块 | `gists.js`、`gachaTypeMap.js`、`web` 构建 | `idJson.json`、`bridge.js`、`mergeData.js` |
| element-plus | 1.3.0-beta.7 | 2.3.7 |
| 更新地址 | `genshin-gacha-export.danmu9.com` | `star-rail-warp-export.css.moe` |
| 上游活跃度 | 低（2026-03 最后提交） | 高（2026-11 仍在更新 idJson） |

## 9. 统一层与 vendor 的接口

统一层只通过 6 个环境变量与 vendor 交互：

| 变量 | 设置方 | 用途 |
| --- | --- | --- |
| `WISH_GAME` | `bootstrap.js` | 当前分析工具 id，决定数据子目录 |
| `WISH_APP_ROOT` | `bootstrap.js` | 数据根目录（开发态是仓库根目录，打包后是 `app.getPath('userData')`），vendor 用它定位 `userData/` |
| `WISH_RENDERER` | `bootstrap.js` | 当前分析工具渲染器 `index.html` 的绝对路径 |
| `WISH_UPDATE_DISABLED` | `bootstrap.js` | 固定为 `1`，禁用上游自更新 |
| `WISH_LAUNCHER_CHILD` | 启动器 spawn 子进程时 | 固定为 `1`，让 game 主进程跳过单实例锁 |
| `WISH_DEV_SERVER_URL` | 可选 | 单个分析工具热更新时加载 Vite dev server |

除此之外，统一层不调用 vendor 的内部函数。

## 10. 构建产物

```text
dist/electron/
├─ games/
│  ├─ genshin/
│  │  ├─ main/main.js
│  │  └─ renderer/index.html + assets
│  └─ starrail/
│     ├─ main/main.js
│     └─ renderer/index.html + assets
```

- `main/main.js` 是 Rollup 打包后的 CommonJS，依赖已内联。
- `renderer/index.html` 与 assets 是 Vite 产物，`base: './'`。
- 运行时不需要 `vendor/` 与 `node_modules/`。
- `electron-builder.yml` 只打包 `dist/electron/games/**`、`apps/desktop/**`、`package.json`。

## 11. 术语

| 术语 | 含义 |
| --- | --- |
| 分析工具 | `vendor/` 里原神或星铁各自的可运行程序（主进程 + 渲染器）。文档中“运行 / 启动 / 关闭 / 窗口 / 子进程 / 构建”的对象一律称分析工具，不称游戏；只有游戏日志、游戏版本、游戏接口、数据归属等指游戏本身的表述保留“游戏” |
| vendor | 从上游导入的只读代码副本 |
| 统一入口 | `apps/desktop`，负责启动器与分析工具启动 |
| 启动器 | 选择分析工具的窗口，不加载任何抽卡业务模块 |
| 契约测试 | 校验上游 IPC、数据格式、补丁标记的测试 |
| 补丁 | `apply-vendor-patches.js` 产生的、带标记的最小改动 |
| 数据根目录 | 打包后为 `app.getPath('userData')`，不是安装目录；更新/重装不会覆盖 |
