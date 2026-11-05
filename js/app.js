(function () {
  const $ = function (s, el) { return (el || document).querySelector(s); };
  let content = null;
  let tab = 'article';
  let deferredPrompt = null;
  // 预览模式：由后台后台 iframe 注入草稿内容（不注册 SW、不联网拉取）
  const PREVIEW = new URLSearchParams(location.search).get('preview') === '1';

  function toast(msg) {
    const t = $('#toast');
    t.textContent = msg;
    t.classList.add('show');
    setTimeout(function () { t.classList.remove('show'); }, 1800);
  }
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
  }
  // 动态加载脚本（非阻塞）：用于把体积大的 qrcode.js / 按需的 tools.js 从首屏关键路径中剥离
  function ensureScript(src) {
    return new Promise(function (resolve, reject) {
      const s = document.createElement('script');
      s.src = src;
      s.onload = function () { resolve(); };
      s.onerror = function () { reject(new Error('load failed: ' + src)); };
      document.head.appendChild(s);
    });
  }
  // tools.js 仅在点开工具时才需要；首屏后后台预载，打开工具时若已就绪则零等待
  let _toolsLoading = null;
  function ensureTools() {
    if (window.CBTools) return Promise.resolve();
    if (!_toolsLoading) _toolsLoading = ensureScript('js/tools.js?sharecode=AK6QIELR67');
    return _toolsLoading;
  }
  // qrcode.js 同样从首屏剥离（约 56KB），仅当关于页/二维码工具真正需要时才加载；
  // 关于页的二维码之前用「if (window.qrcode)」判断，未打开过二维码工具时 window.qrcode 为空导致不显示，这里改为按需加载后渲染
  let _qrcodeLoading = null;
  function ensureQrcode() {
    if (window.qrcode) return Promise.resolve();
    if (!_qrcodeLoading) _qrcodeLoading = ensureScript('js/qrcode.js?sharecode=AK6QIELR67');
    return _qrcodeLoading;
  }
  function fmtDate(s) {
    if (!s) return '';
    const d = new Date(s);
    if (isNaN(d)) return '';
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  }

  // ===== 内容「新 / 更新」红点提醒 =====
  // 规则：帖子带 updatedAt；公开端记录「已读标记 = 该帖 updatedAt」。
  // 当 已读标记 !== 帖子 updatedAt 时显示红点（新帖 / 被修改过的帖）。点开后标记更新，红点消失；
  // 下次该帖 updatedAt 变化（再次修改并发布）红点再次出现。
  const SEEN_KEY = 'cb_seen_posts';
  function getSeen() {
    try { return JSON.parse(localStorage.getItem(SEEN_KEY) || '{}'); } catch (e) { return {}; }
  }
  function isPostNew(p) {
    if (!p || !p.updatedAt) return false;
    return getSeen()[p.id] !== p.updatedAt;
  }
  function markPostSeen(p) {
    if (!p || !p.updatedAt) return;
    const seen = getSeen();
    seen[p.id] = p.updatedAt; // 用帖子自身的 updatedAt 作为已读标记，杜绝时钟误差
    try { localStorage.setItem(SEEN_KEY, JSON.stringify(seen)); } catch (e) {}
  }
  // 红点基线：以 deployMeta.ts 为基准，每次发布都会重新应用一次（可自愈旧版本异常记录）。
  // - unchangedIds：与上次发布完全相同的帖子 → 标记为已读，不显示红点（含「欢迎/关于/工具栏」等老帖）
  // - changedIds  ：本次新增 / 被修改的帖子 → 强制清掉已读标记，必显示红点；点开后标记更新，红点消失；下次再改再出现
  function ensureSeenBaseline() {
    if (!content || !content.deployMeta || !content.deployMeta.ts) return;
    let seen;
    try { seen = JSON.parse(localStorage.getItem(SEEN_KEY) || 'null'); } catch (e) { seen = null; }
    if (!seen || typeof seen !== 'object') seen = {};
    let baseTs = null;
    try { baseTs = localStorage.getItem('cb_seen_baseline_ts'); } catch (e) {}
    if (baseTs === content.deployMeta.ts) return; // 本次发布的基线已应用过
    (content.deployMeta.changedIds || []).forEach(function (id) { delete seen[id]; }); // 改动帖强制未读 → 标红
    (content.deployMeta.unchangedIds || []).forEach(function (id) {
      const p = (content.posts || []).find(function (x) { return x.id === id; });
      if (p && p.updatedAt) seen[id] = p.updatedAt; // 未改动帖标记已读 → 不标红
    });
    try { localStorage.setItem(SEEN_KEY, JSON.stringify(seen)); } catch (e) {}
    try { localStorage.setItem('cb_seen_baseline_ts', content.deployMeta.ts); } catch (e) {}
  }

  // ===== 更新后「已更新最新版本」小气泡（仅刷新那一次出现一次，之后不再出现）=====
  function showVersionToast(msg) {
    let el = $('#versionToast');
    if (!el) {
      el = document.createElement('div');
      el.id = 'versionToast';
      document.body.appendChild(el);
    }
    el.textContent = msg;
    void el.offsetWidth; // 强制回流，确保动画重新触发
    el.classList.add('show');
    clearTimeout(el.__vt);
    el.__vt = setTimeout(function () { el.classList.remove('show'); }, 2600);
  }
  function getSwVersion() {
    return new Promise(function (resolve) {
      if (!('serviceWorker' in navigator) || !navigator.serviceWorker || !navigator.serviceWorker.controller) { resolve(null); return; }
      let done = false;
      const onMsg = function (e) {
        if (e.data && e.data.type === 'VERSION' && !done) { done = true; resolve(e.data.version); }
      };
      navigator.serviceWorker.addEventListener('message', onMsg);
      navigator.serviceWorker.controller.postMessage({ type: 'GET_VERSION' });
      setTimeout(function () {
        if (!done) { done = true; navigator.serviceWorker.removeEventListener('message', onMsg); resolve(null); }
      }, 1500);
    });
  }
  // 更新气泡：仅在「SW 接管触发的那次刷新」出现一次（首页小气泡，不占屏）。
  // 在 controllerchange→reload 前打 sessionStorage 标记，刷新后读到此标记即弹一次并清除。
  function maybeShowUpdateToast() {
    let flag = null;
    try { flag = sessionStorage.getItem('cb_updated_toast'); } catch (e) {}
    if (!flag) return;
    try { sessionStorage.removeItem('cb_updated_toast'); } catch (e) {}
    getSwVersion().then(function (v) {
      const num = v ? (v.split('-v')[1] || v).replace(/^v/, '') : '';
      showVersionToast(num ? ('✓ 已更新到最新版本 v' + num) : '✓ 已更新到最新版本');
    });
  }

  // 解析当前部署的 SW 版本号（取「内容盒子-Vxx」里的数字），用于公开端「关于」页底部显示。
  // 优先用正在控制页面的 SW 回报的版本；非 PWA / 尚无 SW 控制时，直接读取线上 sw.js 的 CACHE，确保与最新部署同步。
  function resolveAppVersion() {
    return getSwVersion().then(function (v) {
      if (v) return v;
      return fetch('./sw.js?sharecode=AK6QIELR67&pv=1').then(function (r) { return r.text(); }).then(function (t) {
        const m = t.match(/const\s+CACHE\s*=\s*['"]([^'"]+)['"]/);
        return m ? m[1] : null;
      }).catch(function () { return null; });
    });
  }
  function swVersionNum(v) {
    if (!v) return '';
    const s = (v.split('-v')[1] || v).replace(/^v/i, '');
    return s;
  }

  // 公开端用户自行选择的外观主题：'1'=暗调，'0'=浅色，null=跟随站点后台默认
  function userDimChoice() {
    try {
      const v = localStorage.getItem('cb_user_dim');
      if (v === '1') return true;
      if (v === '0') return false;
    } catch (e) {}
    return null;
  }
  // 计算实际要应用的主题：叠加用户开关选择后交给 store 渲染（暗调即套用后台调好的暗调参数）
  function applyEffectiveTheme() {
    const base = (content.config && content.config.theme) || {};
    const th = Object.assign({}, base);
    const u = userDimChoice();
    if (u === true) th.dimMode = true;
    else if (u === false) th.dimMode = false;
    CBStore.applyTheme(th);
  }

  let painted = false;
  // 首屏绘制（缓存命中时同步执行，壁纸与内容立即出现，消除白屏）
  function paint() {
    if (!content) return;
    ensureSeenBaseline(); // 按 deployMeta 基线精准标记：未改动帖不标红、改动帖必标红（可自愈）
    $('#siteTitle').textContent = (content.config && content.config.siteTitle) || '内容盒子';
    $('#siteDesc').textContent = (content.config && content.config.siteDesc) || '';
    applyEffectiveTheme();
    if (content.config && content.config.icon) CBStore.applyIcon(content.config.icon);
    if (!painted) { bindTabs(); painted = true; }
    syncTabs();
    render();
  }

  // ===== 强制提示更新弹窗：公开端冷启动 / 后台预览 iframe 共用 =====
  // 预览模式每次 postMessage 都强制重绘，方便边改边看；正常模式同一份配置只弹一次，
  // 配置变化（后台改了文案/模式）才会重新挂载。
  let noticeSig = '';
  function syncUpdateNotice(force) {
    if (!window.CBNotice) return;
    const cfg = (content && content.config && content.config.updateNotice) || null;
    const c = window.CBNotice.norm(cfg);
    const sig = c.enabled ? JSON.stringify(c) : '';
    if (!PREVIEW && !force && sig === noticeSig) return;
    noticeSig = sig;
    if (!c.enabled) { window.CBNotice.unmount(); return; }
    if (!PREVIEW && !c.everyTime) {
      try { if (localStorage.getItem('cb_notice_seen') === sig) return; } catch (e) {}
    }
    if (!window.CBNotice.mount(c)) return;
    if (!PREVIEW && !c.everyTime) {
      try { localStorage.setItem('cb_notice_seen', sig); } catch (e) {}
    }
  }

  async function init() {
    // 预览模式：后台 iframe 通过 postMessage 注入当前草稿，实时预览公开端效果
    if (PREVIEW) {
      window.addEventListener('message', function (e) {
        if (e.data && e.data.type === 'cb-preview' && e.data.content) {
          content = e.data.content;
          paint();
          syncUpdateNotice(true);
        }
      });
      if (window.parent && window.parent !== window) {
        window.parent.postMessage({ type: 'cb-preview-ready' }, '*');
      }
      return;
    }
    // 恢复上次停留的栏目（同一使用会话内有效：从外部快捷网站返回 / 更新刷新后会停在原处；
    // 全新进入 App 则没有记录，默认落在「文章」首页）
    try {
      const savedTab = sessionStorage.getItem('cb_active_tab');
      if (savedTab === 'article' || savedTab === 'tech' || savedTab === 'about') tab = savedTab;
    } catch (e) {}
    // 扫码「下载引导」链接进入时，强制切到「关于」页并聚焦安装区（优先于上面的恢复）
    try { if (new URLSearchParams(location.search).get('to') === 'install') tab = 'about'; } catch (e) {}

    // 注册 SW（不 await，避免阻塞首屏）+ 自动更新：新版本就绪即接管并刷新一次，安卓/桌面皆适用
    if ('serviceWorker' in navigator) {
      let refreshing = false;
      navigator.serviceWorker.addEventListener('controllerchange', function () {
        if (refreshing) return;        // 防止 reload 循环
        refreshing = true;
        try { sessionStorage.setItem('cb_updated_toast', '1'); } catch (e) {} // 标记：本次刷新来自更新
        location.reload();
      });
      // 注册 URL 带 &v= 版本号：每次部署脚本地址都不同，浏览器必须重新下载 SW，
      // 不再依赖对 sw.js 的 HTTP 缓存复用，从而「一次刷新就生效」，杜绝反复刷新才更新的卡顿。
      navigator.serviceWorker.register('sw.js?sharecode=AK6QIELR67&v=84').then(function (reg) {
        if (!reg) return;
        // 主动触发一次更新检查（register 本身也会检查，这里再兜一层，缩短检测时延）
        if (reg.update) { try { reg.update(); } catch (e) {} }
        // 若已有一个 waiting 的新版本，立即让它接管
        if (reg.waiting) reg.waiting.postMessage({ type: 'SKIP_WAITING' });
        // 监听后续新版本安装完成
        reg.addEventListener('updatefound', function () {
          const installing = reg.installing;
          if (!installing) return;
          installing.addEventListener('statechange', function () {
            if (installing.state === 'installed' && navigator.serviceWorker.controller) {
              installing.postMessage({ type: 'SKIP_WAITING' });
            }
          });
        });
      }).catch(function () {});
      // 更新部署后刷新时，弹一次「已更新最新版本」小气泡（仅 SW 接管触发的刷新才会触发）
      if (navigator.serviceWorker.ready) navigator.serviceWorker.ready.then(maybeShowUpdateToast).catch(function () {});
    }
    const cached = CBStore.getCached();
    if (cached) { content = cached; paint(); }            // 缓存优先：即时渲染
    CBStore.fetchContent({
      onUpdate: function (fresh) { content = fresh; paint(); syncUpdateNotice(); }
    }).then(function (fresh) {
      if (!cached) { content = fresh; paint(); }          // 首访无缓存才在此首次绘制
      syncUpdateNotice();
    });
    // 首屏绘制后，后台静默预载工具引擎（不阻塞首屏）；这样点开小工具时通常已就绪、零等待
    ensureTools();
    handleInstall();
  }

  function bindTabs() {
    document.querySelectorAll('.tab').forEach(function (b) {
      b.addEventListener('click', function () {
        document.querySelectorAll('.tab').forEach(function (x) { x.classList.remove('active'); });
        b.classList.add('active');
        tab = b.dataset.tab;
        try { sessionStorage.setItem('cb_active_tab', tab); } catch (e) {}
        render();
      });
    });
  }

  // 让底部栏「选中态」与当前 tab 同步（用于刷新 / 恢复会话后高亮正确栏目）
  function syncTabs() {
    document.querySelectorAll('.tab').forEach(function (x) {
      x.classList.toggle('active', x.dataset.tab === tab);
    });
  }

  function render() {
    const main = $('#main');
    if (tab === 'article') renderList(main, 'article', '最新文章');
    else if (tab === 'tech') renderTech(main);
    else renderAbout(main);
  }

  // === 列表搜索 / 置顶折叠：状态与辅助 ===
  const searchState = {};   // 各分类的搜索关键词
  let pinnedOpen = true;    // 置顶卡片是否展开

  // 按关键词匹配：主题(分类)/标题/摘要/正文/标签
  function matchPost(p, kw) {
    const hay = [p.title, p.summary, p.content, p.category, (p.tags || []).join(' ')].join(' ').toLowerCase();
    return hay.indexOf(kw) !== -1;
  }
  // 将一大段正文自动分段为气泡数组（用于文章「聊天界面模式」）：
  // 先按空行/换行切成段落，再对长段落按句末标点切句，避免单气泡过长。
  function segmentToBubbles(text) {
    text = String(text == null ? '' : text);
    if (!text.trim()) return [];
    const out = [];
    const paras = text.split(/\n\s*\n/).map(function (s) { return s.trim(); }).filter(Boolean);
    (paras.length ? paras : [text.trim()]).forEach(function (para) {
      let buf = '';
      for (let i = 0; i < para.length; i++) {
        const ch = para[i];
        buf += ch;
        if ('。！？!?；;…'.indexOf(ch) >= 0) { out.push(buf.trim()); buf = ''; }
      }
      if (buf.trim()) out.push(buf.trim());
    });
    return out.length ? out : [text.trim()];
  }
  // 生成一组帖子卡片（压缩尺寸由 CSS 控制）
  function cardsHtml(list, category) {
    return list.map(function (p) {
      const land = p.coverShape === 'landscape' ? ' land' : '';
      const badge = p.__local ? '<span class="link-local-badge">本地</span>' : '';
      const del = p.__local ? '<button class="link-del" data-pdel="' + esc(p.id) + '">删除</button>' : '';
      const newFlag = isPostNew(p) ? '<span class="post-new-flag">新</span>' : '';
      const cover = p.cover
        ? '<img class="card-cover' + land + '" src="' + esc(p.cover) + '" alt=""/>'
        : '<div class="card-cover' + land + '"></div>';
      return '<div class="card' + land + '" data-id="' + p.id + '">' + cover
        + '<div class="card-body"><div class="card-title">' + esc(p.title) + badge + del + newFlag
        + (p.pinned ? '<span class="pin-flag">置顶</span>' : '') + '</div>'
        + '<p class="card-desc">' + esc(p.summary || '') + '</p></div></div>';
    }).join('');
  }
  // 列表主体（不含搜索栏与本地发帖入口）：有搜索词则过滤，否则分置顶折叠卡 + 普通列表
  function listInnerHtml(category, all, title) {
    const kw = (searchState[category] || '').trim().toLowerCase();
    let html = '<div class="section-title">' + title + '</div>';
    if (kw) {
      const matched = all.filter(function (p) { return matchPost(p, kw); });
      html += matched.length ? cardsHtml(matched, category) : '<div class="empty">没有匹配的内容</div>';
      return html;
    }
    const pinned = all.filter(function (p) { return p.pinned; });
    const others = all.filter(function (p) { return !p.pinned; });
    if (pinned.length) {
      html += '<div class="pinned-card' + (pinnedOpen ? ' open' : '') + '">'
        + '<div class="pinned-head" id="pinnedHead">📌 置顶内容 <span class="pinned-toggle">' + (pinnedOpen ? '▾' : '▸') + '</span></div>'
        + '<div class="pinned-body" id="pinnedBody">' + cardsHtml(pinned, category) + '</div>'
        + '</div>';
    }
    html += others.length ? cardsHtml(others, category) : '<div class="empty">还没有内容，去后台添加吧</div>';
    return html;
  }
  function refreshListBody(main, category) {
    const wrap = main.querySelector('#postListWrap');
    if (!wrap) return;
    const all = CBStore.publicPosts(content, category).concat(localPostsAll());
    const title = category === 'article' ? '最新文章' : '黑科技 · 文章';
    wrap.innerHTML = listInnerHtml(category, all, title);
    bindCards(main);
    bindPinnedToggle(main, category);
  }
  function bindSearch(main, category) {
    const input = main.querySelector('#postSearch');
    if (!input) return;
    input.addEventListener('input', function () {
      searchState[category] = input.value;
      refreshListBody(main, category);
    });
  }
  function bindPinnedToggle(main, category) {
    const head = main.querySelector('#pinnedHead');
    if (!head) return;
    head.addEventListener('click', function () {
      pinnedOpen = !pinnedOpen;
      refreshListBody(main, category);
    });
  }
  function bindCards(main) {
    main.querySelectorAll('.card[data-id]').forEach(function (c) {
      c.addEventListener('click', function () { openDetail(c.dataset.id); });
    });
    main.querySelectorAll('[data-pdel]').forEach(function (b) {
      b.addEventListener('click', function (e) {
        e.stopPropagation();
        dropLocalPost(b.dataset.pdel);
        toast('已删除本机内容');
        render();
      });
    });
  }

  function renderList(main, category, title, extraHtml) {
    const all = CBStore.publicPosts(content, category).concat(localPostsAll());
    const kw = (searchState[category] || '').trim().toLowerCase();
    let html = (category === 'article'
      ? '<div class="post-search"><input id="postSearch" class="post-search-input" type="search" enterkeyhint="search" placeholder="搜索主题、标题或内容…" value="' + esc(searchState[category] || '') + '"/></div>'
      : '')
      + '<div id="postListWrap">' + listInnerHtml(category, all, title) + '</div>';
    // 非文章分类（黑科技）在无搜索词时追加工具/链接区；有搜索词则只显示匹配文章
    if (extraHtml && !kw) html += extraHtml;
    if (category === 'article') html += localPostComposerHtml();
    main.innerHTML = html;
    bindSearch(main, category);
    bindCards(main);
    bindPinnedToggle(main, category);
    bindLocalPostComposer();   // 修复：该函数此前已定义却未调用，导致文章列表底部「＋ 本地」点不开
  }

  // 隐蔽的本地发帖表单（与后台发帖字段一致：标题/分类/摘要/正文/封面/置顶）
  function localPostComposerHtml() {
    let open = false;
    try { open = localStorage.getItem('cb_local_post_open') === '1'; } catch (e) {}
    return '<div class="local-post-box" id="localPostBox">'
      + '<button class="local-post-trigger' + (open ? '' : ' closed') + '" id="localPostTrigger">＋ 本地</button>'
      + '<div class="local-post-body" id="localPostBody"' + (open ? '' : ' style="display:none"') + '>'
      + '<div class="field"><label>标题</label><input type="text" id="po_title" placeholder="文章标题"/></div>'
      + '<div class="field"><label>分类</label><select id="po_cat" class="link-group-sel"><option value="article">文章</option><option value="tech">黑科技</option></select></div>'
      + '<div class="field"><label>摘要</label><input type="text" id="po_sum" placeholder="一句话摘要（可选）"/></div>'
      + '<div class="field"><label>正文（支持换行）</label><textarea id="po_content" placeholder="正文内容…"></textarea></div>'
      + '<div class="field"><label>封面图（可选）</label><input type="file" id="po_cover" accept="image/*"/><img class="cover-preview" id="po_cover_prev" style="display:none"/></div>'
      + '<div class="field"><label>封面展示方式</label><div class="seg" id="po_shape">'
      + '<button type="button" data-v="square" class="active">⬜ 正方形</button>'
      + '<button type="button" data-v="landscape">▭ 横屏宽幅（红框）</button></div></div>'
      + '<div class="checkbox-row"><input type="checkbox" id="po_pinned"/><label for="po_pinned">置顶（显示在该分类顶部）</label></div>'
      + '<div class="row"><button class="btn" id="po_save">保存到本机</button></div>'
      + '<p class="local-tip">仅保存在这台设备的浏览器里，以后更新发布内容不会覆盖；换设备/清缓存会丢失。</p>'
      + '</div></div>';
  }

  function bindLocalPostComposer() {
    const box = $('#localPostBox');
    if (!box) return;
    const trigger = $('#localPostTrigger'), body = $('#localPostBody');
    trigger.addEventListener('click', function () {
      const willOpen = body.style.display === 'none';
      body.style.display = willOpen ? '' : 'none';
      trigger.classList.toggle('closed', !willOpen);
      try { localStorage.setItem('cb_local_post_open', willOpen ? '1' : '0'); } catch (e) {}
    });
    const ipt = $('#po_cover'), prev = $('#po_cover_prev');
    let coverData = '';
    let shapeData = 'square';
    const shapeSeg = $('#po_shape');
    if (shapeSeg) {
      shapeSeg.querySelectorAll('button').forEach(function (b) {
        b.addEventListener('click', function () {
          shapeData = b.dataset.v;
          shapeSeg.querySelectorAll('button').forEach(function (x) { x.classList.remove('active'); });
          b.classList.add('active');
        });
      });
    }
    ipt.addEventListener('change', async function () {
      const f = ipt.files && ipt.files[0];
      if (!f) return;
      try {
        coverData = await CBStore.fileToResizedDataURL(f);
        prev.src = coverData; prev.style.display = '';
      } catch (e) {}
    });
    $('#po_save').addEventListener('click', function () {
      const title = $('#po_title').value.trim();
      if (!title) { toast('标题不能为空'); return; }
      const now = new Date().toISOString();
      const arr = localPosts();
      arr.push({
        id: 'lp_' + CBStore.uid(),
        title: title,
        category: $('#po_cat').value,
        summary: $('#po_sum').value.trim(),
        content: $('#po_content').value,
        cover: coverData,
        coverShape: shapeData,
        pinned: $('#po_pinned').checked,
        createdAt: now, updatedAt: now
      });
      setLocalPosts(arr);
      toast('已保存到本机');
      try { localStorage.setItem('cb_local_post_open', '1'); } catch (e) {}
      render();
    });
  }

  // ===== 本地快捷方式：只存本机 localStorage，后台发布更新不会覆盖 =====
  const LK_KEY = 'cb_local_links';
  const LG_KEY = 'cb_local_groups';
  const LO_KEY = 'cb_local_open';
  const LP_KEY = 'cb_local_posts';
  function localLinks() {
    try { return JSON.parse(localStorage.getItem(LK_KEY) || '[]') || []; } catch (e) { return []; }
  }
  function localGroups() {
    try { return JSON.parse(localStorage.getItem(LG_KEY) || '[]') || []; } catch (e) { return []; }
  }
  function setLocalLinks(a) { try { localStorage.setItem(LK_KEY, JSON.stringify(a)); } catch (e) {} }
  function setLocalGroups(a) { try { localStorage.setItem(LG_KEY, JSON.stringify(a)); } catch (e) {} }
  function dropLocalLink(id) { setLocalLinks(localLinks().filter(function (x) { return x.id !== id; })); }
  // 本地文章：仅存本机，后台发布/覆盖 content.json 不影响
  function localPosts() {
    try { return JSON.parse(localStorage.getItem(LP_KEY) || '[]') || []; } catch (e) { return []; }
  }
  function localPostsAll() {
    return localPosts().map(function (p) { const o = Object.assign({}, p); o.__local = true; return o; });
  }
  function setLocalPosts(a) { try { localStorage.setItem(LP_KEY, JSON.stringify(a)); } catch (e) {} }
  function dropLocalPost(id) { setLocalPosts(localPosts().filter(function (x) { return x.id !== id; })); }

  let techToolsCfg = [];   // 供 bindTechExtra 的磁贴点击查找工具配置

  // 黑科技栏的「工具集合 / 链接分组 / 小工具 / 本地快捷方式」区（不含文章列表），供搜索栏接入
  function techExtraHtml() {
    const showTools = (content.config && content.config.showTools !== false);
    let toolsCfg = (content.config && content.config.tools);
    if (!Array.isArray(toolsCfg) || !toolsCfg.length) {
      // 兜底：配置文件缺 tools 时，默认展示全部内置工具，避免误隐藏
      toolsCfg = (window.CBTools ? CBTools.engines() : []).map(function (e, i) {
        return { id: 't_' + e.id, name: e.name, engine: e.id, enabled: true, order: i + 1 };
      });
    }
    techToolsCfg = toolsCfg;
    // 公开配置里的链接 + 本机自己添加的链接，合并后一起展示
    const cfgLinks = (content.config && content.config.links) || [];
    const cfgGroups = (content.config && content.config.linkGroups) || [];
    const myGroups = localGroups();
    const myLinks = localLinks().map(function (l) { const o = Object.assign({}, l); o.__local = true; return o; });
    const links = cfgLinks.concat(myLinks);
    const groups = cfgGroups.concat(myGroups);
    let html = '';
    function linkCard(lk) {
      const safeUrl = /^https?:\/\//i.test(lk.url || '') ? lk.url : '#';
      const ic = lk.icon ? '<img class="link-ic" src="' + esc(lk.icon) + '" alt=""/>' : '';
      const badge = lk.__local ? '<span class="link-local-badge">本地</span>' : '';
      const del = lk.__local ? '<button class="link-del" data-lid="' + esc(lk.id) + '">删除</button>' : '';
      // 影视类分组（影视/视频/TV 等）：走应用内观看页，支持横屏全屏，避免跳外部后无法控制全屏方向
      const inWatch = (function () {
        const g = groups.find(function (x) { return x.id === lk.groupId; });
        return !!g && /影视|视频|tv|电影|追剧|影视合集|影音/i.test(g.name || '');
      })();
      const href = inWatch ? ('watch.html?url=' + encodeURIComponent(safeUrl) + '&name=' + encodeURIComponent(lk.title || '影视')) : safeUrl;
      const linkAttr = inWatch ? '' : ' target="_blank" rel="noopener noreferrer"';
      return '<a class="card link-item" href="' + esc(href) + '"' + linkAttr + '>'
        + (ic ? '<div class="link-ic-wrap">' + ic + '</div>' : '')
        + '<div class="card-body">'
        + '<div class="card-title">' + esc(lk.title) + badge + '</div>'
        + (lk.description ? '<p class="card-desc">' + esc(lk.description) + '</p>' : '')
        + (lk.showUrl !== false ? '<p class="card-desc">' + esc(lk.url) + '</p>' : '') + '</div>'
        + '<div class="row" style="flex:none;align-items:center;gap:8px">' + del
        + '<span class="pin-flag">打开 ↗</span></div></a>';
    }
    // 合集折叠块：默认展开；点击标题头展开/收拢，状态存 localStorage 记忆
    function groupBlock(gid, gname, items) {
      let collapsed = false;
      try { collapsed = localStorage.getItem('cb_grp_' + gid) === '1'; } catch (e) {}
      return '<div class="link-group" data-gid="' + esc(gid) + '">'
        + '<div class="link-group-head' + (collapsed ? ' closed' : '') + '">'
        + '<span class="link-group-title">' + esc(gname) + '</span>'
        + '<span class="link-group-count">' + items.length + '</span>'
        + '<span class="link-group-arrow">▼</span></div>'
        + '<div class="link-group-body"' + (collapsed ? ' style="display:none"' : '') + '>'
        + items.map(function (l) { return linkCard(l); }).join('')
        + '</div></div>';
    }
    if (links.length) {
      html += '<div class="section-title">🔥 热门工具集合</div>';
      if (groups.length) {
        const sorted = groups.slice().sort(function (a, b) { return (a.order || 0) - (b.order || 0); });
        sorted.forEach(function (g) {
          const gl = links.filter(function (l) { return l.groupId === g.id; })
            .sort(function (a, b) { return (a.order || 0) - (b.order || 0); });
          if (gl.length) html += groupBlock(g.id, g.name, gl);
        });
        const ungr = links.filter(function (l) {
          return !l.groupId || !groups.some(function (g) { return g.id === l.groupId; });
        }).sort(function (a, b) { return (a.order || 0) - (b.order || 0); });
        if (ungr.length) html += groupBlock('other', '其他', ungr);
      } else {
        links.slice().sort(function (a, b) { return (a.order || 0) - (b.order || 0); })
          .forEach(function (l) { html += linkCard(l); });
      }
    }
    // 小工具区块：移到黑科技栏底部，默认收起；展开为两列磁贴网格（点磁贴弹窗打开工具，保持页面整洁）
    if (showTools && toolsCfg.length) {
      let tc = true;
      try { tc = localStorage.getItem('cb_grp_tools') !== '0'; } catch (e) {}
      const enabledTools = toolsCfg.filter(function (t) { return t.enabled !== false; });
      const tiles = enabledTools.map(function (t) {
        return '<div class="tool-tile" data-tool="' + esc(t.id) + '">' + esc(t.name) + '</div>';
      }).join('');
      html += '<div class="link-group" data-gid="tools">'
        + '<div class="link-group-head' + (tc ? ' closed' : '') + '">'
        + '<span class="link-group-title">黑科技 · 小工具</span>'
        + '<span class="link-group-count">' + enabledTools.length + '</span>'
        + '<span class="link-group-arrow">▼</span></div>'
        + '<div class="link-group-body"' + (tc ? ' style="display:none"' : '') + '>'
        + '<div id="toolsRoot" class="tools-tiles">' + tiles + '</div>'
        + '</div></div>';
    }
    // 黑科技栏最底部：本地快捷方式入口（默认折叠，点标题展开）
    html += localEntryHtml(groups);
    return html;
  }

  function bindTechExtra(main) {
    bindLocalBox();
    // 合集折叠交互
    main.querySelectorAll('.link-group-head').forEach(function (h) {
      h.addEventListener('click', function () {
        const grp = h.closest('.link-group');
        const body = grp.querySelector('.link-group-body');
        const willOpen = body.style.display === 'none';
        body.style.display = willOpen ? '' : 'none';
        h.classList.toggle('closed', !willOpen);
        try { localStorage.setItem('cb_grp_' + grp.dataset.gid, willOpen ? '0' : '1'); } catch (e) {}
      });
    });
    // 小工具磁贴：点击在弹窗里打开该工具（保持黑科技栏整洁，避免长列表扎堆）
    main.querySelectorAll('.tool-tile').forEach(function (tile) {
      tile.addEventListener('click', function () {
        const cfg = techToolsCfg.find(function (t) { return t.id === tile.dataset.tool; });
        if (cfg) openTool(cfg);
      });
    });
    // 本地链接卡片上的「删除」按钮（阻止默认导航与冒泡，避免同时打开网址）
    main.querySelectorAll('.link-del').forEach(function (b) {
      b.addEventListener('click', function (e) {
        e.preventDefault();
        e.stopPropagation();
        dropLocalLink(b.dataset.lid);
        render();
      });
    });
  }

  function renderTech(main) {
    const extra = techExtraHtml();
    renderList(main, 'tech', '黑科技 · 文章', extra);
    bindTechExtra(main);
  }

  // 本地快捷方式入口块：低调的小字入口 + 折叠面板（后台「网址快捷方式」同款字段：名称/网址/介绍/图标/合集）
  function localEntryHtml(allGroups) {
    let open = false;
    try { open = localStorage.getItem(LO_KEY) === '1'; } catch (e) {}
    const opts = (allGroups || []).map(function (g) {
      return '<option value="' + esc(g.id) + '">' + esc(g.name) + '</option>';
    }).join('');
    const mine = localLinks();
    let rows = mine.length ? '' : '<div class="empty">还没有本地快捷方式</div>';
    mine.forEach(function (l) {
      rows += '<div class="local-row">'
        + (l.icon ? '<img class="local-row-ic" src="' + esc(l.icon) + '" alt=""/>' : '<div class="local-row-ic"></div>')
        + '<div class="local-row-main"><div class="local-row-title">' + esc(l.title) + '</div>'
        + '<div class="local-row-url">' + esc(l.url) + '</div></div>'
        + '<button class="mini-btn" data-ldel="' + esc(l.id) + '">删除</button></div>';
    });
    return '<div class="local-box" id="localBox">'
      + '<div class="local-head' + (open ? '' : ' closed') + '" id="localHead">'
      + '<span>＋ 本地快捷方式</span>'
      + '<span class="local-count">' + mine.length + '</span>'
      + '<span class="local-arrow">▼</span></div>'
      + '<div class="local-body" id="localBody"' + (open ? '' : ' style="display:none"') + '>'
      + '<p class="local-tip">仅保存在这台设备上（不上传、不进后台），以后更新发布内容也不会被覆盖；换设备/清缓存会丢失。</p>'
      + '<div class="field"><label>名称</label><input type="text" id="lo_title" placeholder="如：我的博客"/></div>'
      + '<div class="field"><label>网址（需以 http:// 或 https:// 开头）</label><input type="text" id="lo_url" placeholder="https://..."/></div>'
      + '<div class="field"><label>链接介绍（可选）</label><input type="text" id="lo_desc" placeholder="一句话描述这个链接"/></div>'
      + '<div class="field"><label>图标（可选，建议 256×256）</label><input type="file" id="lo_icon" accept="image/*"/>'
      + '<img class="cover-preview" id="lo_icon_prev" style="display:none"/></div>'
      + '<div class="field"><label>加入合集</label><select id="lo_group" class="link-group-sel">'
      + '<option value="">（不分组）</option>' + opts + '<option value="__new">＋ 新建合集…</option></select>'
      + '<input type="text" id="lo_gname" placeholder="新合集名称" style="display:none;margin-top:8px"/></div>'
      + '<div class="row"><button class="btn" id="lo_add">添加到本机</button></div>'
      + '<div class="local-list">' + rows + '</div>'
      + '</div></div>';
  }

  function bindLocalBox() {
    const head = $('#localHead');
    if (!head) return;
    const body = $('#localBody');
    head.addEventListener('click', function () {
      const willOpen = body.style.display === 'none';
      body.style.display = willOpen ? '' : 'none';
      head.classList.toggle('closed', !willOpen);
      try { localStorage.setItem(LO_KEY, willOpen ? '1' : '0'); } catch (e) {}
    });
    const gsel = $('#lo_group'), gname = $('#lo_gname');
    gsel.addEventListener('change', function () {
      gname.style.display = (gsel.value === '__new') ? '' : 'none';
    });
    const ipt = $('#lo_icon'), prev = $('#lo_icon_prev');
    let iconData = '';
    ipt.addEventListener('change', async function () {
      const f = ipt.files && ipt.files[0];
      if (!f) return;
      try {
        iconData = await CBStore.fileToResizedDataURL(f, 256, 0.9);
        prev.src = iconData;
        prev.style.display = '';
      } catch (e) {}
    });
    $('#lo_add').addEventListener('click', function () {
      const title = $('#lo_title').value.trim();
      const url = $('#lo_url').value.trim();
      if (!title || !/^https?:\/\//i.test(url)) { toast('请填写名称，且网址以 http:// 或 https:// 开头'); return; }
      let gid = gsel.value;
      if (gid === '__new') {
        const nm = gname.value.trim();
        if (!nm) { toast('请填写新合集名称'); return; }
        const gs = localGroups();
        const g = { id: 'lg_' + CBStore.uid(), name: nm, order: gs.length + 1 };
        gs.push(g);
        setLocalGroups(gs);
        gid = g.id;
      }
      const arr = localLinks();
      arr.push({
        id: 'll_' + CBStore.uid(), title: title, url: url,
        description: $('#lo_desc').value.trim(), icon: iconData, groupId: gid || ''
      });
      setLocalLinks(arr);
      toast('已添加到本机');
      try { localStorage.setItem(LO_KEY, '1'); } catch (e) {}
      render();
    });
    document.querySelectorAll('[data-ldel]').forEach(function (b) {
      b.addEventListener('click', function () {
        dropLocalLink(b.dataset.ldel);
        toast('已删除');
        render();
      });
    });
  }

  function renderAbout(main) {
    const author = (content.config && content.config.author) || { name: '作者', intro: '这里是关于作者的介绍，可在后台「站点设置」里编辑。' };
    // 「关于本应用」说明：后台可自定义，未填则用默认文案
    const aboutAppText = (content.config && content.config.aboutApp)
      ? escNl(content.config.aboutApp)
      : '这是一个可安装到手机的 PWA 内容 App。联网更新内容并重新打开即可同步，无需云端账号。';
    // 说明全文展示（.card-desc 只显示两行，这里用 .about-text 完整换行显示）
    // 公开端外观主题切换开关（放在「关于」页最上方）：读取用户本机选择，未选则跟随后台默认
    const baseTheme = (content.config && content.config.theme) || {};
    const swDark = (userDimChoice() === null) ? !!baseTheme.dimMode : userDimChoice();
    const themeSwHtml = '<div class="theme-sw-card">'
      + '<div class="ts-row">'
      + '<span class="ts-ic">🎨</span>'
      + '<span class="ts-label">外观主题</span>'
      + '<span class="ts-mode" id="tsMode">' + (swDark ? '暗调' : '浅色') + '</span>'
      + '<label class="switch"><input type="checkbox" id="themeToggle"' + (swDark ? ' checked' : '') + '><span class="slider"></span></label>'
      + '</div>'
      + '<p class="ts-tip">选「暗调」即套用后台已调好的暗调参数；选择会记住在本机</p>'
      + '</div>';
    main.innerHTML = themeSwHtml
      + '<div class="tool"><h3>关于本应用</h3>'
      + '<div class="about-text">' + aboutAppText + '</div></div>'
      + '<button class="author-entry" id="authorEntry">作者：' + esc(author.name || '酷白.Abai') + '</button>'
      + '<div class="author-panel" id="authorPanel" style="display:none">'
      + '<div class="author-card">'
      + '<div class="author-name">' + esc(author.name || '作者') + '</div>'
      + '<div class="author-intro">' + escNl(author.intro || '') + '</div>'
      + '<a class="admin-mini" href="admin.html?key=nebadmin2026">Hi</a>'
      + '</div></div>';
    $('#authorEntry').addEventListener('click', function () {
      const p = $('#authorPanel');
      p.style.display = (p.style.display === 'none') ? 'block' : 'none';
    });

    // 安装 APP 区块（关于页底部）：美化布局 + 文案可后台自定义
    const apkUrl = (content.config && content.config.apkUrl) || '';
    const isWx = /micromessenger/i.test(navigator.userAgent);   // 微信内置浏览器无法直下 apk
    const isIOS = !isWx && /iphone|ipad|ipod/i.test(navigator.userAgent);  // iOS 不支持直下 apk，需「添加到主屏幕」
    // 是否运行在原生 App 内嵌的 WebView 中（如 ToAPP 打包的 APK、微信/QQ 内置浏览器等）。
    // 依据：标准 Android WebView 的 UA 必含 "; wv)" 标记，而普通手机浏览器（Chrome/Safari）无此标记。
    // 在 WebView 内隐藏「下载 APK」入口，消除「APK 内诱导下载 APK」的闭环，降低应用商店安全扫描误报。
    const isWebView = /;\s*wv\)/.test(navigator.userAgent);
    const installText = (content.config && content.config.installText)
      ? escNl(content.config.installText)
      : '手机浏览器打开本页，点上方按钮即可安装到主屏；若已配置 APK 链接，可直接下载安装包，离线也能用。';
    const subText = isWebView
      ? '你正在 App 内使用本应用，内容已自动同步，无需再次安装。'
      : (isIOS
        ? '苹果设备无需下载安装包，用 Safari 打开本页后「添加到主屏幕」，即可像 App 一样使用。'
        : installText);
    const wxTip = isWx
      ? '<div class="wx-tip">⚠️ 微信内不支持直接下载安装包，请点击右上角 <b>···</b> → <b>在浏览器中打开</b>，再点「一键安装」即可下载。</div>'
      : '';
    const iosTip = isIOS
      ? '<div class="ios-tip">🍎 苹果设备暂不支持下载安装包。请用 <b>Safari</b> 打开本页 → 点底部「分享」图标 → <b>添加到主屏幕</b>，即可像 App 一样使用。</div>'
      : '';
    // WebView 内不渲染「下载 APK」按钮与二维码（避免被应用商店判定为 APK 内诱导下载），改为提示已安装
    const installBtnLabel = isIOS ? '➕ 添加到主屏幕' : '📲 一键安装';
    const installActions = isWebView
      ? '<div class="install-actions"><div class="inapp-tip">✅ 你已在 App 内打开，无需重复安装</div></div>'
      : '<div class="install-actions"><button class="btn install-app-btn" id="installAppBtn">' + installBtnLabel + '</button></div>'
        + '<div class="qr-wrap"><div class="qr" id="aboutQr"></div>'
        + '<p class="card-desc" style="text-align:center;font-size:12px;margin:8px 0 0">手机扫码在浏览器打开下载页</p></div>';
    let installHtml = '<div class="section-title">📲 安装 APP</div>'
      + '<div class="install-mini' + (isWx ? ' wx' : (isIOS ? ' ios' : '')) + '">'
      + '<div class="install-top"><div class="install-icon">📱</div>'
      + '<div class="install-head"><div class="install-name">安装到手机</div>'
      + '<div class="install-sub">' + subText + '</div></div></div>'
      + wxTip + iosTip
      + installActions
      + '</div>';
    main.insertAdjacentHTML('beforeend', installHtml);

    // 关于页底部：显示与部署 SW 同步的版本号（V + 数字，无多余文字）
    main.insertAdjacentHTML('beforeend', '<div class="app-version" id="appVersion">V…</div>');

    resolveAppVersion().then(function (v) {
      const el = $('#appVersion');
      if (el) el.textContent = 'V' + (swVersionNum(v) || '?');
    });

    if (!isWebView) {
      $('#installAppBtn').addEventListener('click', function () {
        // 微信 / 苹果优先给对应引导；其余网页端一律跳后台配置的 apkUrl（现为引导页）。
        // 不能让 beforeinstallprompt 抢先触发 PWA 安装，否则点「一键安装」不会跳引导页。
        if (isWx) { toast('请点右上角 ··· 在浏览器中打开本页后再下载'); return; }
        if (isIOS) { showAddHomeGuide(); return; }
        // 【v79】跳引导页时直接「替换」当前内容界面（location.replace），不再把内容页
        // 留在历史栈里，按返回键回不到内容界面；已装到桌面的 PWA 则用系统浏览器新开
        // 独立下载页，避免引导页被套在内容 App 的界面里显示。
        if (apkUrl) {
          const standalone = (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches)
            || window.navigator.standalone === true;
          if (standalone) {
            const w = window.open(apkUrl, '_blank');
            if (!w) location.replace(apkUrl);   // 弹窗被拦截时兜底
          } else {
            location.replace(apkUrl);
          }
          return;
        }
        if (window.__installPrompt) { installNow(); return; }
        toast('请用浏览器菜单「安装 / 添加到主屏幕」');
      });
      // 二维码编码「下载引导页」：普通网页链接，不会被微信/QQ 等扫码工具拦截（之前直接用 .apk 直链会提示「停止访问」）
      // qrcode.js 已从首屏剥离，这里按需异步加载后再渲染（仅访问关于页时才拉取，不拖累首屏）
      // 二维码必须编码正式站点地址：后台 / 预览容器里 location.origin 可能是 127.0.0.1，扫出来是无效链接
      const aboutQrUrl = 'https://content-box-24323.app.workbuddy.host/?sharecode=AK6QIELR67&to=install';
      ensureQrcode().then(function () {
        try {
          const qr = qrcode(0, 'M');
          qr.addData(aboutQrUrl);
          qr.make();
          const qe = $('#aboutQr');
          if (qe) qe.innerHTML = '<img src="' + qr.createDataURL(5, 2) + '" alt="qr"/>';
        } catch (e) {}
      }).catch(function () {});
      // 扫码引导进入时，聚焦安装区并轻微高亮，方便用户立即下载
      try {
        if (new URLSearchParams(location.search).get('to') === 'install') {
          setTimeout(function () {
            const b = $('#installAppBtn');
            if (b) { b.scrollIntoView({ behavior: 'smooth', block: 'center' }); b.classList.add('focus-pulse'); }
          }, 350);
        }
      } catch (e) {}
    }

    // 公开端外观主题开关：浅色 / 暗调 切换（暗调套用后台参数），选择记住在本机
    const tgl = $('#themeToggle');
    if (tgl) tgl.addEventListener('change', function () {
      const on = this.checked;
      try { localStorage.setItem('cb_user_dim', on ? '1' : '0'); } catch (e) {}
      applyEffectiveTheme();
      const m = $('#tsMode'); if (m) m.textContent = on ? '暗调' : '浅色';
    });
  }

  // 苹果设备「添加到主屏幕」引导弹层（iOS 不支持直接安装 APK，需 Safari 分享 → 添加到主屏幕）
  function showAddHomeGuide() {
    var mask = document.getElementById('iosGuideMask');
    if (!mask) {
      mask = document.createElement('div');
      mask.className = 'ios-guide-mask';
      mask.id = 'iosGuideMask';
      mask.innerHTML = '<div class="ios-guide-card">'
        + '<div class="ios-guide-title">📱 添加到主屏幕</div>'
        + '<div class="ios-guide-sub">苹果设备不支持直接安装安装包。按以下步骤把本应用添加到主屏幕，即可像 App 一样离线使用：</div>'
        + '<ol class="ios-guide-steps">'
        + '<li>点击 Safari 底部工具栏的 <b>分享</b> 图标（⬆️ 方框带向上箭头）</li>'
        + '<li>在弹出菜单中下滑，点击 <b>「添加到主屏幕」</b></li>'
        + '<li>点击右上角 <b>「添加」</b>，完成</li>'
        + '</ol>'
        + '<button class="ios-guide-close" id="iosGuideClose">我知道了</button></div>';
      document.body.appendChild(mask);
      mask.addEventListener('click', function (e) { if (e.target === mask) mask.classList.add('hide'); });
      var closeBtn = document.getElementById('iosGuideClose');
      if (closeBtn) closeBtn.onclick = function () { mask.classList.add('hide'); };
    }
    mask.classList.remove('hide');
  }

  function escNl(s) {
    return esc(s == null ? '' : s).replace(/\n/g, '<br>');
  }

  function openDetail(id) {
    const p = (content.posts || []).find(function (x) { return x.id === id; })
      || localPosts().find(function (x) { return x.id === id; });
    if (!p) return;
    markPostSeen(p);
    const cardEl = document.querySelector('.card[data-id="' + id + '"]');
    if (cardEl) { const f = cardEl.querySelector('.post-new-flag'); if (f) f.remove(); }
    const body = $('#ovBody');
    const land = p.coverShape === 'landscape' ? ' land' : '';
    if (p.displayMode === 'chat') {
      let segs = (Array.isArray(p.chatSegments) && p.chatSegments.length)
        ? p.chatSegments.slice()
        : segmentToBubbles(p.content || '');
      if (p.chatBubbleOrder === 'reverse') segs = segs.slice().reverse();
      const avatar = (p.cover)
        ? '<img class="chat-av" src="' + esc(p.cover) + '" alt=""/>'
        : (content.config && content.config.icon)
          ? '<img class="chat-av" src="' + esc(content.config.icon) + '" alt=""/>'
          : '<div class="chat-av chat-av-def">🤖</div>';
      const bubbles = segs.map(function (s) {
        return '<div class="chat-row"><div class="chat-av-wrap">' + avatar + '</div>'
          + '<div class="chat-bubble">' + esc(s) + '</div></div>';
      }).join('');
      body.innerHTML = '<div class="chat-view">'
        + '<div class="chat-head">'
        + '<div class="chat-head-title">' + esc(p.title) + '</div>'
        + (p.summary ? '<div class="chat-head-key">🔑 ' + esc(p.summary) + '</div>' : '')
        + '<div class="chat-head-meta">' + (p.category === 'tech' ? '黑科技' : '文章') + ' · ' + fmtDate(p.updatedAt) + '</div>'
        + '</div>'
        + '<div class="chat-bubbles">' + bubbles + '</div>'
        + '</div>';
    } else {
      body.innerHTML = (p.cover ? '<img class="article-cover' + land + '" src="' + p.cover + '"/>' : '')
        + '<h1 class="article-h1">' + esc(p.title) + '</h1>'
        + '<div class="article-meta">' + (p.category === 'tech' ? '黑科技' : '文章') + ' · ' + fmtDate(p.updatedAt) + '</div>'
        + '<div class="article-content">' + esc(p.content || '') + '</div>';
    }
    $('#overlay').classList.add('show');
    body.scrollTop = 0;
    // 压入一条历史：让手机/全屏模式按返回键时只关闭浮层，而不是退出 App
    if (!history.state || !history.state.ov) {
      history.pushState({ ov: 1 }, '');
    }
  }

  function closeDetail() {
    if ($('#overlay').classList.contains('show')) {
      $('#overlay').classList.remove('show');
      $('#ovBody').scrollTop = 0;
    }
  }

  // 小工具弹窗：点黑科技栏磁贴时在独立浮层里打开该工具（保持黑科技栏整洁）
  async function openTool(toolCfg) {
    const pop = $('#toolPop');
    if (!pop) return;
    $('#tpTitle').textContent = toolCfg.name || '工具';
    const body = $('#tpBody');
    body.innerHTML = '<p class="card-desc">加载中…</p>';
    pop.classList.add('show');
    $('#toolPopMask').classList.add('show');
    if (!history.state || !history.state.tm) history.pushState({ tm: 1 }, '');
    // 按需加载工具引擎（首屏已剥离，打开时才拉），二维码工具额外需要 qrcode.js
    await ensureTools();
    if (toolCfg.engine === 'qrcode') {
      try { await ensureScript('js/qrcode.js?sharecode=AK6QIELR67'); } catch (e) {}
    }
    body.innerHTML = '';
    // 强制 enabled，避免被 CBTools.render 的过滤器吞掉导致空白
    const cfg = Object.assign({}, toolCfg, { enabled: true });
    if (window.CBTools) CBTools.render(body, [cfg]);
    else body.innerHTML = '<p class="card-desc">工具引擎加载失败</p>';
  }
  function closeToolModal() {
    const pop = $('#toolPop');
    if (pop) pop.classList.remove('show');
    const mask = $('#toolPopMask');
    if (mask) mask.classList.remove('show');
  }

  function handleInstall() {
    const banner = $('#installBanner');
    window.addEventListener('beforeinstallprompt', function (e) {
      e.preventDefault();
      deferredPrompt = e;
      window.__installPrompt = e;
      banner.classList.add('show');
    });
    $('#installBtn').addEventListener('click', installNow);
    window.addEventListener('appinstalled', function () { banner.classList.remove('show'); window.__installPrompt = null; });
  }

  async function installNow() {
    if (!window.__installPrompt) { toast('请用浏览器菜单「安装 / 添加到主屏幕」'); return; }
    window.__installPrompt.prompt();
    try { await window.__installPrompt.userChoice; } catch (e) {}
    window.__installPrompt = null;
    $('#installBanner').classList.remove('show');
  }

  // 顶部返回按钮：与系统返回键一致，优先回退历史（关闭浮层）而非退出
  const ovBack = $('#ovBack');
  if (ovBack) ovBack.addEventListener('click', function () {
    if (history.state && history.state.ov) history.back();
    else closeDetail();
  });
  // 小工具气泡关闭按钮：直接关闭，并补一次 history.back 回退浮层状态
  const tpClose = $('#tpClose');
  if (tpClose) tpClose.addEventListener('click', function () {
    closeToolModal();
    if (history.state && history.state.tm) history.back();
  });
  // 点击遮罩关闭气泡
  const toolPopMask = $('#toolPopMask');
  if (toolPopMask) toolPopMask.addEventListener('click', function () {
    closeToolModal();
    if (history.state && history.state.tm) history.back();
  });
  // 系统返回键 / 手势：若气泡打开则关闭，否则交给浏览器（退出）默认行为
  window.addEventListener('popstate', function () {
    if ($('#toolPop') && $('#toolPop').classList.contains('show')) { closeToolModal(); return; }
    if (history.state && history.state.ov) return; // 仍在文章浮层态，忽略
    closeDetail();
  });

  init();
})();
