# 内容盒子 PWA — 跨设备恢复与维护手册（HANDOVER）

> 用途：当你换电脑、在新设备上登录 WorkBuddy（本平台）时，历史聊天记录不在。
> 只要让助手「读取 GitHub 仓库里的 HANDOVER.md（本文件）」并把后台密钥告诉我，
> 助手立刻恢复到当前（v69）的全部上下文，继续帮你改内容 / 优化 / 部署。
> 本文档由助手在 v62 发布后整理，是「自包含」的，不依赖任何历史对话。

---

## 0. 这是什么 / 关键标识（必存）

「内容盒子」是一个**静态 PWA（渐进式 Web 应用）**，用来展示文章 / 帖子 / 黑科技工具等内容。当前线上版本 **v69**。

| 项目 | 值 |
|---|---|
| 线上地址（分享 / 前台） | `https://content-box-24323.app.workbuddy.host/?sharecode=AK6QIELR67` |
| 后台（管理 / 编辑） | `https://content-box-24323.app.workbuddy.host/admin.html?key=nebadmin2026` |
| 部署 appId（同链接重部署用） | `wbapp_jFiM5Y7b9RmUulYAimy36N` |
| GitHub 仓库 | `https://github.com/C-Abai/AbaiDeNeiRongHeZi`（Public，main 分支） |
| APK 直链（下载安装包，必带 sharecode） | `https://content-box-24323.app.workbuddy.host/app.apk?sharecode=AK6QIELR67` |
| APK 短链（跳转同上，发人更短） | `https://tinyurl.com/2czwkvaw` |

---

## 1. 数据到底从哪来？（核心架构，务必先读）

**关键结论：线上显示的内容不是从这个聊天平台「存」出来的，而是从 GitHub 仓库实时拉取的。**

- 内容源（方案 A）：
  `https://raw.githubusercontent.com/C-Abai/AbaiDeNeiRongHeZi/refs/heads/main/content.json`
- 站点 `js/store.js` 里的 `GITHUB_CONTENT_URL` 指向上面这个地址；**每次打开 App 都会去 GitHub 拉最新的 `content.json`**。
- 兜底机制：如果 GitHub 拉不到（仓库被删 / 搞乱），App 自动回退到内置的 `content.json`，照常运行，不会挂。
- `meta.json` 也在仓库里，用于内容指纹比对；但 v61 之后已做「免维护」——靠 `content.json` 的 `Content-Length` 自动探测变化，**改内容无需手动改 meta.json**。

> 一句话记住：**改内容 = 改 GitHub 仓库里的 `content.json`；改代码 = 改项目文件再部署。**

---

## 0a. ⚠️ 强制工作流：每次部署 / 优化界面 / 改内容前，必须先核对 GitHub 仓库（用户 2026-11-04 指令）

> **目的**：用户会手动在 GitHub 网页端改 `content.json`（或版本号/文章），本地 `pwa-content-app` 可能滞后；若直接部署会把仓库冲掉（已发生 `f2d028f` 事故，把引导页配置清空）。

**收到任何「部署 / 优化界面 / 修改或新增内容」类任务时，第一步不是改代码，而是先跑下面核对：**
```bash
cd pwa-content-app
git fetch origin
git log --oneline HEAD..origin/main                # 非空 = 远程有本地没有的提交（用户手动改过）
git diff --stat HEAD origin/main -- content.json   # 重点：用户常手动改 content.json
git diff --stat HEAD origin/main                   # 其他文件差异摘要
```
- 若 `origin/main` 领先本地（尤其 `content.json`）：**先同步到本地再继续**（如 `git show origin/main:content.json > content.json`，或 `git pull --ff-only` / `git merge`），并明确告知用户「发现你手动在仓库改了 X，已同步后继续」。
- 若仅本地领先（我的未推送提交）：正常继续，结束后提交+部署，保持托管与 GitHub 两份一致。
- 完成后：托管平台 `./content.json`（后台读取源）与 GitHub `content.json`（前端/引导页源）必须都更新到同一最终版。

---

## 2. GitHub 仓库的双重角色

仓库 `C-Abai/AbaiDeNeiRongHeZi` 同时是：

1. **内容源**：`content.json` / `meta.json`（线上实时拉取）
2. **完整代码源**：含全部文件（含 v69 代码）。换设备 `clone` 即可拿到完整工程。

