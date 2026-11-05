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
| 后台（管理 / 编辑，必须双参数） | `https://content-box-24323.app.workbuddy.host/admin.html?sharecode=AK6QIELR67&key=nebadmin2026` |
| 部署 appId（同链接重部署用） | `wbapp_jFiM5Y7b9RmUulYAimy36N` |
| GitHub 仓库 | `https://github.com/C-Abai/AbaiDeNeiRongHeZi`（Public，main 分支） |
| APK 直链（下载安装包，必带 sharecode） | `https://content-box-24323.app.workbuddy.host/app.apk?sharecode=AK6QIELR67` |
| APK 短链（跳转同上，发人更短） | `https://tinyurl.com/2czwkvaw` |

---

## 1. 数据到底从哪来？（核心架构，务必先读）

**关键结论（v85 起）：首屏用「当前链接托管的 `./content.json`」秒开，同时每次启动后台无条件校验一次 GitHub 全量内容，谁新用谁。**

- 站点 `js/store.js`：`CONTENT_URL = './content.json?sharecode=...'`（同域），每次启动必拉一次，
  带 6s 超时；拿到即写缓存并 `onUpdate` 重绘。
- `crossCheckGithub()`（v85 重写）：**不再读 `meta.json` 指纹**，每次启动都向 GitHub raw 取一次
  全量 `content.json`（固定 URL + `cache:'no-cache'` 条件请求，内容未变时 304、几乎不耗流量；
  **v86 起超时 45s** 且覆盖到 body 读完，失败时静默重试一次），内容确有变化才写缓存 + 重绘。
  - 全程 **fire-and-forget**，不出现在首屏 / 登录的 await 链路上；GitHub 不可达时静默忽略。
  - 来源优先级：GitHub 新内容一旦生效，忽略随后到达的托管旧快照，避免被旧部署快照冲回去。
- `guide.html` 引导页也加了同一条后台校验（v85），所以 `apkUrl` / 引导文案同样能靠覆盖仓库更新。
- 首次访问无缓存：同域（8s）→ GitHub raw（2.5s）→ 内置种子内容，故断网也能开。
- ⚠️ 托管平台**所有静态资源必须带 `sharecode` 门禁参数**，否则返回「链接不完整」HTML/403；
  `store.js` 的 `gate()` 会自动补。`content.json` / `meta.json` / `guide.html` 由 SW 完全放行、不缓存。
- ✅ **只把 `content.json` 覆盖到 GitHub 仓库就能同步公开端，不用改 `meta.json`、不用重新部署。**
  `meta.json` 的 `contentHash` 现在只是后台发布时写的兼容字段（旧版客户端仍读它），已不参与判定。
- 托管平台的 `./content.json` **不会**随 GitHub 发布而变，只有助手重新部署才更新；
  v85 起 GitHub 版更新后会在客户端覆盖它，故两边长期不一致也不影响同步。
- 🚀 **【v87 图片外置 / 性能根治】`content.json` 已从 1.28MB 瘦到约 20KB**：
  原文件 98.5% 是 18 处内嵌 base64 图片（17 张唯一图，964KB 二进制），改文字却要重下整包图片，
  这才是「覆盖仓库后要等十几秒」的真正原因。现在图片解码后以内容哈希命名存入 `assets/img-<sha12>.<ext>`，
  `content.json` 里对应字段直接写成**可作为 `src` 用的相对路径**
  `assets/img-xxxx.jpg?sharecode=AK6QIELR67`（带门禁参数，托管平台可直接返回图片）。
  - **零渲染代码改动**：公开端 `<img src>`、`store.js` 的 `applyTheme()` CSS `url()`、
    `notice.js` 弹窗图标、后台封面预览、引导页图标都是直接拿字段值当 URL，相对路径天然可用。
  - **画质完全不变**（原图二进制原样落盘），用户工作流也不变：后台加载到的就是路径字符串，
    改完文字导出 → 仍是 ~20KB 的单个 `content.json` → 覆盖仓库即可。
  - **混合模式兼容新图**：以后在后台新上传的图片仍是 `data:image/...;base64`（一张约 120KB），
    与外置路径共存，无需额外操作；只有老图被外置。
  - `assets/` 必须随项目一起部署（进 GitHub 仓库）；图片走 SW 的 `cacheFirst`，首次访问后离线可用。
  - ⚠️ 切新链接时，除 §5d 清单外还要把 `content.json` 里 18 处 `?sharecode=AK6QIELR67` 全局换成新 sharecode。
- ⏱ **性能对照（2026-11-05 实测）**：瘦身前 raw 全量 1.28MB = 无压缩 24.6s / gzip 11s，
  同域 2.6s，且 raw CDN 有 `Cache-Control: max-age=300`（最多 5 分钟旧副本），
  所以旧版常要等 10–25 秒甚至超时失败。瘦身后全量仅 ~20KB，跨境往返毫秒级，
  304 条件请求 0.4s；刷新 / 同步 / 引导页都不再受大文件拖累，首屏仍是 localStorage 缓存 1ms 绘制。
  **但若托管端 `./content.json` 还是旧的大文件，每次启动仍要下那 1.28MB**，
  故本次改动仍需重新部署一次，把 20KB 版 + `assets/` 一起写进托管快照。

> 一句话记住：**改内容 = 把 `content.json` 覆盖到 GitHub（单个文件即可）；改代码 / 界面 = 改项目文件再部署。**
> （v79~v84 曾要求「同时改 `meta.json.contentHash` 指纹」，v85 已取消该门槛；
> 更早的 v61 版「GitHub raw 为权威、首屏硬等 1.28MB」也别照搬——首屏现在零等待。）

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

