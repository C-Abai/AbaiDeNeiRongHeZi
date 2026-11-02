# 内容盒子 PWA — 跨设备恢复与维护手册（HANDOVER）

> 用途：当你换电脑、在新设备上登录 WorkBuddy（本平台）时，历史聊天记录不在。
> 只要让助手「读取 GitHub 仓库里的 HANDOVER.md（本文件）」并把后台密钥告诉我，
> 助手立刻恢复到当前（v62）的全部上下文，继续帮你改内容 / 优化 / 部署。
> 本文档由助手在 v62 发布后整理，是「自包含」的，不依赖任何历史对话。

---

## 0. 这是什么 / 关键标识（必存）

「内容盒子」是一个**静态 PWA（渐进式 Web 应用）**，用来展示文章 / 帖子 / 黑科技工具等内容。当前线上版本 **v62**。

| 项目 | 值 |
|---|---|
| 线上地址（分享 / 前台） | `https://content-box-24323.app.workbuddy.host/?sharecode=AK6QIELR67` |
| 后台（管理 / 编辑） | `https://content-box-24323.app.workbuddy.host/admin.html?key=nebadmin2026` |
| 部署 appId（同链接重部署用） | `wbapp_jFiM5Y7b9RmUulYAimy36N` |
| GitHub 仓库 | `https://github.com/C-Abai/AbaiDeNeiRongHeZi`（Public，main 分支） |

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

## 2. GitHub 仓库的双重角色

仓库 `C-Abai/AbaiDeNeiRongHeZi` 同时是：

1. **内容源**：`content.json` / `meta.json`（线上实时拉取）
2. **完整代码源**：含全部 19 个文件（含 v62 代码）。换设备 `clone` 即可拿到完整工程。

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
- 改内容 → 你提需求，或直接去 GitHub 改 `content.json`。
- 改代码 / 界面 → 助手 `clone` 仓库到当前环境修改，再用同一个 `appId` 部署，**链接不变**。

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
- 发布后提醒用户**杀 PWA 后台重进**，让新的 Service Worker（当前 v62）接管缓存。

---

## 6. 当前版本状态（v62）已实现的功能

- 顶部导航栏上移，减小上方空白（保留手机通知栏安全区）。
- 顶部玻璃蒙版层（`backdrop-filter` 模糊），内容向上滑入时不再穿透到导航按钮 / 文字。
- 文章区块搜索栏（按标题 / 摘要 / 正文 / 分类 / 标签实时过滤，输入时保留焦点）。
- 帖子卡片压缩 + 「📌 置顶内容」折叠卡（默认展开，点标题栏可折叠）。
- 以上全部适配**浅色 / 暗调主题**，前端 / 预览端 / 后台三端共用同一份 `css/style.css` 与 `js/app.js`。
- Service Worker 缓存版本：`contentbox-v62`。

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

*本手册由助手在 v62 发布后整理，作为跨设备恢复上下文使用。*