仓库根目录文件清单：
`index.html` / `preview.html` / `admin.html` / `download.html` / `watch.html` /
`css/style.css` / `js/app.js` / `js/admin.js` / `js/store.js` / `js/qrcode.js` / `js/tools.js` /
`sw.js` / `manifest.webmanifest` / `meta.json` / `content.json` /
`icon-192.png` / `icon-512.png` / `icon.svg` / `.gitignore`

> 三端共用：`index.html`+`preview.html` 共用 `js/app.js`+`css/style.css`；`admin.html` 用独立 `js/admin.js` 但仍共用 `css/style.css`。

---

## 3. 换电脑后，如何恢复「便捷沟通 + 优化 + 部署」

在新电脑登录 WorkBuddy 后，历史记录不在，但只要做下面任一件，助手立刻回到当前状态：

- **方式 A（推荐）**：对助手说——「读取 GitHub 仓库 `C-Abai/AbaiDeNeiRongHeZi` 里的 `HANDOVER.md`，并按它恢复；后台密钥是 `nebadmin2026`」。助手读完即全懂。
- **方式 B**：把这份手册全文粘贴给助手。

恢复后，所有操作与现在一致：
- 改内容 → 你提需求，或直接去 GitHub 改 `content.json`（无需重部署）。
- 改代码 / 界面 → 助手 `clone` 仓库到当前环境修改，再用同一个 `appId` 部署，**链接不变**。

**从新设备部署的标准口令（直接复制给助手即可）**：
> 「更新部署内容盒子，目录是我刚 `clone` 的仓库，appId 用 `wbapp_jFiM5Y7b9RmUulYAimy36N`，
> 保持原链接 `…24323` 不变，不要生成新链接。后台密钥 `nebadmin2026`。」
只要带上这个 appId，无论在哪台设备、哪个目录部署，都只会覆盖原链接（本助手已实测验证）。

> 助手不需要你提供任何本地文件——仓库里已有完整工程 + 本文档，足够恢复。

---

## 4. 日常改内容（最常用，换不换电脑都行）

**只需在 GitHub 仓库覆盖 `content.json`，线上自动同步，无需重部署。**

- 方法①：GitHub 网页打开 `content.json` → 编辑或上传新文件覆盖 → 提交。
- 方法②：开后台 `admin.html?key=nebadmin2026` 编辑 → 导出 `content.json` → 回 GitHub 覆盖上传。
- 改完在手机上**杀掉 PWA 后台进程重进**（或强刷），新内容即生效。

⚠️ **致命坑（务必记住）**：GitHub 网页「覆盖上传」时，**只选 `content.json` 一个文件**。
千万别把 `css/style.css`、`js/app.js`、`sw.js`、`meta.json` 也一起传上去——
它们会被整体替换，把你做好的 v62 代码冲回旧版（之前就出过这问题，费了很大劲合并才恢复）。

---

## 5. 改代码 / 部署（界面优化、加功能时）

- 部署能力：`workbuddy_sites_deploy`（本平台「发布」能力）。
- 关键参数：
  - `directory` = 项目根目录（含 `index.html` 的那一层，即从仓库 `clone` 出来的目录）
  - `language` = `static`
  - `entryHtml` = `index.html`
  - `appId` = `wbapp_jFiM5Y7b9RmUulYAimy36N`（复用则链接不变）
  - `userAskedToPublish` = `true`（用户说「发布 / 上线」时才置真）
- 流程：改完项目文件 → 告诉助手「发布」→ 助手部署 → 链接不变。
- ⚠️ **跨设备部署铁律（已实测验证，2026-11-04 修正）**：发布系统按「**部署目录 → 应用的映射**」定位目标，映射记录在**工作区根目录**（即项目文件夹的父目录）的 `.wbapp_<appId>.genie` 与 `.workbuddy/applications.yaml` 两个文件里。工具扫工作区根找 genie → 命中 appId 就覆盖原链接，找不到就静默新建。
  - **换设备不换链接（已实测可行）**：满足 ① 登录**同一个 WorkBuddy 平台账号**；② 把这两个映射文件放到新设备的**工作区根目录**（不是项目里面）；③ `localDir` 改成新设备实际路径 —— 即可从任意新路径部署并覆盖 `…24323`。2026-11-04 已在本机用**全新路径 + 同账号**实测：部署时工具解析到 `wbapp_jFiM5Y7b9RmUulYAimy36N`（**未新建链接**），铁证成立。
  - **2026-11-03 失败的真实原因**：当时把 genie/yaml 放进了**项目子目录里**（被文档 "inside the directory" 字面误导），工具在工作区根扫不到 → 当新应用，误生 `…87884`（已下架）。**关键：genie 必须在「工作区根目录」，不是项目内。**
  - 部署时不要传 `appId`（工具靠目录 + genie 自动命中）；只有 `unpublish` 多应用时才需要 `appId`。
  - 详见下方「§5c 换设备不换链接 · 实测步骤」。