**从新设备部署的标准口令（2026-11-05 最终定稿，直接复制给助手即可）**：
> 「更新部署内容盒子，目录是我刚 `clone` 的仓库。先确认登录的是**同一个 WorkBuddy 平台账号**；
> 把 `.wbapp_jFiM5Y7b9RmUulYAimy36N.genie` 和 `.workbuddy/applications.yaml`
> 放到**本次任务的会话根目录**（`C:\Users\<用户>\WorkBuddy\<日期时间>\`，与项目文件夹同级，**不是项目里面**），
> `localDir` 改成新设备项目的实际绝对路径；部署时**不要传 appId**，
> `language=static`、`entryHtml=index.html`、`userAskedToPublish=true`；
> 保持原链接 `…24323` 不变，不要生成新链接。后台密钥 `nebadmin2026`。」

⚠️ **不要再用早期版本「显式传 appId 就行」的说法**（11-03 的结论已被 11-04 真实新设备测试推翻）。
发布系统按「部署目录 → 应用」的映射定位目标，映射只认**会话根目录**下的 genie 文件；
扫到同 appId 就覆盖原链接，扫不到就静默新建。详见 §5、§5c。

> 助手不需要你提供任何本地文件——仓库里已有完整工程 + 本文档，足够恢复。

---

## 4. 日常改内容（最常用，换不换电脑都行）

**把 `content.json` 覆盖到 GitHub 仓库即可同步公开端，无需重部署、无需改 `meta.json`。**

- 方法①（最常用）：GitHub 网页打开 `content.json` → 上传/编辑覆盖 → 提交，**只选这一个文件**。
- 方法②：开后台（双参数地址见 §0）编辑 → 「发布」tab 配置 PAT 后自动发布；
  未配 PAT 则导出 `content.json` 手动覆盖到仓库，或让助手推上线。
- 原理（v85）：公开端与引导页每次启动都在后台向 GitHub raw 取一次全量内容，与本地缓存比对，
  不同就写缓存 + 重绘；`meta.json` 指纹**不再参与判定**。首屏仍由同域 / 本地缓存秒开，
  GitHub 拉得慢也不会白屏。
- 生效时机：文件推上去后，访客**下次打开 App** 开始校验；跨境慢时可能要等几秒才自动刷新，
  没等到就**再重开一次**即新内容（已写入 localStorage 缓存）。
- ⚠️ 只推 GitHub、不重部署时，托管平台的 `./content.json` 仍是旧版。要给**所有**访客强推公告
  （如迁移通知），最稳仍是重新部署一次对应 appId（见 §5d），把公告版写进托管快照。

⚠️ **致命坑（务必记住）**：GitHub 网页「覆盖上传」时，**只选 `content.json` 一个文件**。
千万别把 `css/style.css`、`js/app.js`、`sw.js`、`meta.json` 也一起传上去——
它们会被整体替换，把你做好的 v62 代码冲回旧版（之前就出过这问题，费了很大劲合并才恢复）。

---

## 4b. 图片外置工具（改图后把 content.json 瘦回 20KB）

**在后台改图片会让 `content.json` 变大，但不会让同步失效。** 后台「重传封面 / 换壁纸 / 换图标」
时，图片经 `CBStore.fileToResizedDataURL()` 压成**内联 base64** 写进 `content.json`
（默认 1000px / 0.82，壁纸 1400px / 0.8）。改 1 张约 +100–200KB，跨境同步从约 1 秒
变成约 1.5–3 秒；改很多张会一路回到瘦身前的十几秒。

- **新图是内联的 → 只覆盖 `content.json` 照样同步**，不依赖 `assets/`、不需要部署。
- **已外置的 17 张老图**在后台编辑时原样保留（`coverData = d.cover || ''`），线上文件也一直在，
  只覆盖 `content.json` 动不到它们，**不会破图**。
- 唯一体感差异：文件变大后同步慢一点；刚覆盖完还有 raw 的 `max-age=300` CDN 窗口（最多 5 分钟）。

想恢复 20KB，用仓库里的幂等工具（无第三方依赖，Python 3.7+；Windows 用 `python` 或 `python3`）：

```bash
python tools/externalize_images.py --dry-run   # 先看会做什么，不写任何文件
python tools/externalize_images.py             # 实际执行
```

流程：后台改图 → 「发布」tab 导出 `content.json` 覆盖到项目根 → 跑脚本 → 脚本把内联图按
内容哈希落盘成 `assets/img-<hash>.jpg`，字段值换成
`assets/img-<hash>.jpg?sharecode=AK6QIELR67`（可直接当 `src` 用，**零渲染代码改动**）。

- ⚠️ **只要生成了新图片文件，就必须重新部署一次**让 `assets/` 上线，再把瘦身后的
  `content.json` 推到 GitHub。**只推 content.json 不部署 → 访客拿到指向不存在图片的引用 → 破图**。
  脚本会在输出里醒目警告并列出新文件名；没新增图片时则明确告诉你「无需部署」。
- 幂等：重复运行不重复生成、不改已外置路径；同一张图被多处引用只落盘一次；命中已有同内容图直接复用。
- 常用参数：`--sharecode NEWCODE`（换链接时重签全部 18 处图片引用）、`--verify`（只校验图片齐全、
  不写文件）、`--backup`（写 `content.json.bak`）、`--content` / `--assets` / `--root`（自定义路径）。
- ⚠️ `--sharecode` **只改图片路径**。`content.json` 里另有 5 处非图片 URL 含旧门禁码
  （`config.apkUrl`、`config.guide.apkUrl`、`config.updateNotice.buttonUrl`、`links[].url`、作者官网），
  换链接时按 §5d 单独替换，脚本会提醒。
- 回滚：`git checkout -- content.json`（或用 `--backup` 的 .bak）。脚本**不动 `meta.json`**。
- 注：从后台导出的 `JSON.stringify` 格式会被脚本重新序列化成 Python `indent=2` 格式，
  git diff 会显示整文件变化，但**内容语义完全不变**。

> 一句话：**改 1–3 张图直接覆盖仓库就行，不用跑工具；改得多、想恢复秒级同步时再跑工具 + 部署一次。**

---

## 5. 改代码 / 部署（界面优化、加功能时）

- 部署能力：`workbuddy_sites_deploy`（本平台「发布」能力）。
- 关键参数：
  - `directory` = 项目根目录（含 `index.html` 的那一层，即从仓库 `clone` 出来的目录）
  - `language` = `static`
  - `entryHtml` = `index.html`
  - `domainPrefix` = `content-box-24323`（新建应用时请求该子域；命中已有应用时被忽略）
  - `appId` = **不要传**（工具靠会话根 genie 自动命中；仅 `unpublish` 多应用时才需要）
  - `userAskedToPublish` = `true`（用户说「发布 / 上线」时才置真）
- 流程：改完项目文件 → 告诉助手「发布」→ 助手部署 → 链接不变。
- ⚠️ **跨设备部署铁律（2026-11-05 定稿）**：发布系统按「**部署目录 → 应用的映射**」定位目标，
  映射记录在 **WorkBuddy 会话根目录**（`C:\Users\<用户>\WorkBuddy\<日期时间>\`，即本次任务的文件夹）
  的 `.wbapp_<appId>.genie` 与 `.workbuddy/applications.yaml` 里。工具扫会话根找 genie →
  命中 appId 就覆盖原链接，找不到就静默新建。**会话根 ≠ 项目文件夹的父目录**（除非两者恰好重合）。
  - **换设备不换链接的三个条件**：① 登录**同一个 WorkBuddy 平台账号**；② 两个映射文件放在新设备的
    **会话根目录**（与项目文件夹同级，不是项目里面）；③ `localDir` 改成新设备项目的实际绝对路径。
  - 2026-11-04 真实新设备测试**失败**：genie 放进了项目子目录 → 会话根扫不到 → 静默新建 `…71596`
    （已下线）；工具把误建应用的 genie 写到了会话根，反证会话根才是扫描/写入基准。
  - 2026-11-05 在原机器部署 v84 时**未传 appId**，仍返回 `…24323`、`verified:true`，
    `genieFilePath` 指向会话根那个 genie —— 本机再次印证机制成立；**真实新设备 + 正确位置尚未复测成功**。
  - 详见下方「§5c 换设备不换链接 · 实测步骤」与「§5d 验证失败后的迁移预案」。
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

**验证状态（2026-11-05 定稿）**：
- 方案本身已按根因修正并固化（见 §3 标准口令 / §5 铁律）；**「真实新设备 + 正确位置」的完整验证待用户于 2026-11-05 晚执行**。
- 该验证会**真正触碰生产链接 `…24323`**，需用户明确授权后进行；判定标准见
  `新设备跨设备部署验证指令.txt`（已随仓库提供）。
- 原机器（会话根 `2026-10-27-16-09-30\`，genie 已就位）始终是最稳的发版环境；
  跨设备是原机器不可用时的备选。

## 5d. 验证失败 → 切换新链接的迁移预案（2026-11-05 定稿）

适用：新设备按 §5c 验证后**仍生成新链接**，决定「以后用新链接部署、旧链接暂时不下线」，
并在旧链接上发布新链接与新 APK 的迁移公告，让老用户平滑过渡。

> **📌 执行入口已就位（2026-11-05 增补）**
> - 新设备上的新助理请直接读 **`路径二-新链接替换原链接执行手册.md`** 按 Phase 0→4 执行。
> - 代码/内容里所有写死原链接的地方，已由 **`tools/migrate_to_new_link.py`** 一键自动替换
>   并自检（取代了下面手填清单，它仍可作核对参考）。
> - **用户三条硬要求（手册 Phase 3 为不可跳过的闸门）**：
>   ① 自动替换 + 完整性自检；② 原链接暂时不下线、可单独发更新提醒且不影响新链接；
>   ③ **上线新链接前必须先向用户汇报、回答提问，只有用户明确说「同意上线新链接」后才许发布**——
>   任何「先看看」「你觉得呢」都不是授权。

### 先纠正一个概念：仓库不绑定链接
- GitHub 仓库只是代码与内容，**不绑定任何链接**。绑定关系是
  「**平台账号 + 本地会话根的 `.wbapp_<appId>.genie`**」：工具按 `directory` 去它所在的会话根扫 genie，
  命中哪个 appId 就覆盖哪个链接。
- 所以「改用新链接」准确说是：**新设备那个会话/工作区**绑定了新 appId；同一份仓库可以被部署到多个 appId。
- ⚠️ **一个工作区/会话只能有一个 app 链接**。要同时维护新旧两个链接，必须**开两个 WorkBuddy 任务窗口**
  （两个不同会话根，各放对应 appId 的 genie）。千万别在同一窗口部署第二个目录，那会覆盖第一个应用。
- 验证失败后**立刻记录**：新链接完整 URL（含 `sharecode`）、新 appId（在会话根 genie 文件名里），
  写进本文档并推仓库，否则以后无法稳定覆盖新链接。

### 旧链接不下线时，还能改它的内容吗？——能，但分三层
| 想改的东西 | 能否改 | 怎么做 |
|---|---|---|
| 内容（文章 / 链接 / 公告 / `updateNotice` 弹窗 / `apkUrl`） | ✅ 能，不必下线 | 把 `content.json` 覆盖到 GitHub 即可（v85 起无需改指纹，见 §4）；更稳是再重新部署一次旧 appId |
| 界面 / 代码（HTML、CSS、JS、SW、后台页） | ✅ 能，但**只能重新部署** | 在另一个会话根放旧 appId 的 genie，从那里部署；改 GitHub 对代码无效 |
| 旧 APK 里硬编码的地址 | ❌ 改不了 | APK 是 TWA，`host` 写死在打包配置里，只能重新打包新 APK 让用户手动安装 |

结论：**迁移公告完全发得出去**，因为它属于「内容」层；旧链接不下线不构成障碍。

> ⚠️ **但"原链接公告不影响新链接"需要解耦**：v85+ 新旧链接默认读同一份 GitHub `content.json`，
> 只覆盖 GitHub 会让公告**也**出现在新链接上。要让原链接内容真正独立，须关掉原链接
> `store.js` 的 `crossCheckGithub()` 后用**旧 appId 重部署**（详见
> `路径二-新链接替换原链接执行手册.md` Phase 2）。这一步由助理在用户授权下执行，非工具自动。

### 迁移公告怎么落地（推荐顺序）
1. 在 `content.json` 里：`config.updateNotice.enabled = true`，标题/正文写迁移说明，
   `buttonText` 改「前往新地址」，`buttonUrl` 指向**新链接的引导页**；
   `config.apkUrl` 改指**新 APK 直链**（新域名 + `/app.apk?sharecode=<新 sharecode>`）；
   `config.author.intro` 的「站点官网」、links 里指向旧域名的条目一并改新域名；再发一篇置顶公告。
2. 旧链接当前 v85 代码**已支持 `updateNotice` 全屏弹窗，引导页也已能读 GitHub 新版 `apkUrl`**，
   开启即生效，**无需改代码**。老用户点「一键安装」→ 引导页读 `apkUrl` → 下载新 APK，
   这条链路可远程改，不需要动旧 APK。
3. 让公告覆盖所有旧访客：最稳是**重新部署一次旧 appId**，把公告版 content.json 写进旧链接托管。
   v86 起只推 GitHub 也能同步（45s 后台全量校验 + 失败重试一次 + 来源优先级，不会被旧快照冲掉）；
   v87 图片外置后 `content.json` 仅 ~20KB，跨境同步已在 1 秒内，但托管端若仍是旧的大快照，
   每次启动仍要下 1.28MB，故重要公告仍建议重新部署一次对齐两侧。
4. 新链接侧同步部署代码，并按下面清单改完再发布。

### 切到新链接的代码改动清单（新链接的 sharecode 很可能不同！）

> ⚠️ 上面每一项现在都由 `tools/migrate_to_new_link.py --apply` 一次性自动完成
> （sharecode 全局替换 + host 全局替换 + 复用 externalize 重签 18 图 + 升 SW 壳 + 自检）。
> 下面清单仅作**人工核对**用，正常情况下新助理直接跑工具即可，不要再手工逐项改。
- `SC` 在 `store.js` / `admin.js` / `guide.html` 中是「优先读 URL 参数，缺省回落 `AK6QIELR67`」，
  故数据请求会自动适配；但以下**写死**处必须全局替换成新域名 + 新 sharecode：
  - `index.html` / `admin.html` / `preview.html` / `download.html` / `manifest.webmanifest` 里所有 `?sharecode=AK6QIELR67`
  - `js/app.js`：SW 注册 `sw.js?sharecode=...&v=85`、`aboutQrUrl`、`ensureScript` 的 js 路径、
    关于页后台入口 `admin-mini`（当前仍是单参数 `admin.html?key=...`，应补 sharecode）
  - `js/admin.js`：`PUBLIC_ORIGIN`、`DEFAULT_INSTALL_URL`、两处预览 iframe URL、`fetch('sw.js?...')`
  - `content.json`：`apkUrl`、`author.intro` 官网、links 里的旧域名、引导页配置里的地址，
    以及 5 处非图片 URL 里的 `?sharecode=AK6QIELR67`（官网 / apkUrl / buttonUrl / links 地址）
  - **18 处外置图片路径 `assets/img-*.jpg?sharecode=AK6QIELR67`**（v87 起新增，漏改全部 404）：
    用 `python tools/externalize_images.py --sharecode <新码>` 一键重签，见 §4b；
    脚本只改图片路径，会提醒剩余 5 处非图片 URL 需手动替换
- **`assets/` 目录（17 张图，约 927KB）必须随项目一起 clone / 部署**，否则所有封面、壁纸、图标全丢。
  图片文件名是内容哈希，不会变，只需替换 URL 里的 sharecode。
- 改完**升 SW 版本号**：`sw.js` 的 CACHE / `meta.json` 的 sw / `js/app.js` 的 `&v=` 三处同号 +1。

### APK 重新打包的两个硬前提
- 旧 APK 是 TWA：`host = https://content-box-24323.app.workbuddy.host`（见打包用 `payload.json`），
  新包要把 `host` / `iconUrl` / `webManifestUrl` / `startUrl` 全改到新链接。
