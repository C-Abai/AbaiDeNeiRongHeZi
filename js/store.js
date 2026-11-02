(function (global) {
  // 数据层：content.json 为线上单一数据源（网络优先，本地缓存兜底）
  // 后台编辑存本机草稿(localStorage)，发布时由助手把 content.json 推上线
  const CONTENT_URL = './content.json';
  const META_URL = './meta.json';
  const CACHE_KEY = 'cb_content_cache_v1';
  const CACHE_HASH_KEY = 'cb_content_hash_v1';
  const DRAFT_KEY = 'cb_admin_draft_v1';

  // ===== 方案 A（可选内容源）：填了 GitHub raw 地址就从 GitHub 拉内容，拉不到自动回退到内置 content.json =====
  // 留空 '' = 不启用，维持原 WorkBuddy 内置内容行为（默认）。
  // 启用方式：把下面两个填成你的仓库 raw 地址（内容更新只需在 GitHub 网页改 content.json 提交即可，无需重新部署）。
  // 回退机制：即便 GitHub 仓库被删/搞乱，App 仍会回退到内置内容照常运行——这就是「备份兜底」之外的第二道保险。
  const GITHUB_CONTENT_URL = 'https://raw.githubusercontent.com/C-Abai/AbaiDeNeiRongHeZi/refs/heads/main/content.json';
  const GITHUB_META_URL = 'https://raw.githubusercontent.com/C-Abai/AbaiDeNeiRongHeZi/refs/heads/main/meta.json';
  function activeContentUrl() { return GITHUB_CONTENT_URL || CONTENT_URL; }
  function activeMetaUrl() { return GITHUB_META_URL || META_URL; }
  // 从指定 URL 取 JSON；若启用了 GitHub 且首选地址失败，自动回退到内置地址（保证可用性）
  async function fetchJson(url, fallbackUrl) {
    try {
      const r = await fetch(url, { cache: 'no-store' });
      if (r.ok) return await r.json();
    } catch (e) {}
    if (fallbackUrl) {
      try {
        const r = await fetch(fallbackUrl, { cache: 'reload' });
        if (r.ok) return await r.json();
      } catch (e) {}
    }
    return null;
  }

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

  // 公开端：缓存优先即时返回（首屏不再等网络），再后台静默比对「内容指纹」(meta.json)，
  // 仅当内容真正变化时才去拉取 655KB 的 content.json（cache:'reload' 绕过缓存拿最新），
  // 否则完全不下载，极大节省手机流量与加载耗时。
  async function fetchContent(opts) {
    opts = opts || {};
    const cachedStr = (function () { try { return localStorage.getItem(CACHE_KEY); } catch (e) { return null; } })();
    const cached = cachedStr ? safeParse(cachedStr) : null;
    if (cached) {
      // 立即返回缓存用于首屏渲染；随后用极小的 meta.json 比对指纹，有变化才拉全量内容
      checkContentUpdate(opts);
      return cached;
    }
    // 首次访问无缓存：必须等网络拉取，失败再用种子兜底
    try {
      const data = await fetchJson(activeContentUrl(), GITHUB_CONTENT_URL ? CONTENT_URL : null);
      if (data) {
        try { localStorage.setItem(CACHE_KEY, JSON.stringify(data)); } catch (e) {}
        try { localStorage.setItem(CACHE_HASH_KEY, await readHash()); } catch (e) {}
        return data;
      }
    } catch (e) { /* 离线或 file:// 直接走兜底 */ }
    try { const c = localStorage.getItem(CACHE_KEY); if (c) return JSON.parse(c); } catch (e) {}
    return seed();
  }

  // 读取线上「内容变更信号」：
  // - 本地/内置模式：读极小的 meta.json 指纹
  // - GitHub 模式：额外用 HEAD 请求取 Content-Length（只下载几百字节的响应头，不下内容），
  //   这样改完 content.json 直接覆盖上传即可，无需再手工维护 meta.json 里的哈希。
  //   （ETag 跨域读不到，但 Content-Length 属于 CORS 安全列表头部，前端可直接读取）
  // 两个信号任一变化即触发全量拉取，互为兜底，更稳妥。
  function readHash() {
    const metaP = fetchJson(activeMetaUrl(), GITHUB_META_URL ? META_URL : null)
      .then(function (m) { return (m && m.contentHash) || ''; })
      .catch(function () { return ''; });
    if (!GITHUB_CONTENT_URL) return metaP;
    const sizeP = fetch(GITHUB_CONTENT_URL + (GITHUB_CONTENT_URL.indexOf('?') >= 0 ? '&' : '?') + '_h=' + Date.now(), {
      method: 'HEAD', cache: 'no-store'
    })
      .then(function (r) { return r.ok ? (r.headers.get('Content-Length') || '') : ''; })
      .catch(function () { return ''; });
    return Promise.all([metaP, sizeP]).then(function (a) {
      return (a[0] || '') + '|len:' + (a[1] || '');
    });
  }

  // 后台静默比对：指纹未变 → 直接跳过（不下载 655KB）；指纹变了 → 拉全量并回调 onUpdate
  function checkContentUpdate(opts) {
    readHash().then(function (newHash) {
      if (!newHash) return;
      let oldHash = '';
      try { oldHash = localStorage.getItem(CACHE_HASH_KEY) || ''; } catch (e) {}
      if (oldHash && oldHash === newHash) return; // 内容没变，省去整包下载
      // 内容变化（或首次比对）：绕过缓存拉取最新全量，比对后再决定是否重绘
      fetchJson(activeContentUrl(), GITHUB_CONTENT_URL ? CONTENT_URL : null)
        .then(function (fresh) {
          if (!fresh) return;
          let freshStr;
          try { freshStr = JSON.stringify(fresh); } catch (e) { return; }
          if (freshStr !== (function () { try { return localStorage.getItem(CACHE_KEY); } catch (e) { return ''; } })()) {
            try { localStorage.setItem(CACHE_KEY, freshStr); } catch (e) {}
            try { localStorage.setItem(CACHE_HASH_KEY, newHash); } catch (e) {}
            if (opts.onUpdate) opts.onUpdate(fresh);
          }
        })
        .catch(function () {});
    }).catch(function () {});
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