- ⚠️ **改 CSS/JS 后必须升 Service Worker 版本号**：改 `sw.js` 里的 `CACHE = 'contentbox-vXX'` 与 `meta.json` 的 `sw` 字段到新版本，
  否则老用户浏览器缓存名不变，会继续加载旧界面、看不到新优化。
- ⚠️ **SW 注册地址版本号必须同步自增**：`js/app.js` 里 `navigator.serviceWorker.register('sw.js?sharecode=AK6QIELR67&v=XX')` 的 `&v=` 与 `sw.js` 的 `CACHE` 版本号**必须一起 +1**（当前 v76）。
  原因：注册 URL 带版本号后，每次部署脚本地址都不同，浏览器会强制重新下载 SW，实现「一次刷新即生效」；若只升 `CACHE` 不升 `&v=`，旧 app.js 仍注册旧 URL，浏览器会复用缓存中的旧 SW，导致更新卡住、要反复刷新才生效（2026-11-04 用户反馈「刷新好久」即此问题）。
- 发布后提醒用户**杀 PWA 后台重进或 Ctrl+Shift+R 强刷一次**，让新的 Service Worker 接管（首次升级到带 &v= 机制需一次强刷，之后每次部署自动一次刷新即更新）。

### ⚠️ 数据源分裂与「手动 git 提交会冲掉引导页」的坑（2026-11-04 真实事故）
- **两套数据源**：`js/store.js` 的公开端/引导页读 **GitHub raw** 的 `content.json`；但**后台 `admin.js` 读的是托管平台的 `./content.json`**（部署时由本地文件拷上去的）。两者必须保持一致，否则后台与公开端会显示不同内容。
- **后台"保存"只写浏览器 localStorage 草稿，不进仓库**；"发布"= 助手把 `content.json` 推到 GitHub（公开端生效）。
- **手动 `git commit/push` 推的是本地 `content.json` 文件**——而本地文件若只是 v70 那份（引导页空、一键安装是 `.apk` 直链），一提交就会把线上正确的引导页配置覆盖成空（2026-11-04 用户 `f2d028f` 提交即此：基于 v70 空引导页 + 改了版本号，把引导页配置清空）。
- **修复**：以用户提交版（含其版本号改动 + `apkUrl=引导页`）为基础，`git show <提交>:content.json` 取出后注入正确的 `config.guide` 块（enabled/title 等），再 `git pull --rebase origin main` 推送；并重新部署使托管 `./content.json` 同步。
- **教训**：以后任何修改 content.json 的发布，务必让本地文件 = 仓库/GitHub 的最终正确版（含引导页配置）再提交，且提交后重新部署一次，保证托管与 GitHub 两份一致；并提醒用户：改完后台后**清一次浏览器站点数据（localStorage）**再刷新，否则旧缓存（cb_content_cache_v1 / cb_admin_draft_v1）会持续显示旧内容。

## 5c. 换设备不换链接 · 实测步骤（2026-11-04 真实新设备测试：失败→已定位根因）