- ⚠️ **`app.apk`、签名 keystore、`apk-build/` 都不在 GitHub 仓库里**（`.gitignore` 排除 apk，
  apk-build 在会话根而非项目内），新设备 clone 仓库拿不到。重新打包前务必从旧机器备份**签名文件**，
  并保持 `packageId = com.contentbox.app`；**签名不一致时用户无法覆盖安装，只能卸载重装**，
  这会直接破坏「让老用户平滑更新」的目标。

### 何时下线旧链接
保留到绝大多数老用户已装新 APK / 已访问新链接之后。旧链接不下线不影响新链接，
但两者**共用同一个 GitHub `content.json`**：v85 起两边都会被后台全量校验刷成同一份内容，
迁移期请让两边显示同一份迁移版内容。若必须显示不同内容，只能改新链接的 `store.js`
（去掉 `crossCheckGithub()` 或换内容源）后再部署，**不能靠 `meta.json` 指纹区分**。

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
- **正确后台地址（唯一，v78 更正）**：`https://content-box-24323.app.workbuddy.host/admin.html?sharecode=AK6QIELR67&key=nebadmin2026`（两个参数缺一不可）。
- **公开端「关于」入口**：`js/app.js` 的 `<a class="admin-mini" href="admin.html?key=nebadmin2026">Hi</a>` 仍是单参数，靠平台 Cookie 在已登录设备上能进；**无痕窗口 / 新设备会被 403**，此时请手动用上面的双参数地址。
- ⚠️ 上面两条是 v71 当时的记录，其中「单参数即可」的结论**已被 v78 实测推翻**（详见下方 v79 补充）：单独带 key 会 403「链接不完整」，只带 sharecode 会被 admin.js 挡成 404。
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

