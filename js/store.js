(function (global) {
  // 数据层：同域 content.json 用于首屏秒开，GitHub raw 每次启动后台校验一次全量内容。
  // 【v85 核心修复】恢复「只把 content.json 覆盖到 GitHub 就能同步公开端」的能力：
  // v79~v84 靠两端 meta.json 的 contentHash 差异决定是否拉全量，而手动覆盖 content.json
  // 不会改 meta.json → 指纹相同直接跳过；即便触发，全量只给 3s 超时，1.28MB 跨境基本拉不完。
  // 现在改为无条件异步校验 + 长超时 + 条件请求，内容真变了才写缓存重绘，首屏仍零等待。
  // 【v79 关键修复】托管平台所有静态资源必须带 sharecode 门禁参数，否则返回「链接不完整」HTML，
  // 旧版 './content.json' / './meta.json' 不带门禁 → 所有同域兜底请求其实都拿到 HTML 而静默失败。
  const SC = (function () {
    try { return new URLSearchParams(location.search).get('sharecode') || 'AK6QIELR67'; }
    catch (e) { return 'AK6QIELR67'; }
  })();
  function gate(u) { return u + (u.indexOf('?') >= 0 ? '&' : '?') + 'sharecode=' + encodeURIComponent(SC); }
  const CONTENT_URL = gate('./content.json');
  const CACHE_KEY = 'cb_content_cache_v1';
  const CACHE_HASH_KEY = 'cb_content_hash_v1';
  const DRAFT_KEY = 'cb_admin_draft_v1';

  const GITHUB_CONTENT_URL = 'https://raw.githubusercontent.com/C-Abai/AbaiDeNeiRongHeZi/refs/heads/main/content.json';
  const LOCAL_MS = 6000;       // 同域请求超时上限（正常网络毫秒级返回）
  const REMOTE_MS = 2500;      // 首屏兜底用的短超时（快速失败，绝不拖住首屏 / 登录）
  const REMOTE_FULL_MS = 45000;// 【v86】GitHub 全量 1.28MB 跨境实测：无压缩 24.6s、gzip 11s，
                               // 20s 超时会把刚覆盖的新内容直接丢掉（用户看到「改了没反应」）。
                               // 放宽到 45s；这条链路纯后台 fire-and-forget，给足时间也不影响首屏秒开。

  function withBust(url) { return url + (url.indexOf('?') >= 0 ? '&' : '?') + '_h=' + Date.now(); }

  // 【v79 核心】所有网络请求统一带超时。旧版对 GitHub raw 的 HEAD 请求无超时，
  // 国内网络挂起时 Promise.all 永不完成 → 指纹检测卡死 → localStorage 里 v66 老内容永远不更新，
  // 只能靠反复刷新碰运气。现在任何请求最多等 LOCAL_MS / REMOTE_MS 毫秒。
  function fetchT(url, opts, ms) {
    return new Promise(function (resolve, reject) {
      const ctl = (typeof AbortController !== 'undefined') ? new AbortController() : null;
      const timer = setTimeout(function () { if (ctl) ctl.abort(); reject(new Error('timeout')); }, ms);
      const o = Object.assign({}, opts || {});
      if (ctl) o.signal = ctl.signal;
      fetch(url, o).then(function (r) { clearTimeout(timer); resolve(r); },
                         function (e) { clearTimeout(timer); reject(e); });
    });
  }
  async function fetchJsonT(url, ms) {
    const r = await fetchT(withBust(url), { cache: 'no-store' }, ms);
    if (!r.ok) throw new Error('HTTP ' + r.status);
    const d = await r.json();
    // 门禁失败会返回「链接不完整」HTML，r.json() 会抛错；这里再挡一层非对象响应
    if (!d || typeof d !== 'object' || !d.config) throw new Error('bad payload');
    return d;
  }

  // 【v85】直接拉 GitHub 全量内容，不再依赖 meta.json 指纹。
  // 固定 URL + cache:'no-cache' 触发浏览器条件请求（If-None-Match / 304）：内容没变时
  // 只有一次轻量往返、几乎不耗流量；超时覆盖到 body 读完（fetchT 只覆盖到响应头）。
  // 本函数永远不出现在首屏 / 登录的 await 链路上。
  function fetchGithubContent(ms) {
    return new Promise(function (resolve, reject) {
      const ctl = (typeof AbortController !== 'undefined') ? new AbortController() : null;
      const timer = setTimeout(function () { if (ctl) ctl.abort(); reject(new Error('timeout')); }, ms);
      const o = { cache: 'no-cache' };
      if (ctl) o.signal = ctl.signal;
      fetch(GITHUB_CONTENT_URL, o).then(function (r) {
        if (!r.ok) throw new Error('HTTP ' + r.status);
        return r.json();
      }).then(function (d) {
        clearTimeout(timer);
        if (!d || typeof d !== 'object' || !d.config) throw new Error('bad payload');
        resolve(d);
      }).catch(function (e) { clearTimeout(timer); reject(e); });
    });
  }

  function cacheSet(d) { try { localStorage.setItem(CACHE_KEY, JSON.stringify(d)); } catch (e) {} }
  function cacheStr() { try { return localStorage.getItem(CACHE_KEY) || ''; } catch (e) { return ''; } }

  function seed() {
    return {
      version: 1,
      config: {
        siteTitle: '内容盒子',
        siteDesc: '我的自定义文章与黑科技小工具',
        showTools: true,
        theme: { primary: '#07c160', bg: '#f5f6f8', card: '#ffffff', text: '#1f2329', wallpaper: '', wallpaperBlur: 0, wallpaperOpacity: 100, wallpaperFull: false, dimMode: false, dimLevel: 5, dimCardOpacity: 40, dimBlur: 1, tabDimOpacity: 60, tabDimBlur: 8 },
        tools: [
          { id: 't_base64', name: '🔐 Base64 编解码', engine: 'base64', enabled: true, order: 1 },
          { id: 't_counter', name: '🔢 字数统计', engine: 'counter', enabled: true, order: 2 },
          { id: 't_timestamp', name: '⏱ 时间戳转换', engine: 'timestamp', enabled: true, order: 3 },
          { id: 't_text', name: '📝 文本处理', engine: 'text', enabled: true, order: 4 },
          { id: 't_color', name: '🎨 颜色转换 HEX⇄RGB', engine: 'color', enabled: true, order: 5 },
          { id: 't_qrcode', name: '🔳 二维码生成', engine: 'qrcode', enabled: true, order: 6 },
          { id: 't_filelink', name: '🔗 文件转直链下载', engine: 'filelink', enabled: true, order: 7 }
        ],
        links: [],
        author: { name: '作者', intro: '这里是关于作者的介绍。可以在后台「站点设置」里编辑这一段内容。' },
        apkUrl: '',
        icon: ''
      },
      posts: [
        {
          id: 'p_seed1',
          title: '欢迎使用内容盒子',
          category: 'article',
          summary: '一个可以装进手机的内容 App，文章和黑科技由你自由掌控，联网刷新即可同步。',
          content: '在这里写下你的第一篇内容。\n\n支持多段文字，发布后所有人重开 App 即可看到更新。\n\n同步方式：没有云端账号，内容随站点静态文件刷新——你在后台改好、推上线，别人重开就同步。',
          cover: '',
          pinned: true,
          order: 0,
          published: true,
          createdAt: '2026-10-27T00:00:00.000Z',
          updatedAt: '2026-10-27T00:00:00.000Z'
        },
        {
          id: 'p_seed2',
          title: '如何把 App 装进手机',
          category: 'article',
          summary: '用手机浏览器打开后，点「添加到主屏幕」即可像原生 App 一样使用，还能离线。',
          content: '1. 用手机浏览器打开本应用地址。\n2. 点浏览器菜单中的「添加到主屏幕 / 安装」。\n3. 桌面出现图标，点开即用，可离线访问已加载的内容。',
          cover: '',
          pinned: false,
          order: 1,
          published: true,
          createdAt: '2026-10-27T00:00:00.000Z',
          updatedAt: '2026-10-27T00:00:00.000Z'
        },
        {
          id: 'p_seed3',
          title: '5 个被低估的手机黑科技',
          category: 'tech',
          summary: '随手记几个实用小技巧，配合内置小工具更好用。',
          content: '· 长按图标唤起快捷操作\n· 相册按人物/地点自动分类\n· 键盘文本替换快捷键\n· 专注模式定时免打扰\n· 扫码直达小程序/网页',
          cover: '',
          pinned: false,
          order: 0,
          published: true,
          createdAt: '2026-10-27T00:00:00.000Z',
          updatedAt: '2026-10-27T00:00:00.000Z'
        }
      ]
    };
  }

  // 同步读取本地缓存（供首屏即时渲染，消除重进白屏）
  function getCached() {
    try {
      const s = localStorage.getItem(CACHE_KEY);
      return s ? JSON.parse(s) : null;
    } catch (e) { return null; }
  }

  // 公开端：有缓存立即返回（首屏零等待、不白屏），同时后台并行跑两条刷新链路：
  // ① 同域 content.json（快、稳，用于托管端已部署的内容）
  // ② GitHub 全量内容（慢，但保证「只覆盖仓库 content.json」也能同步）
  // 两条都不参与首屏 await，谁拉到新内容谁重绘；GitHub 优先，避免被稍后到达的旧快照冲掉。
  async function fetchContent(opts) {
    opts = opts || {};
    const cached = getCached();
    // 本次启动的会话状态：GitHub 新内容一旦生效，就别让稍后返回的托管旧快照把它覆盖回去
    const ctx = { ghApplied: false };
    refreshFromLocal(opts, ctx);
    crossCheckGithub(opts, ctx);
    if (cached) return cached;
    // 首次访问无缓存：等同域（8s 超时）→ GitHub raw（2.5s 超时）→ 种子内容
    try { const d = await fetchJsonT(CONTENT_URL, 8000); cacheSet(d); return d; } catch (e) {}
    try { const d = await fetchGithubContent(REMOTE_MS); cacheSet(d); return d; } catch (e) {}
    return seed();
  }

  // 内容确有变化才写缓存 + 重绘，避免无谓的界面抖动。
  // ctx/src 是来源优先级：两条链路并行时，GitHub 版生效后忽略随后到达的托管旧快照，
  // 否则「谁最后返回谁覆盖」，刚同步的新内容会被部署快照冲回去。
  function applyFresh(fresh, opts, ctx, src) {
    if (!fresh) return;
    let s;
    try { s = JSON.stringify(fresh); } catch (e) { return; }
    if (ctx && ctx.ghApplied && src !== 'github') return;
    if (s === cacheStr()) {
      if (src === 'github' && ctx) ctx.ghApplied = true;
      return;
    }
    cacheSet(fresh);
    try { localStorage.setItem(CACHE_HASH_KEY, 'v85-' + s.length); } catch (e) {}
    if (src === 'github' && ctx) ctx.ghApplied = true;
    if (opts && opts.onUpdate) opts.onUpdate(fresh);
  }

  // 同域刷新：每次打开必拉一次（毫秒级）。失败就静默忽略，不拖累首屏；
  // GitHub 全量校验统一由 crossCheckGithub 负责，避免同一时刻发两条重复的大请求。
  function refreshFromLocal(opts, ctx) {
    fetchJsonT(CONTENT_URL, LOCAL_MS)
      .then(function (fresh) { applyFresh(fresh, opts, ctx, 'local'); })
      .catch(function () {});
  }

  // 【v85 修复点】纯异步补充校验：每次启动都向 GitHub 取一次全量内容，
  // 内容确有变化才写缓存 + 重绘。不再比对 meta.json 指纹 ——
  // 手动覆盖仓库 content.json 时用户不会去改 meta.json，旧逻辑会直接跳过、内容永远不更新。
  // 不参与首屏 await；GitHub 不可达 / 超时时静默忽略，同域内容照常可用。
  function crossCheckGithub(opts, ctx) {
    // 跨境链路抖动常见（TLS 失败 / 中途断流）。仅失败时静默重试一次，成功绝不重复请求，
    // 也不会额外产生 1.28MB 流量；重试同样在后台，不参与首屏 / 登录等待。
    function attempt(left) {
      fetchGithubContent(REMOTE_FULL_MS)
        .then(function (fresh) { applyFresh(fresh, opts, ctx, 'github'); })
        .catch(function () {
          if (left > 0) setTimeout(function () { attempt(left - 1); }, 2000);
        });
    }
    attempt(1);
  }

  function safeParse(s) {
    try { return JSON.parse(s); } catch (e) { return null; }
  }

  function sortPosts(posts) {
    return (posts || []).slice().sort((a, b) => {
      if (!!b.pinned !== !!a.pinned) return b.pinned ? 1 : -1;
      if ((b.order || 0) !== (a.order || 0)) return (b.order || 0) - (a.order || 0);
      return (b.updatedAt || '').localeCompare(a.updatedAt || '');
    });
  }

  function publicPosts(data, category) {
    let list = (data.posts || []).filter((p) => p.published !== false);
    if (category) list = list.filter((p) => p.category === category);
    return sortPosts(list);
  }

  // 后台草稿（本机）
  function loadDraft() { try { return JSON.parse(localStorage.getItem(DRAFT_KEY)); } catch (e) { return null; } }
  function saveDraft(data) { try { localStorage.setItem(DRAFT_KEY, JSON.stringify(data)); } catch (e) {} }
  function clearDraft() { localStorage.removeItem(DRAFT_KEY); }

  // 管理员密码固定为 xiaochenge。无改密 / 重置通道，任何人都无法在界面上修改或清除密码。
  const ADMIN_PW = 'xiaochenge';
  async function verifyPassword(pw) { return pw === ADMIN_PW; }

  function uid() { return 'p' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }

  function exportContent(data) {
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'content.json';
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }

  // 图片压缩为 dataURL（控制体积，避免撑爆 localStorage）
  function fileToResizedDataURL(file, maxDim, quality) {
    maxDim = maxDim || 1000; quality = quality || 0.82;
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const img = new Image();
        img.onload = () => {
          let w = img.width, h = img.height;
          if (w > maxDim || h > maxDim) {
            const r = Math.min(maxDim / w, maxDim / h);
            w = Math.round(w * r); h = Math.round(h * r);
          }
          const canvas = document.createElement('canvas');
          canvas.width = w; canvas.height = h;
          canvas.getContext('2d').drawImage(img, 0, 0, w, h);
          resolve(canvas.toDataURL('image/jpeg', quality));
        };
        img.onerror = reject;
        img.src = reader.result;
      };
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }

  // ---------- 主题与壁纸 ----------
  function hexToRgb(hex) {
    hex = (hex || '').trim();
    if (hex[0] === '#') hex = hex.slice(1);
    if (hex.length === 3) hex = hex.split('').map(function (c) { return c + c; }).join('');
    const n = parseInt(hex, 16);
    return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
  }
  function shade(hex, percent) {
    const c = hexToRgb(hex);
    const target = percent < 0 ? 0 : 255;
    const p = Math.abs(percent) / 100;
    const mix = function (x) { return Math.round((target - x) * p + x); };
    return '#' + [mix(c.r), mix(c.g), mix(c.b)].map(function (x) { return x.toString(16).padStart(2, '0'); }).join('');
  }
  // 把主题对象应用到当前页面的 CSS 变量 + 壁纸层（后台/公开端通用，输入即所见）
  // opts.skipDim：后台编辑界面传 true，避免后台自身被暗调覆盖、影响配色编辑
  function applyTheme(theme, opts) {
    theme = theme || {};
    opts = opts || {};
    const r = document.documentElement.style;
    const set = function (k, v) { if (v) r.setProperty(k, v); };
    if (theme.primary) { set('--green', theme.primary); set('--green-d', shade(theme.primary, -14)); }

    function hexRgb(hex) {
      let h = String(hex || '').replace('#', '');
      if (h.length === 3) h = h.split('').map(function (x) { return x + x; }).join('');
      if (h.length !== 6) return null;
      const n = parseInt(h, 16);
      return isNaN(n) ? null : [(n >> 16) & 255, (n >> 8) & 255, n & 255];
    }
    // 两色按比例混合（t=0 取 h1，t=1 取 h2），用于暗调强度插值
    function mixHex(h1, h2, t) {
      const a = hexRgb(h1), b = hexRgb(h2);
      if (!a || !b) return h2;
      t = Math.max(0, Math.min(1, t));
      return '#' + [0, 1, 2].map(function (i) {
        return Math.round(a[i] + (b[i] - a[i]) * t).toString(16).padStart(2, '0');
      }).join('');
    }

    // 暗调模式：把背景/卡片/文字整体调暗，但最深处仅 85%（"不用特别深"），气泡与状态栏随之变暗调
    const dim = !!theme.dimMode && !opts.skipDim;
    let bg = theme.bg || '#f5f6f8';
    let card = theme.card || '#ffffff';
    let text = theme.text || '#1f2329';
    if (dim) {
      const L = (typeof theme.dimLevel === 'number' ? theme.dimLevel : 5) / 100;
      const d = Math.min(L * 0.85, 0.85);
      bg = mixHex('#f5f6f8', '#15171c', d);
      card = mixHex('#ffffff', '#1e222a', d);
      text = mixHex('#1f2329', '#eaedf1', d);
      set('--muted', mixHex('#8a8f99', '#9aa3ad', d));
      // 壁纸暗色蒙版强度（随暗调强度提升，但基准更轻）：整张背景图压暗成暗紫调、彩色仍隐约可见（对齐系统深色效果），文字/卡片才有暗底可落、清晰可读
      r.setProperty('--dim-scrim', (0.40 + Math.min(L, 1) * 0.25).toFixed(2));
      // 暗调气泡卡片透明度（玻璃质感）：默认 35，后台可拉到 0（最通透、背景清晰可见）~100（最实）；越小越像玻璃气泡、能看到背景壁纸
      const dca = (typeof theme.dimCardOpacity === 'number' ? theme.dimCardOpacity : 40) / 100;
      // 暗调用略深的暗色玻璃，alpha 由 dimCardOpacity 控制；alpha 越低越通透，被压暗但仍可见的彩色壁纸透出，才有玻璃气泡感
      r.setProperty('--card-bg', 'rgba(24, 27, 36, ' + dca.toFixed(3) + ')');
      // 暗调气泡卡片模糊程度（玻璃朦胧感），可在后台「暗调气泡卡片模糊程度」调节；越大越朦胧、背景越虚
      r.setProperty('--dim-blur', (typeof theme.dimBlur === 'number' ? theme.dimBlur : 1) + 'px');
      // 暗调状态栏按钮（文章/黑科技/关于）的透明度与模糊，可在后台「暗调状态栏」调节
      r.setProperty('--tab-dim-bg', 'rgba(255, 255, 255, ' + ((typeof theme.tabDimOpacity === 'number' ? theme.tabDimOpacity : 60) / 100).toFixed(3) + ')');
      r.setProperty('--tab-dim-blur', (typeof theme.tabDimBlur === 'number' ? theme.tabDimBlur : 8) + 'px');
    } else {
      r.setProperty('--dim-scrim', '0');
      // 从暗调切回浅色（不刷新页面）时，重置次要文字色，避免残留暗调插值灰阶
      set('--muted', '#8a8f99');
    }
    set('--bg', bg);
    set('--card', card);
    set('--text', text);

    // 同步浏览器/系统状态栏颜色（theme-color）：浅色用浅色、暗色用深色，避免主题切换时顶栏颜色反转
    let _tc = document.querySelector('meta[name="theme-color"]');
    if (!_tc) { _tc = document.createElement('meta'); _tc.name = 'theme-color'; document.head.appendChild(_tc); }
    _tc.setAttribute('content', bg);
    // iOS 状态栏样式跟随主题：浅色 default（黑字浅底），暗色 black-translucent（与深色融合）
    const _sb = document.querySelector('meta[name="apple-mobile-web-app-status-bar-style"]');
    if (_sb) _sb.setAttribute('content', dim ? 'black-translucent' : 'default');

    // 透明度：内容气泡（卡片）与顶栏，均为 0~100 的百分比
    // 暗调模式下 --card-bg 已在上方 dim 分支设为可调节的暗色玻璃，此处不再覆盖
    if (!dim) {
      const cardOp = (typeof theme.cardOpacity === 'number' ? theme.cardOpacity : 100) / 100;
      const cardRgb = hexRgb(card) || [255, 255, 255];
      r.setProperty('--card-bg', 'rgba(' + cardRgb.join(',') + ',' + cardOp + ')');
      // 浅色模式卡片模糊程度，可在后台「浅色模式卡片模糊度」调节，默认 0（无模糊）
      r.setProperty('--card-blur', (typeof theme.cardBlur === 'number' ? theme.cardBlur : 0) + 'px');
    }
    // 顶栏透明度：仅作用于「文章/黑科技/关于」三个导航按钮（--bar-alpha 0~1）
    const barOp = (typeof theme.barOpacity === 'number' ? theme.barOpacity : (theme.wallpaper ? 55 : 92)) / 100;
    r.setProperty('--bar-alpha', String(barOp));
    const greenRgb = hexRgb(theme.primary) || [7, 193, 96];
    r.setProperty('--green-rgb', greenRgb.join(','));

    // 公开端（非 skipDim）才切换暗调 class；后台 skipDim 不切换，保持亮色便于编辑
    document.body.classList.toggle('dim', dim);

    const wp = document.getElementById('wallpaper');
    if (wp) {
      if (theme.wallpaper) {
        wp.style.display = 'block';
        wp.style.backgroundImage = 'url("' + theme.wallpaper + '")';
        // 暗调模式下壁纸层不透明度固定，与「浅色壁纸透明度」解耦：
        // 压暗蒙版 .wallpaper::after 是该元素的子伪层，父元素 opacity 会等比削弱蒙版强度。
        // 若沿用可在后台调低的浅色 wallpaperOpacity，暗调会随之明显变淡发白；
        // 固定为上个版本基准 0.81，保证「暗调强度」滑块的效果稳定、不受浅色调整影响。
        wp.style.opacity = dim ? 0.81 : ((typeof theme.wallpaperOpacity === 'number' ? theme.wallpaperOpacity : 100) / 100);
        wp.style.filter = 'blur(' + (theme.wallpaperBlur || 0) + 'px)';
        document.body.classList.add('has-wallpaper');
        document.body.classList.toggle('wallpaper-full', !!theme.wallpaperFull);
        document.documentElement.style.background = 'transparent';
      } else {
        wp.style.display = 'none';
        document.body.classList.remove('has-wallpaper', 'wallpaper-full');
        document.documentElement.style.background = '';
      }
    }
  }
  // 应用图标：动态更新浏览器标签图标与 iOS 主屏图标（安卓安装图标需用 manifest 静态文件，由助手替换）
  function applyIcon(dataUrl) {
    if (!dataUrl) return;
    let link = document.querySelector('link[rel="icon"]');
    let apple = document.querySelector('link[rel="apple-touch-icon"]');
    if (!link) { link = document.createElement('link'); link.rel = 'icon'; document.head.appendChild(link); }
    if (!apple) { apple = document.createElement('link'); apple.rel = 'apple-touch-icon'; document.head.appendChild(apple); }
    link.href = dataUrl;
    apple.href = dataUrl;
  }

  global.CBStore = {
    CONTENT_URL, seed, fetchContent, getCached, publicPosts, sortPosts,
    loadDraft, saveDraft, clearDraft,
    verifyPassword,
    uid, exportContent, fileToResizedDataURL,
    applyTheme, applyIcon, shade, hexToRgb
  };
})(window);