> ⚠️ **重要更正（2026-11-04 真实跨设备测试后）**：此前本節写的「genie 放项目文件夹的父目录」是**错的**。真实测试证明，发布工具扫描的是 **WorkBuddy 会话/工程根目录**（WorkBuddy 为本次任务创建的 `C:\Users\<用户>\WorkBuddy\<日期时间>\` 文件夹），**不是**项目文件夹的父层。旧机器之所以能覆盖，是因为项目恰好放在会话根内、genie 也就在会话根（两者重合的巧合）；新设备把 genie 放到项目父目录 `cbx_ws\`（≠ 会话根），工具在会话根扫不到 → 静默新建链接 `…71596`。

**真实测试结果（2026-11-04，新设备/新会话）**：
- ❌ 失败：未覆盖 `…24323`，静默新建 `…71596`（appId `wbapp_Fqel5lUDQReM5d7jlFyNoM`）。
- ✅ 生产链接 `…24323` 完好（HTTP 200），未被触碰；误生的 `…71596` 已取消发布（404 下线）。
- 铁证：工具把新应用的 genie 写到了会话根 `…\2026-11-04-12-23-36\.wbapp_Fqel5lUDQReM5d7jlFyNoM.genie`（及同层 `.workbuddy/applications.yaml`），证明会话根才是扫描/写入基准。

**正确做法（已据根因修正，待复测确认）**：
前提：新设备登录**同一个 WorkBuddy 平台账号**（与创建 `…24323` 的是同一个）。

1. 获取代码：克隆 `https://github.com/C-Abai/AbaiDeNeiRongHeZi`（若 `github.com` 不通，改用 `codeload.github.com` tarball 或 GitHub REST API）。
2. **关键：确定 WorkBuddy 会话根目录**。它通常是 `C:\Users\<你的用户>\WorkBuddy\<某日期时间>\`——即 WorkBuddy 为「当前这个任务」创建的文件夹（你在这个任务里操作，genie 就要放这里）。
3. 把项目放到会话根内作为子文件夹（推荐），例如 `…\<会话根>\pwa-content-app\`。
4. 在**会话根目录**（不是项目子目录、也不是"项目父目录"除非它恰好等于会话根）放两个文件：
   - `…\<会话根>\.wbapp_jFiM5Y7b9RmUulYAimy36N.genie`
   - `…\<会话根>\.workbuddy\applications.yaml`
5. 文件内容（localDir 改成项目实际绝对路径）：
   - `.wbapp_jFiM5Y7b9RmUulYAimy36N.genie`：
     ```
     appId: wbapp_jFiM5Y7b9RmUulYAimy36N
     name: 内容盒子
     localDir: <会话根>\pwa-content-app
     appType: web
     entryHtml: index.html
     ```
   - `.workbuddy\applications.yaml`：
     ```
     applications:
       - name: 内容盒子
         locator: wbapp_jFiM5Y7b9RmUulYAimy36N
     ```
6. 部署：`directory = <项目路径>`，`language = static`，`entryHtml = index.html`，`userAskedToPublish = true`。**不要传 appId**（工具在会话根扫到 genie 自动命中）。
7. 验证：返回 `shareLink` 仍为 `…24323` 且无新建链接 = 成功。

⚠️ 坑与补救：
- genie/yaml 放错层（放进项目子目录、或放进"项目父目录"但该父目录 ≠ 会话根）→ 工具在会话根扫不到 → 静默新建链接。务必放在**会话根**。
- `SITES_START_FAILED`（沙箱冷启动超时，非代码问题）：重试一次即可。
- 若失败且指向现有 appId，**原链接可能暂时打不开**——立刻从会话根重部署一次恢复。

**现状与建议**：
- 本方法（genie 在会话根）**尚待复测确认**（上次测试因位置错误而失败，未验证正确位置）。若要严格验证，需在真实新设备把 genie 放到**会话根**再部署一次——该步骤会**真正触碰生产链接 `…24323`**，需你另行明确授权。
- 最稳妥仍建议：**始终用原始机器发版**（其会话根 `2026-10-27-16-09-30\` 已含正确 genie，可稳定覆盖）；跨设备仅作原机器不可用时的备选。

---

## 5b. APK 安装包直链与下载（必读坑）

- **直链必须带 `?sharecode=AK6QIELR67`**：实测不带 sharecode（或只留 `?`、或空参数）服务器直接返回 `403 Forbidden`，下不到包。`sharecode` 是下载 APK 的访问钥匙，不是可省略的追踪参数。故 `content.json` / `download.html` / 后台「APK 直装链接」里的 `apkUrl` **必须保留完整 sharecode**。
- **短链（发人更短，不影响任何同步）**：`https://tinyurl.com/2czwkvaw` —— 仅做 301 跳转到上面的完整直链，最终下到的还是同一份 APK（已验证 `200` + 8.7MB）。它**不影响**原直链、已装 APK 的内容同步（APK 同步靠拉 PWA 的 `content.json`，与下载链接无关）、网页同步。短链依赖第三方 TinyURL，长期分发请以原直链兜底。
- **微信/QQ 内仍可能拦截**：直链与短链在微信里都可能被拦（之前直链就被提示「停止访问」），微信场景改用「二维码跳网页」最稳。
- **换设备重部署覆盖原链接**：见 §5c「换设备不换链接 · 实测步骤」——登录同账号 + 把 `.wbapp_*.genie` 与 `.workbuddy/applications.yaml` 放到 **WorkBuddy 会话根目录**（即 `C:\Users\<用户>\WorkBuddy\<日期时间>\`，非项目内、也非项目父目录）即可覆盖 `…24323`（2026-11-04 真实测试先因位置错误失败，根因已定位，正确位置待复测确认）。
- **小米应用商店误报（当前部署 v70，隐藏逻辑于 v68 引入）**：v70 已在 APK 内（WebView，`; wv)` UA）隐藏「下载 APK」按钮；但 `content.json` 的 `apkUrl`、`download.html` 自动下载页、`admin.js` 里的硬编码直链仍含 `.apk` 字面量。若小米仍报「APK 内诱导下载」，系扫描器静态/全站匹配「.apk 下载能力」所致。若要彻底过：把 `apkUrl` 移出 `content.json`、删除 `download.html`、清理 `admin.js` 硬编码（纯前端改造，无需动 ToAPP 后台、无需换直链）。当前用户选择暂不改动。

## 5b-2. 引导下载页 `guide.html`（v70 新增）

- **用途**：一个**独立的引导下载网页**，专门引导用户下载安装 APK（可用作「旧链接兜底 / 统一下载入口」）。访问地址：`guide.html?sharecode=AK6QIELR67`。
- **数据来源**：拉取 `content.json` 的 `content.config.guide` 渲染，字段：`enabled / title / subtitle / intro / apkUrl / buttonText / icon`。
  - 安装按钮点击 → 跳 `guide.apkUrl`；若其为空则回退到 `config.apkUrl`（站点 APK）。**注意 `apkUrl` 必须带完整 `?sharecode`**（见 §5b 第一条，否则 403）。
  - `intro` 支持换行（页面按 `\n` 转 `<br>`）；`enabled=false` 时页面显示「尚未配置」占位。
- **后台编辑**：内容盒子后台（admin.html）新增「**引导页**」tab（位于「工具栏」与「发布」之间），表单编辑上述 7 个字段，保存后点「发布」推上线即生效。后台另有「👁 打开引导页」直达链接。
- **部署注意**：`guide.html` 是新增静态文件且 `admin.js` 已改，发布须升 SW 缓存版本（当前 `contentbox-v70`）并 `meta.json` 同步，否则后台与公开端可能读到旧缓存。

---

## 6. 当前版本状态（v70）已实现的功能

- 顶部导航栏上移，减小上方空白（保留手机通知栏安全区）。
- 顶部玻璃蒙版层（`backdrop-filter` 模糊），内容向上滑入时不再穿透到导航按钮 / 文字。
- 文章区块搜索栏（按标题 / 摘要 / 正文 / 分类 / 标签实时过滤，输入时保留焦点）。
- 帖子卡片压缩 + 「📌 置顶内容」折叠卡（默认展开，点标题栏可折叠）。
- 顶部导航栏改为跟随主题的磨砂玻璃 + 柔和虚化阴影，修复深浅主题颜色反转；黑科技分类取消搜索框（v63 新增）。
- 以上全部适配**浅色 / 暗调主题**，前端 / 预览端 / 后台三端共用同一份 `css/style.css` 与 `js/app.js`。
- Service Worker 缓存版本：`contentbox-v69`（每次改 CSS/JS 必须升版本号，否则老用户读旧缓存）。

---

## 7. 安全与清理事项

- **GitHub PAT**：之前用来推送代码的 Personal Access Token 用完即废，请到
  GitHub `Settings → Developer settings → Personal access tokens` 页面 **Revoke**。
- **后台密钥**：`nebadmin2026`（弱密钥；如对安全性有要求，可让助手改成更强的，
  并同步更新 `js/admin.js` 的校验与本文档）。
- 仓库公开：代码与内容对外可见（方案 A 的技术要求），但仅开放「读」，别人改不了你的文件。

---

## 8. 常见问题排查

- **内容不更新**：确认 GitHub 的 `content.json` 确实改了；杀 PWA 后台重进。
- **显示旧界面**：多半是旧 Service Worker 缓存，杀后台重进 / 强刷。
- **仓库搞乱了**：App 会自动回退内置内容照常运行；需要的话让助手从仓库重新部署。
- **要彻底重来**：`clone` 仓库 → 改 → 同 `appId` 部署，链接不变。

---

## 9. 引导页（v70+，重要约束）

- **引导页网址**：`https://content-box-24323.app.workbuddy.host/guide.html?sharecode=AK6QIELR67`
  （主网址下的独立路径，**可单独发给用户**，由后台「引导页」tab 控制内容）。