## 2026-11-04 补充：修复后台登录卡死 + 网页端一键安装不跳引导页（v78）

- **症状**：① 公开端进后台输密码「没反应、打不开」；② 网页端点「一键安装」不跳引导页。用户明确要求 **APP 内（WebView）仍隐藏安装按钮，不放开**。
- **根因 1（登录卡死）**：v77 把 `enterAdmin()` 改成「优先读 GitHub raw」，实测该请求跨境拉 1.28MB 需 **21.8s**，且无超时、无 loading，界面一直停在登录页。属 v77 回归。
- **根因 2（不跳引导页）**：`js/app.js` 关于页按钮原来**先判断 `window.__installPrompt`**（浏览器 PWA 安装提示），命中就 `installNow()` 并 return，轮不到 `location.href = apkUrl`。桌面 Chrome/Edge 打开 PWA 很容易触发该提示。另：`contentHash` 长期未变（`189baf05e9ee114b`），公开端指纹比对跳过 → 一直吃旧缓存；后台 `apkUrl` 为空时兜底填的还是 `.apk` 直链。
- **修复**：
  - `js/admin.js`：新增 `fetchWithTimeout(url, opts, ms)`（AbortController）；`enterAdmin()` 改为**同域 `./content.json` 优先**（毫秒级），GitHub raw 仅作「线上版本更高」的可选校验并加 **6s 超时**；登录按钮点击后显示「正在载入…」并加整体 try/catch 兜底，任何异常都能进后台；草稿明显陈旧（guide 未启用 / 缺 apkUrl）时以线上已发布版为权威（`draftStale`）；进入后台一律用 `saveLocalOnly()` 而非 `CBStore.saveDraft()`，**避免每次登录触发自动发布把旧草稿写回仓库**；`DEPLOYED_APK_URL` 改名 `DEFAULT_INSTALL_URL` 并改指向引导页。
  - `js/app.js`：关于页按钮优先级改为 微信 → 苹果（`showAddHomeGuide`）→ **`apkUrl`（跳引导页）** → PWA 安装提示 → toast。`isWebView` 隐藏逻辑**完全未改**（APP 内仍只显示"已在 App 内打开"）。
  - `meta.json` 的 `contentHash` 改为 `v78-sync-20261104-1825`（首次主动变更，强制所有设备重新拉内容）；SW 升 `v77→v78`（`sw.js` CACHE、`js/app.js` 注册 `&v=78`、`meta.json` 的 sw 三处同步）。
