/* 强制提示更新弹窗 —— 公开端 / 预览 iframe / 后台设置共用同一套渲染
 * 由 CBNotice.html() 产出 HTML、CBNotice.mount() 挂到 body。
 * 主题：auto 跟随 body.dim（公开端浅色/暗调），light / dark 为强制覆盖。
 */
(function (global) {
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
  }

  function norm(cfg) {
    cfg = cfg || {};
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
      everyTime: cfg.everyTime !== false
    };
  }

  function cardHtml(c, opts) {
    const full = c.mode === 'fullscreen';
    // 全屏模式默认「强制」不显示关闭；但未配置引导按钮时兜底给关闭按钮，避免把访客锁死
    const closable = !full || !c.buttonUrl || !!opts.preview;
    let h = '<div class="upd-card" style="--upd-accent:' + c.accent + '">';
    if (closable) h += '<button class="upd-close" type="button" data-upd-close aria-label="关闭">×</button>';
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

  // opts.inline：后台设置里的缩小预览（不产生 fixed 浮层）
  // opts.preview：按钮不可点、始终带关闭按钮
  // opts.force：即使 enabled=false 也渲染（后台编辑时需要看到效果）
  function html(cfg, opts) {
    opts = opts || {};
    const c = norm(cfg);
    if (!c.enabled && !opts.force) return '';
    const card = cardHtml(c, opts);
    if (opts.inline) return '<div class="upd-inline-preview upd-' + c.theme + '">' + card + '</div>';
    return '<div class="upd-mask ' + (c.mode === 'bubble' ? 'upd-bubble' : 'upd-full')
      + ' upd-' + c.theme + '" id="updNotice">' + card + '</div>';
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