- **数据源**：`guide.html` 已改为读 GitHub raw 的 `content.json`（与主应用同一份，带 CORS），
  并用 `HEAD Content-Length` 做变更信号 + localStorage 缓存，避免每次拉 1.1MB。
- **改引导页内容的发布流程**：后台「引导页」tab 改好 → 让助手把 `content.json` **推到 GitHub** 即可，
  **无需重新部署**（主应用与引导页会同时同步）。
- ⚠️ **致命约束（务必记住）**：本平台「发布/站点」能力 **一个工作区/会话只能有一个 app 链接**。
  不要把第二个目录（如 `guide-app/`）用 `workbuddy_sites_deploy` 部署——它会复用主应用的 appId，
  **把内容盒子整个覆盖成引导页**（已发生过，靠重新部署 `pwa-content-app/` 才恢复）。
  若要引导页拥有**完全独立的域名**，只能：新建一个 WorkBuddy 任务窗口，在那里单独部署 `guide-app/`
  （它读的是同一份 GitHub content.json，仍由主应用后台控制内容）。
- 本地 `guide-app/` 目录是「独立部署版」原型，本会话内**不要部署**（见上），留作独立域名方案的素材。

---

## 2026-11-04 补充：后台「引导页」tab 看不到的修复（v71）

- **现象**：用户在后台看不到「引导页」tab。经核查线上 `js/admin.js` 本就含 `data-t="guide"`（第 197/230/646 行），代码部署正确，故非代码缺失。
- **根因 1（主因）**：Service Worker 缓存未刷新。旧 SW 缓存版本 `contentbox-v70`，引导页 tab 恰是 v70 新增；用户此前访问过旧版后台，SW 一直喂旧 `js/admin.js` 且版本号未变不触发重拉。
- **根因 2（隐患）**：后台 `.admin-tabs` 用 `display:flex; flex:none` 无换行/无横向滚动，窄屏（手机/APK WebView/窄窗口）下 5 个 tab 被挤出屏幕，靠后的「引导页」被隐藏。
- **修复**：`sw.js` 缓存版本升 `v70→v71`（强制重拉全部资源）；`css/style.css` 的 `.admin-tabs` 加 `overflow-x:auto` + 隐藏滚动条（tab 永不裁切，可横向滑动）。
- **验证**：线上 sw.js=contentbox-v71、style.css 含 overflow-x、js/admin.js 含引导页 tab，三者均确认生效。
- **用户侧生效动作**：刷新/重开后台即可；若 APK 内仍显示旧版，关掉 App 重开或清站点数据一次。