- **线上验证**：sw=v78、app.js `&v=78`、app.js 中 `apkUrl` 判断位于 PWA 安装提示之前且 WebView 隐藏逻辑原样、admin.js 含 `fetchWithTimeout/正在载入/saveLocalOnly(content)/DEFAULT_INSTALL_URL/draftStale`、托管与 GitHub 的 meta.json 均为新指纹、`content.json` 的 `apkUrl` 指向引导页且 guide 已启用。提交 `943eabd` 已推 GitHub 并重新部署。
- **注意**：改 `contentHash` 会让所有设备下次打开重新下载 1.28MB content.json（预期行为，用于清掉旧缓存）。后台仍建议 `Ctrl+Shift+R` 强刷一次加载 v78 的 admin.js。

## 2026-11-04 补充：根治加载延迟 / v66 旧内容残留 / 引导页独立化（v79）

- **用户报的三个症状**：① 后台输密码后仍要等很久；② 网页端用网址进去是 **v66 老内容**，要刷新好多遍才变最新；③ 一键安装确实跳引导页了，但「是可以开启内容的界面」（跳过去后仍留在内容页历史栈 / 被主应用界面包裹）。用户强调**特别是延迟加载**。
- **根因 A（最致命，之前完全没发现）**：托管平台对**所有静态资源**都校验 `?sharecode=...`，不带就返回「链接不完整」HTML（或 403）。而 `store.js` 里 `CONTENT_URL='./content.json'`、`META_URL='./meta.json'` 都**没带门禁参数** → 所有同域兜底请求其实都拿到 HTML，`r.json()` 抛错后被 `catch` 静默吞掉 → **同域兜底链完全失效**，只剩时好时坏的 GitHub raw 一条路。
- **根因 B（v66 残留）**：`readHash()` 用 `Promise.all([metaP, sizeP])`，其中 `sizeP` 是对 GitHub raw 的 **HEAD 请求且没有超时**。国内网络一挂起，`Promise.all` 永不完成 → `checkContentUpdate()` 永远不执行 → localStorage 里的 v66 缓存永不更新，只能靠反复刷新碰运气。加上 SW 对 `content.json` 用 `staleWhileRevalidate`，还会把「链接不完整」HTML 和带 `_h=` 时间戳的 raw 副本写进缓存。
- **根因 C（登录慢）**：v78 的 `enterAdmin()` 虽然改成同域优先，但**每次登录仍无条件 await 一次 GitHub raw 并等满 6s 超时** → 固定 6 秒起跳。
- **根因 D（延迟大）**：v78 把外壳 js/css 全改成 `netFirst` + `cache:'reload'`，每次打开都强制重下全部脚本，首屏被网络往返拖慢。
- **修复（提交 `fee1f2d`，SW v79）**：
  - `js/store.js` 重写数据层：`gate()` 给同域资源自动补 `sharecode`；新增统一 `fetchT()`（AbortController 超时：同域 6s、首访 8s、GitHub raw 2.5s）；`fetchContent()` 有缓存**立即返回**，同时**每次启动都强制刷一次同域最新内容**，`applyFresh()` 比对后写缓存并 `onUpdate` 重绘；`crossCheckGithub()` 纯异步比对 GitHub/同域 `meta.json` 的 `contentHash`，仅当 GitHub 更新才拉全量；删除 `readHash/checkContentUpdate/fetchJson/activeContentUrl`。
  - `js/admin.js`：`enterAdmin()` **登录零等待**——本机草稿/缓存立即 `renderShell()`，同域 `content.json?sharecode=...&pv=1` 用 6s 超时异步校正，只重绘当前面板、用户输入中不打断；彻底删掉登录链路的 GitHub raw 6s 等待；`prepareContent()`/`resolveContent()` 抽出复用；手动「从线上重新加载」与 PAT 发布的 4 个 fetch 全部加超时。
  - `sw.js`：`content.json`/`meta.json`/`guide.html` **完全放行不进缓存**；外壳改回 `staleWhileRevalidate` 缓存优先秒开（新 SW install 已用 `cache:'reload'` 预缓存新壳，配合 `controllerchange` 自动 reload 保证部署后一次刷新生效）；导航/后台页仍网络优先。
  - `guide.html`：数据源改**同域优先**（带门禁 + 6s 超时），GitHub raw 仅 2.5s 超时兜底；删掉未用的 `headLen/loadFull`。
  - `js/app.js`：一键安装用 `location.replace(apkUrl)` 替换内容界面（返回键回不到内容页）；PWA standalone 下用 `window.open(apkUrl,'_blank')` 交系统浏览器打开独立下载页。`isWebView` 隐藏逻辑**原样未改**（APP 内仍不显示按钮）。
