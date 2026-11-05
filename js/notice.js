/* 强制提示更新弹窗 —— 公开端 / 预览 iframe / 后台设置共用同一套渲染
 * 由 CBNotice.html() 产出 HTML、CBNotice.mount() 挂到 body。
 * 主题：auto 跟随 body.dim（公开端浅色/暗调），light / dark 为强制覆盖。
 * 关闭按钮：全屏 / 气泡两种模式都放在**卡片自身的右上角**（作为 .upd-card 的首个子元素）；
 * closeOpacity 只控制视觉可见度（0 = 完全隐形），按钮节点与点击热区始终保留。
 */
(function (global) {
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
  }

  function norm(cfg) {
    cfg = cfg || {};
    // 老配置没有该字段时默认 100（完全可见）；数值钳制在 0~100，避免注入非法样式
    let closeOpacity = cfg.closeOpacity == null ? 100 : Number(cfg.closeOpacity);
    if (!isFinite(closeOpacity)) closeOpacity = 100;
    closeOpacity = Math.max(0, Math.min(100, Math.round(closeOpacity)));
    return {
      enabled: !!cfg.enabled,
      mode: cfg.mode === 'bubble' ? 'bubble' : 'fullscreen',
      theme: (cfg.theme === 'light' || cfg.theme === 'dark') ? cfg.theme : 'auto',
      accent: /^#[0-9a-f]{6}$/i.test(cfg.accent || '') ? cfg.accent : '#07c160',
      title: String(cfg.title || ''),
      text: String(cfg.text || ''),
      icon: String(cfg.icon || ''),
      buttonText: String(cfg.buttonText || ''),
      buttonUrl: /^https?:\/\//i.test(cfg.buttonUrl || '') ? cfg.buttonUrl : '',
      closeOpacity: closeOpacity,
      everyTime: cfg.everyTime !== false
    };
  }

  function cardHtml(c, opts) {
    // 关闭按钮是卡片的首个子元素：CSS 用 absolute 定位到卡片自身右上角
    let h = '<div class="upd-card" style="--upd-accent:' + c.accent + '">' + closeHtml(c);
    if (c.icon) h += '<img class="upd-icon" src="' + esc(c.icon) + '" alt=""/>';
    h += '<div class="upd-title">' + esc(c.title || '提示') + '</div>';
    if (c.text) h += '<div class="upd-text">' + esc(c.text).replace(/\n/g, '<br>') + '</div>';
    if (c.buttonText && (c.buttonUrl || opts.preview)) {
      h += opts.preview
        ? '<button class="upd-btn" type="button" disabled>' + esc(c.buttonText) + '</button>'
        : '<a class="upd-btn" href="' + esc(c.buttonUrl) + '" target="_blank" rel="noopener noreferrer">' + esc(c.buttonText) + '</a>';
    }
    h += '</div>';
    return h;
  }

  // 两种模式共用：始终渲染卡片右上角的关闭按钮。
  // 显示度用 inline opacity 实现——即便为 0，按钮仍占位、可点击，
  // 绝不能用 display:none / visibility:hidden / pointer-events:none，否则访客会被锁在弹窗里。
  function closeHtml(c) {
    return '<button class="upd-close" type="button" data-upd-close aria-label="关闭提示"'
      + ' style="opacity:' + (c.closeOpacity / 100) + '">×</button>';
  }

  // opts.inline：后台设置里的缩小预览（不产生 fixed 浮层）
  // opts.preview：引导按钮不可点
  // opts.force：即使 enabled=false 也渲染（后台编辑时需要看到效果）
  function html(cfg, opts) {
    opts = opts || {};
    const c = norm(cfg);
    if (!c.enabled && !opts.force) return '';
    const inner = cardHtml(c, opts);
    if (opts.inline) return '<div class="upd-inline-preview upd-' + c.theme + '">' + inner + '</div>';
    return '<div class="upd-mask ' + (c.mode === 'bubble' ? 'upd-bubble' : 'upd-full')
      + ' upd-' + c.theme + '" id="updNotice">' + inner + '</div>';
  }

  function unmount() {
    const n = document.getElementById('updNotice');
    if (n && n.parentNode) n.parentNode.removeChild(n);
  }

  function mount(cfg, opts) {
    opts = opts || {};
    const c = norm(cfg);
    unmount();
    if (!c.enabled && !opts.force) return false;
    document.body.insertAdjacentHTML('beforeend', html(Object.assign({}, c, { enabled: true }), opts));
    const n = document.getElementById('updNotice');
    if (!n) return false;
    n.addEventListener('click', function (e) {
      if (e.target.closest && e.target.closest('[data-upd-close]')) {
        e.preventDefault();
        unmount();
      }
    });
    return true;
  }

  global.CBNotice = { norm: norm, html: html, mount: mount, unmount: unmount };
})(window);