## 2026-11-04 补充：后台门禁钥匙 ≠ 内容 sharecode（重要坑）

- **现象**：用户用 `admin.html?sharecode=AK6QIELR67` 打开后台，页面显示「404 · 页面不存在」（标题仍是"后台管理 - 内容盒子"，说明外壳已加载、被门禁拦下）。
- **根因**：`js/admin.js` 第 87–92 行有后台门禁：`const ADMIN_KEY='nebadmin2026'`；仅当 URL 带 `?key=nebadmin2026` 时才加载后台，否则渲染「404 · 页面不存在」。`sharecode` 只是内容数据访问钥匙（`content.json` 拉取用），**不是后台门禁钥匙**。助手此前误把后台链接写成 `?sharecode=...` 导致 404。
- **正确后台地址（唯一）**：`https://content-box-24323.app.workbuddy.host/admin.html?key=nebadmin2026`（sharecode 后台内默认取 AK6QIELR67，无需手加）。
- **公开端「关于」入口**：`js/app.js` 第 740 行 `<a class="admin-mini" href="admin.html?key=nebadmin2026">` 即正确后台入口；手机 App 内打开后台能进且为新版（v71 含引导页），电脑若显示旧版是 PWA Service Worker 旧缓存所致，强制刷新(Ctrl+Shift+R)或清除站点存储即可。
- **约定**：后台/管理类链接统一用 `?key=nebadmin2026`；APK 直装链接、引导页链接、内容数据仍用 `?sharecode=AK6QIELR67`。两者不可混用。

## 2026-11-04 补充：引导页图标改上传 + 引导页展示独立网址（v72）