- **⚠️ 后台地址更正（实测）**：`admin.html?key=nebadmin2026` 单独访问会被平台 **403「链接不完整」**；`admin.html?sharecode=AK6QIELR67` 会被 admin.js 挡成 404。**正确地址必须两个参数都带**：`https://content-box-24323.app.workbuddy.host/admin.html?sharecode=AK6QIELR67&key=nebadmin2026`。用户之前无痕窗口打不开后台、手机 APP 能进，正是平台 Cookie（`__wb_rsc`，30 天）有无造成的差异。
- **验证**：本地用 vm 模拟「GitHub raw 永久挂起」→ 首屏 1ms 返回缓存、500ms 内 `onUpdate` 把 v66 刷成最新 ✅；线上 sw=v79 / `&v=79` / `meta.json contentHash=v79-sync-20261104-1905`；同域 `content.json?sharecode=...&_h=` 200 且 0.55s、后台同域请求 0.52s、引导页 0.24s；三端 content.json 一致（8 篇、v76 文案、guide 已启用、apkUrl 指向引导页）。已推 GitHub 并重部署（appId 不变，链接不变）。
- **注意**：用户浏览器里若仍是 v78 旧 SW，第一次打开会自动 reload 一次接管 v79；localStorage 里的 v66 旧缓存会在新版 store.js 首次加载后被同域最新内容覆盖并自动重绘，无需手动清站点数据。

## 2026-11-05 补充：快捷方式网址开关 + 强制提示更新弹窗（v80）

- **需求**：① 后台「工具栏 → 添加快捷方式」增加「是否在公开端展示网址」开关，已添加项在编辑里也能改；② 新增「进入网站 / 手机 APP 首页即弹出」的更新提示，设置放在「站点设置」下并做成**折叠卡片**（后台项太多）；支持强制全屏 / 左上角气泡（带关闭）、可编辑主题 / 文本 / 图标 / 引导按钮；同步适配公开端、后台设置、预览、浅色与暗调。
- **数据结构**：
  - `config.links[].showUrl`（布尔，**缺省 = 显示**，兼容线上原有 8 条无该字段的数据）。后台三处：添加表单 `#lk_showurl`、编辑弹窗 `#l_showurl`、列表卡片 `data-toggle-url` 一键切换（事件委托挂在 `panel._lDelegated` 上，重渲染不失效）。公开端 `js/app.js` 的 `linkCard()` 用 `lk.showUrl !== false` 决定是否输出网址行。
  - `config.updateNotice`（对象，**缺省 = 不弹**）：`{ enabled, mode:'fullscreen'|'bubble', theme:'auto'|'light'|'dark', accent, title, text, icon, buttonText, buttonUrl, everyTime }`。全屏 = 居中遮罩、默认无关闭按钮；**未填 `buttonUrl` 时自动补关闭按钮，防止把访客锁死**。气泡 = 左上角 fixed 卡片、必带关闭按钮。
- **共享模块 `js/notice.js`**：挂 `window.CBNotice`（`norm / html / mount / unmount`），由 `index.html`、`preview.html`、`admin.html` 三页共同引入（必须在 `app.js` / `admin.js` 之前）。`html(cfg, opts)` 的 `opts.inline` 产出后台缩小预览（不产生 fixed 浮层）、`opts.preview` 让按钮 disabled 且强制带关闭、`opts.force` 允许 enabled=false 时也渲染。SW 的 `ASSETS` 与 `isShellUrl` 已纳入该文件。
- **后台设置**：`renderSettings()` 复用现成的 `collBlock('notice', ...)` 折叠组（状态存 `localStorage['cb_admin_coll_notice']`，默认收纳）。字段 id 统一 `n_*`；`syncNoticeDraft(applyToContent)` 输入即更新 `#n_mini` 小预览并 `pushPreview()` 推到预览 iframe；初始化传 `false` 只画预览、不误写草稿；「👁 在后台全屏预览」直接 `CBNotice.mount(..., {force:true, preview:true})`；`#s_save` 收集写入 `content.config.updateNotice`。
- **公开端 / 预览**：`js/app.js` 新增模块级 `syncUpdateNotice(force)`。正常模式同一配置只处理一次（`noticeSig` guard），`everyTime=false` 时按配置签名存 `localStorage['cb_notice_seen']`，配置改动会再弹一次；`onUpdate` 与 `fetchContent().then()` 都会调用，保证冷启动与内容刷新后都能拿到最新配置。**预览模式的 `PREVIEW` 分支会 `return`，必须在该分支的 `cb-preview` 回调里单独调一次 `syncUpdateNotice(true)`**，否则后台「👁 预览」里永远看不到弹窗。
- **主题适配**：CSS 新增 `.upd-mask / .upd-full / .upd-bubble / .upd-card / .upd-icon / .upd-title / .upd-text / .upd-btn / .upd-close`，`auto` 靠 `body.dim .upd-mask.upd-auto .upd-card` 跟随浅色/暗调，`light`/`dark` 强制覆盖；后台 mini 预览另有 `body.admin-dark .upd-inline-preview.upd-auto` 规则。强调色用卡片上的内联 `--upd-accent`。
- **版本**：SW `contentbox-v80`，`js/app.js` 注册 `&v=80`，`meta.json` 的 `sw` 同步；`contentHash` 故意**未改**（content.json 未变，避免全设备无谓重拉 1.28MB）。
- **验证**：5 个 JS 文件 `node --check` 全过、CSS 括号平衡；用 vm 模拟 DOM 跑 `CBNotice` 18 项边界测试全过（全屏防锁死、XSS 转义、非法链接丢弃、inline 预览不产生浮层等）；后台表单 `n_*` id 与代码引用完全一致；线上 sw=v80 / `&v=80` / `js/notice.js` 200 / 三页均引入 / 后台双参数地址 200 / content.json 三端一致。提交 `e70c342` 已推 GitHub 并重新部署（appId 与链接不变）。
- **⚠️ 上线生效路径**：弹窗**默认关闭**，`content.json` 里没有 `updateNotice` 字段。后台「保存设置」只写本机草稿，此时「👁 预览」和「👁 在后台全屏预览」能立刻看到效果；**要让所有访客 / 手机 APP 真正弹出，必须走「发布」tab 推上线（需 PAT），或让助手把配置同步进 content.json 后重新部署**。

## 2026-11-05 补充：更新弹窗关闭按钮与两种模式布局修订（v81）