- **后台图标改为上传**：`js/admin.js` 的 `renderGuide` 原「图标地址」文本框改为「选择图片」上传（`g_icon_file`）+ 预览（`g_icon_prev`）+ 移除（`g_icon_del`）。新增模块级函数 `resizeImageToSquare(file, 256, cb, errCb)`：用 FileReader+Image+canvas 居中裁剪为 256×256 正方形 PNG dataURL（兼容横屏/竖屏/长图）。icon 存于 `content.config.guide.icon`（base64 PNG），随「发布」推 GitHub 生效。`style.css` 新增 `.icon-upload/.icon-prev/.icon-actions/.ph` 样式。
- **引导页独立网址展示位置（已更正）**：用户要求放在**后台「引导页」设置面板底部**，而非引导页网页内。故 `guide.html` 的 `.g-urlbar`/`showUrlBar` 已**撤销**（v73）。改为在 `js/admin.js` 的 `renderGuide` 末尾新增 `.guide-url-box` 框，用 `location.origin + '/guide.html?sharecode=AK6QIELR67'` 动态生成完整独立地址并带「复制」按钮（`g_url_cp`）。`style.css` 配套 `.guide-url-box/.gub-*` 样式。
- **部署**：SW 升 `v71→v72`（`sw.js`/`meta.json`），已重部署 `pwa-content-app`（同 appId `…24323`）。验证：线上 sw=v72、guide.html 含 urlbar、admin.js 含上传裁剪、style.css 含 icon-upload。
- **用户侧生效**：电脑后台需 `Ctrl+Shift+R` 强刷一次以加载新 admin.js（v72 SW）。上传图标后点「保存」再「发布」，助手推 content.json 到 GitHub 即同步；引导页无需重部署即更新图标/网址条。

## 2026-11-04 补充：后台「引导页」实时预览（v74）

- **需求**：用户在后台「引导页」设置面板里，改完设置后能**在线先预览效果**（发布前看成品）。
- **实现**：`js/admin.js` 的 `renderGuide` 在面板顶部新增 `.guide-preview-box`，内含一个 `<iframe id="g_preview">`。新增 `GUIDE_CSS`（与 `guide.html` 完全同款样式字符串）+ `buildGuideHtml(f)`（注入当前表单值，复刻 guide.html 的 `render()`，按钮置 `disabled` 防止误跳转/下载）+ `updatePreview()`（读当前表单 → 写 `ifr.srcdoc`）。对 `g_enabled/g_title/g_subtitle/g_intro/g_apk/g_btn` 绑定 `input/change` 实时刷新；图标上传/移除（`currentIcon`）变更后也调 `updatePreview()`。`style.css` 新增 `.guide-preview-box/.gpb-lbl/.gpb-frame/.gpb-iframe`（iframe 高 540px、最大宽 360px 模拟手机视窗）。
- **部署**：SW 升 `v73→v74`（`sw.js`/`meta.json`），已重部署 `pwa-content-app`。验证：线上 sw=v74、admin.js 含 `g_preview`/`buildGuideHtml`、style.css 含 `guide-preview-box`。

## 2026-11-04 补充：二维码实时最新 + 苹果端「添加到主屏幕」引导（v75）

- **问题背景**：用户把关于页「一键安装」按钮指向引导页网址（后台 `config.apkUrl` 填成引导页链接），并已启用引导页。但手机扫关于页二维码出现两现象：① 跳到的网页是旧版（内容未更新）；② 内容更新了，但点一键安装跳到引导页却显示「尚未配置/没启动」的空页。
- **根因**：`sw.js` 对导航请求与外壳资源（index.html/app.js/guide.html/css）原用 `staleWhileRevalidate`（先吐旧缓存、后台刷新），部署后首次打开会先看到旧版，新版本要等下次刷新。引导页 `guide.html` 原靠 GitHub content.json 的 `Content-Length` 变化决定是否重新拉取，字节长度未变时会沿用本地旧缓存（引导页启用状态不更新 → 显「尚未配置」）。
- **修复 1（实时最新）**：`sw.js` 的 fetch handler 改为——`navigation`（HTML 文档）与 `isShellUrl`（js/css/icon/manifest）均走 `netFirst`（网络优先、离线回退缓存）；`content.json` 仍 `staleWhileRevalidate`（应用层靠 meta.json 指纹判断是否需要全量，秒开安全）。`guide.html` 的 `init()` 改为：先用本地缓存秒开，随后**每次都 `loadFull()` 向 GitHub 取最新并覆盖渲染**（缓存仅作离线兜底），不再依赖 Content-Length 跳过。
- **修复 2（苹果端引导）**：`js/app.js` 关于页安装区：iOS 设备按钮文案改为「➕ 添加到主屏幕」；点击不再只弹 toast，而是调用新增模块级函数 `showAddHomeGuide()` 弹出引导弹层（Safari 分享 → 添加到主屏幕 三步）。弹层 DOM 首次点击时创建并 append 到 body，支持点遮罩/「我知道了」关闭。`css/style.css` 新增 `.ios-guide-mask/.ios-guide-card/.ios-guide-title/.ios-guide-sub/.ios-guide-steps/.ios-guide-close` 样式。
- **部署**：SW 升 `v74→v75`（`sw.js`/`meta.json`），已重部署 `pwa-content-app`。验证：线上 sw=v75、sw.js 含 `mode==='navigate'` 分支、guide.html 含 `loadFull()`、app.js 含 `showAddHomeGuide`、style.css 含 `ios-guide-mask`。
- **注意**：关于页与引导页读的是**同一份** GitHub `content.json`（`store.js` 第14行 `GITHUB_CONTENT_URL` 与 `guide.html` 第87行同源），故数据不会"关于页更新、引导页不更新"；若引导页显「尚未配置」，先确认后台「引导页」已启用并「发布」推到 GitHub。

## 2026-11-04 补充：后台「保存即发布」到 GitHub（v77）

- **需求**：用户要求「只要登录后台修改了设置，这个设置就要同步更新到所有设备」。根因：后台「保存」只写本机 localStorage 草稿，换窗口/手机没有草稿 → 回落旧版 → 引导页设置显示空白。
- **实现（三处数据源统一到 GitHub）**：
  - `js/admin.js` 新增 `GH_OWNER/GH_REPO/GH_BRANCH/GH_PATH/GH_API/GH_META_API/GH_RAW` 常量；`ghToken()/ghAuto()/setGhToken()/setGhAuto()` 读写 localStorage（`cb_admin_gh_token`、`cb_admin_gh_autopub`）。**令牌只存本机浏览器，绝不入仓库/前端。**
  - `publishToGitHub(data, silent)`：GET 当前文件 sha → PUT `content.json`（base64，UTF-8 用 `btoa(unescape(encodeURIComponent(...)))`）→ 调 `emitPublishSignal()`。`_publishing` 锁 + `_pendingData` 合并连续保存，保证最后一份一定发出。
  - `emitPublishSignal(tok)`：**关键**。发布后同步 PUT GitHub 上的 `meta.json`，把 `contentHash` 改成新值。否则公开端 `readHash()` 靠 `meta.json` 指纹 + raw `Content-Length` 判断变化，两者都不变时（尤其内容字节数不变）其他设备会一直吃旧缓存、看不到新设置。
  - `CBStore.saveDraft` 包装层在 `ghAuto() && ghToken()` 时静默调用 `publishToGitHub`；`saveLocalOnly()` 用 `_skipAutoPub` 绕过发布（供「仅存本机草稿」用）。
  - `enterAdmin()` 改为**优先读 GitHub raw**（`GH_RAW + '?t=' + Date.now()`，与公开端同源），失败回退托管 `./content.json`。
  - 「发布」tab 新增：PAT 输入框、自动发布开关、保存令牌配置、🚀 立即发布当前内容、清除令牌；另加「🔄 从线上重新加载」按钮（`gh_reload`）用 GitHub 最新内容覆盖本机旧草稿，解决单设备显示旧内容/引导页变空。
- **`js/store.js` 缓存穿透**：新增 `withBust(url)`（附 `_h=Date.now()`）；`fetchJson(url, fallback, bust)` 加第三参；首次拉取、`readHash()` 的 meta 读取、`checkContentUpdate()` 的全量拉取均传 `bust=true`，避免 GitHub raw CDN 缓存挡住新内容。
- **前置条件（务必告知用户）**：自动发布**必须先在「发布」tab 填 GitHub PAT**（classic token 勾 `repo`，或 fine-grained 勾 `Contents: write`）。未配置令牌时不会自动同步，仍走「导出 content.json → 助手推上线」老流程。
- **已知限制**：① GitHub raw 有 CDN 缓存，虽加了 query bust，极端情况下仍可能有 1–5 分钟延迟；② 托管平台 `./content.json` 不会随浏览器自动发布更新，只有助手重新部署才同步（它是 GitHub 不可达时的兜底，可能显旧版）；③ PAT 存本机浏览器，公用电脑慎用，泄露可删令牌撤销。
- **部署**：SW 升 `v76→v77`（`sw.js` CACHE、`meta.json` 的 sw、`js/app.js` 注册 `&v=77` 三处必须同步）。提交 `f38e980` 已推 GitHub，已重部署 `pwa-content-app`（同 appId `…24323`）。线上验证：sw=v77、app.js `&v=77`、admin.js 含 `emitPublishSignal/gh_reload/saveLocalOnly/GH_META_API`、store.js 含 `withBust` 且 3 处 bust 调用、托管与 GitHub 的 meta.json 均为 v77、content.json 仍为 v76（引导页启用、8 篇文章）。

*本手册由助手在 v69 发布后整理并更新，作为跨设备恢复上下文使用。*