- **用户两轮纠正**：① 全屏展示与气泡卡片**都要有关闭按钮**，按钮统一放**右上角**；后台增加「关闭按钮显示度」，最低可设为不显示，但**右上角那个位置点击仍然可以关闭**。② 明确布局定义：「全屏展示是**覆盖整个屏幕，内容居中而已**」（不是卡片撑满屏）；「气泡卡片弹出模式是**屏幕中上位置弹下来一个气泡卡片**」（不是 v80 的左上角贴边卡片）。
- **数据结构**：`config.updateNotice` 新增 `closeOpacity`（0–100，**缺省 100**）。`js/notice.js` 的 `norm()` 钳制数值并回退非法值到 100；渲染时只写 inline `opacity`。
- **关闭按钮实现**：`closeHtml(c)` 生成 `<button class="upd-close" data-upd-close style="opacity:X">`，**与卡片并列**作为 `.upd-mask` 的直接子元素；CSS `position:fixed; top:max(12px, env(safe-area-inset-top)); right:12px; width/height:40px; pointer-events:auto`，两种模式位置完全一致。删除 v80 的 `closable` 条件与「未填 buttonUrl 才补关闭」兜底——现在两种模式无条件都有关闭按钮。全屏遮罩用白色 × + 半透明黑圆底，气泡无遮罩用浅色圆底深字，暗调 / `dark` 主题另有覆盖色。
- **气泡布局**：`.upd-bubble .upd-card` 改为 `top:max(10vh, safe-area+32px); left:50%; transform:translateX(-50%); max-width:340px`，加 `@keyframes updDrop`（从 `translate(-50%,-36px) scale(.96)` 滑入，0.42s）。全屏遮罩保持 `inset:0` + flex 居中，未改动。
- **后台**：`noticeInner` 增加 `#n_close` 滑块与 `#n_close_v` 实时数值，`noticeFormCfg()` 收集并钳制，`syncNoticeDraft()` 同步数值到标签，监听数组加入 `n_close`；展示方式文案改为「遮罩盖满整个屏幕，内容居中 / 屏幕中上位置弹下来」；原来的「⚠️ 全屏无关闭按钮会锁死访客」警告改为「ℹ️ 右上角恒有关闭热区」说明。
- **inline 小预览陷阱**：右上角按钮是 `position:fixed`，后台设置卡片里的缩小预览必须靠 `.upd-inline-preview { position:relative }` + `.upd-inline-preview .upd-close { position:absolute; ... }` 覆盖，否则 × 会飘到整个后台页面右上角盖住「👁 预览」按钮。
- **版本**：SW `contentbox-v81`，`js/app.js` 注册 `&v=81`，`meta.json` = `{"contentHash":"v81-notice-close-20261105","sw":"contentbox-v81"}`（content.json 本身未改）。
- **验证**：5 个 JS 文件 `node --check` 全过、CSS 括号平衡、`n_*` 表单 id 与引用一致；vm 模拟 DOM 跑 32 项测试全过（两种模式均有 ×、未填链接也有 ×、显示度 0 仍保留节点与热区、负数/超界/非法值钳制、老配置缺省 100、点右上角可卸载、XSS 转义、CSS 定位与动画存在）。

## 2026-11-05 补充：× 移回卡片右上角 + 全屏放大 + 引导页网址修复（v82）

- **用户截图纠正两处**：① 关闭 × 要放在**卡片自身的右上角**（v81 做成「屏幕右上角 fixed」是理解错了），全屏模式的卡片可以**大一些**；② 后台「引导页」设置底部显示的独立网址是错的，显示成 `http://127.0.0.1:63250/guide.html?...` 这种无效本地地址，正确应为 `https://content-box-24323.app.workbuddy.host/guide.html?sharecode=AK6QIELR67`。
- **① 关闭按钮 / 卡片尺寸**：`js/notice.js` 把 `closeHtml(c)` 从 `html()` 挪进 `cardHtml()`，作为 `.upd-card` 的**首个子元素**；CSS `.upd-close` 由 `position:fixed` 改回 `position:absolute; top:10px; right:12px`（相对卡片），配色改为按**卡片主题**（浅色卡片灰字半透明灰底；`body.dim` / `upd-dark` 浅字半透明白底），不再按遮罩配色。`.upd-full .upd-card` 放大到 `max-width:440px; padding:40px 32px 30px; border-radius:24px`，图标 88px、标题 23px、正文 15px；气泡保持 340px。后台滑块说明与警告文案同步改为「卡片右上角」。显示度 0% 隐形但热区常驻的逻辑不变。
- **② 网址根因**：`renderGuide()` 用 `location.origin + '/guide.html?...'` 拼对外链接，而后台在本地 / 预览容器里打开时 `location.origin` 是 `http://127.0.0.1:63250`，于是显示和「复制」按钮都给出无效地址。修复：`js/admin.js` 顶部定义 `PUBLIC_ORIGIN = 'https://content-box-24323.app.workbuddy.host'`，`DEFAULT_INSTALL_URL = PUBLIC_ORIGIN + '/guide.html?sharecode=AK6QIELR67'`；`guideUrl = DEFAULT_INSTALL_URL`，`#g_open` 的 href 也改用它；网址框新增 `.gub-full` 完整可换行文本（输入框太窄会截断长域名）。同类隐患一并修掉：`js/app.js` 关于页二维码 `aboutQrUrl` 也改为固定正式地址，避免扫出 127.0.0.1。
- **⚠️ 长期规则**：凡是「要发给别人 / 要生成二维码」的对外链接，**不得再用 `location.origin` 拼接**，统一走固定正式域名（appId 不变则链接不变）。
- **版本**：SW `contentbox-v82`，`js/app.js` 注册 `&v=82`，`meta.json` = `{"contentHash":"v82-card-close-guideurl-20261105","sw":"contentbox-v82"}`；`content.json` 未改。
- **验证**：5 个 JS `node --check` 全过、CSS 括号平衡、`n_*` 表单 id 与引用一致；vm 模拟 DOM 跑 **41 项测试全过**（关闭按钮在卡片内而非卡片外、两种模式都有 ×、显示度 0 仍可点与卸载、全屏 440px、气泡动画仍在、引导页常量拼出用户给的正确网址、无残留 `location.origin` 拼接、二维码固定地址）。

*本手册由助手在 v69 发布后整理并更新，作为跨设备恢复上下文使用。*
