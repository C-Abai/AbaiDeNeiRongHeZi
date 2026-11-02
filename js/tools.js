(function () {
  function q(s, r) { return (r || document).querySelector(s); }
  function el(tag, cls, html) {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (html != null) e.innerHTML = html;
    return e;
  }
  function copy(text) {
    if (text && navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text);
  }
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
  }
  function toast(msg) {
    const t = document.getElementById('toast');
    if (!t) return;
    t.textContent = msg;
    t.classList.add('show');
    setTimeout(function () { t.classList.remove('show'); }, 1800);
  }

  // 引擎注册表：每个工具的实现逻辑（数据驱动，由 content.config.tools 调用）
  const ENGINES = {};
  function defineEngine(id, build) { ENGINES[id] = build; }

  // 引擎 1：Base64 编解码
  defineEngine('base64', function (root) {
    root.innerHTML = '<textarea id="t1in" placeholder="输入文本"></textarea>'
      + '<div class="row"><button class="btn" id="t1enc">编码</button><button class="btn ghost" id="t1dec">解码</button><button class="btn ghost" id="t1cp">复制</button></div>'
      + '<div class="out" id="t1out"></div>';
    q('#t1enc').onclick = function () { try { q('#t1out').textContent = btoa(unescape(encodeURIComponent(q('#t1in').value))); } catch (e) { q('#t1out').textContent = '编码失败'; } };
    q('#t1dec').onclick = function () { try { q('#t1out').textContent = decodeURIComponent(escape(atob(q('#t1in').value.trim()))); } catch (e) { q('#t1out').textContent = '解码失败：不是合法的 Base64'; } };
    q('#t1cp').onclick = function () { copy(q('#t1out').textContent); };
  });

  // 引擎 2：字数统计
  defineEngine('counter', function (root) {
    root.innerHTML = '<textarea id="t2in" placeholder="粘贴文本"></textarea>'
      + '<div class="out" id="t2out">字符数 0 · 不含空格 0 · 中文字 0 · 词数 0</div>';
    q('#t2in').addEventListener('input', function () {
      const s = q('#t2in').value;
      const chars = s.length;
      const noSpace = s.replace(/\s/g, '').length;
      const cn = (s.match(/[一-龥]/g) || []).length;
      const words = (s.trim().match(/[A-Za-z0-9]+/g) || []).length;
      q('#t2out').textContent = '字符数 ' + chars + ' · 不含空格 ' + noSpace + ' · 中文字 ' + cn + ' · 词数 ' + words;
    });
  });

  // 引擎 3：时间戳转换
  defineEngine('timestamp', function (root) {
    root.innerHTML = '<div class="row"><button class="btn" id="t3now">现在 → 时间戳</button></div>'
      + '<div class="out" id="t3out"></div>'
      + '<input type="number" id="t3ts" placeholder="粘贴秒/毫秒时间戳（10 或 13 位）"/>'
      + '<div class="row"><button class="btn ghost" id="t3to">时间戳 → 日期</button></div>';
    q('#t3now').onclick = function () { const n = Date.now(); q('#t3out').textContent = '毫秒 ' + n + '\n秒 ' + Math.floor(n / 1000); };
    q('#t3to').onclick = function () {
      let v = String(q('#t3ts').value).trim();
      if (!v) return;
      if (v.length <= 10) v = parseInt(v, 10) * 1000;
      const d = new Date(parseInt(v, 10));
      q('#t3out').textContent = isNaN(d) ? '无效时间戳' : d.toLocaleString();
    };
  });

  // 引擎 4：文本处理（大小写 / 去空行 / 去空格）
  defineEngine('text', function (root) {
    root.innerHTML = '<textarea id="xt_in" placeholder="粘贴文本"></textarea>'
      + '<div class="row"><button class="btn ghost" id="xt_upper">大写</button>'
      + '<button class="btn ghost" id="xt_lower">小写</button>'
      + '<button class="btn ghost" id="xt_trim">去空行</button>'
      + '<button class="btn ghost" id="xt_space">去空格</button></div>'
      + '<div class="out" id="xt_out"></div>';
    q('#xt_upper').onclick = function () { q('#xt_out').textContent = q('#xt_in').value.toUpperCase(); };
    q('#xt_lower').onclick = function () { q('#xt_out').textContent = q('#xt_in').value.toLowerCase(); };
    q('#xt_trim').onclick = function () { q('#xt_out').textContent = q('#xt_in').value.split('\n').map(function (s) { return s.trim(); }).filter(function (s) { return s.length; }).join('\n'); };
    q('#xt_space').onclick = function () { q('#xt_out').textContent = q('#xt_in').value.replace(/\s+/g, ' ').trim(); };
  });

  // 引擎 5：颜色转换 HEX ⇄ RGB
  defineEngine('color', function (root) {
    root.innerHTML = '<div class="row"><input type="color" id="xc_pick" value="#07c160"/><input type="text" id="xc_hex" value="#07c160"/></div>'
      + '<div class="out" id="xc_out"></div>';
    function update() {
      let hex = q('#xc_hex').value.trim();
      if (!/^#?[0-9a-fA-F]{6}$/.test(hex)) { q('#xc_out').textContent = '请输入 6 位 HEX 颜色'; return; }
      if (hex[0] !== '#') hex = '#' + hex;
      q('#xc_pick').value = hex;
      const n = parseInt(hex.slice(1), 16);
      const r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
      q('#xc_out').textContent = 'RGB(' + r + ', ' + g + ', ' + b + ')\nHEX ' + hex.toUpperCase();
    }
    q('#xc_pick').addEventListener('input', function () { q('#xc_hex').value = q('#xc_pick').value; update(); });
    q('#xc_hex').addEventListener('input', update);
    update();
  });

  // 引擎 6：二维码生成（依赖本地 js/qrcode.js）
  defineEngine('qrcode', function (root) {
    if (typeof qrcode !== 'function') {
      root.innerHTML = '<p class="card-desc">二维码库未加载，请刷新重试。</p>';
      return;
    }
    root.innerHTML = '<input type="text" id="qr_text" placeholder="输入文字或网址生成二维码" style="margin-bottom:10px"/>'
      + '<div class="row"><button class="btn" id="qr_make">生成</button><button class="btn ghost" id="qr_dl">下载</button></div>'
      + '<div id="qr_box" style="margin-top:12px; display:flex; justify-content:center"></div>';
    let lastDataUrl = '';
    function make() {
      const text = q('#qr_text').value.trim();
      if (!text) { toast('请输入内容'); return; }
      try {
        const qr = qrcode(0, 'M');
        qr.addData(text);
        qr.make();
        q('#qr_box').innerHTML = qr.createSvgTag(4, 2);
        lastDataUrl = qr.createDataURL(4, 2);
      } catch (e) { q('#qr_box').innerHTML = '<p class="card-desc">内容过长，无法生成</p>'; }
    }
    q('#qr_make').onclick = make;
    q('#qr_dl').onclick = function () {
      if (!lastDataUrl) { toast('请先生成'); return; }
      const a = document.createElement('a');
      a.href = lastDataUrl; a.download = 'qrcode.png';
      document.body.appendChild(a); a.click(); a.remove();
    };
  });

  // 引擎 7：文件转直链下载（本机 data URL 形式）
  defineEngine('filelink', function (root) {
    root.innerHTML = '<p class="card-desc" style="margin:0 0 10px">选择文件，生成一个可直接点击下载的链接（data URL 形式，本机可用）。</p>'
      + '<div class="row"><input type="file" id="fl_file" style="flex:1; width:auto"/><button class="btn" id="fl_gen">生成直链</button></div>'
      + '<textarea id="fl_url" readonly placeholder="生成的直链会显示在这里" style="margin-top:12px"></textarea>'
      + '<div class="row"><button class="btn ghost" id="fl_copy">复制链接</button><button class="btn ghost" id="fl_open">打开/下载</button></div>'
      + '<p class="help" style="color:var(--muted);font-size:12px;margin-top:8px">说明：该直链是文件内容的 data URL，体积约等于文件本身，仅本机/当前浏览器可用，换设备无法下载；超大文件可能超出长度限制。要真正可分享的短直链需接入云端。</p>';
    q('#fl_gen').onclick = function () {
      const f = q('#fl_file').files[0];
      if (!f) { toast('请先选择文件'); return; }
      const reader = new FileReader();
      reader.onload = function () {
        q('#fl_url').value = reader.result;
        toast('已生成直链（长度 ' + reader.result.length + '）');
      };
      reader.onerror = function () { toast('读取失败'); };
      reader.readAsDataURL(f);
    };
    q('#fl_copy').onclick = function () {
      const v = q('#fl_url').value;
      if (!v) { toast('请先生成'); return; }
      if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(v);
      toast('已复制');
    };
    q('#fl_open').onclick = function () {
      const v = q('#fl_url').value;
      if (!v) { toast('请先生成'); return; }
      const f = q('#fl_file').files[0];
      const a = document.createElement('a');
      a.href = v; a.download = (f && f.name) || 'download';
      document.body.appendChild(a); a.click(); a.remove();
    };
  });

  // 引擎 8：图片压缩（不改变尺寸，仅降低体积，纯本地 canvas 处理）
  defineEngine('imgcompress', function (root) {
    root.innerHTML = '<p class="card-desc" style="margin:0 0 10px">选择图片，压缩后可直接下载（不改变尺寸，仅降低体积）。</p>'
      + '<div class="field"><label>压缩质量（0.1 ~ 1，越小越压得狠）</label><input type="range" min="0.1" max="1" step="0.05" value="0.7" id="ic_q"/></div>'
      + '<div class="row"><input type="file" id="ic_file" accept="image/*" style="flex:1;width:auto"/><button class="btn" id="ic_go">压缩</button></div>'
      + '<div id="ic_preview" style="margin-top:12px;display:none">'
      + '<img id="ic_img" style="max-width:100%;border-radius:10px;background:#f0f0f0"/>'
      + '<div class="out" id="ic_info" style="margin-top:8px"></div>'
      + '<a class="btn" id="ic_dl" style="margin-top:10px;display:inline-block">下载压缩图</a></div>';
    function go() {
      const f = q('#ic_file').files[0];
      if (!f) { toast('请先选择图片'); return; }
      const ql = parseFloat(q('#ic_q').value) || 0.7;
      const reader = new FileReader();
      reader.onload = function () {
        const img = new Image();
        img.onload = function () {
          const canvas = document.createElement('canvas');
          canvas.width = img.width; canvas.height = img.height;
          const ctx = canvas.getContext('2d');
          ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, canvas.width, canvas.height);
          ctx.drawImage(img, 0, 0);
          let dataUrl;
          try { dataUrl = canvas.toDataURL('image/jpeg', ql); } catch (e) { toast('压缩失败'); return; }
          q('#ic_preview').style.display = 'block';
          q('#ic_img').src = dataUrl;
          const origKB = (f.size / 1024).toFixed(0);
          const b64 = dataUrl.split(',')[1] || '';
          const compKB = (Math.round(b64.length * 3 / 4) / 1024).toFixed(0);
          q('#ic_info').textContent = '原图 ' + origKB + ' KB → 压缩后约 ' + compKB + ' KB';
          const a = q('#ic_dl');
          a.href = dataUrl;
          a.download = (f.name || 'image').replace(/\.[^.]+$/, '') + '_compressed.jpg';
        };
        img.onerror = function () { toast('图片读取失败'); };
        img.src = reader.result;
      };
      reader.onerror = function () { toast('文件读取失败'); };
      reader.readAsDataURL(f);
    }
    q('#ic_go').onclick = go;
  });

  // 引擎 9：番茄钟（25 分钟专注 / 5 分钟休息循环，纯本地计时 + 提示音）
  defineEngine('pomodoro', function (root) {
    root.innerHTML = '<div id="pm_time" style="font-size:46px;font-weight:700;text-align:center;font-variant-numeric:tabular-nums;margin:10px 0">25:00</div>'
      + '<div id="pm_mode" style="text-align:center;color:var(--muted);font-size:13px;margin-bottom:14px">专注中</div>'
      + '<div class="row" style="justify-content:center">'
      + '<button class="btn" id="pm_start">开始</button>'
      + '<button class="btn ghost" id="pm_reset">重置</button></div>';
    let left = 25 * 60, timer = null, mode = 'focus';
    function fmt(s) { const m = Math.floor(s / 60), ss = s % 60; return (m < 10 ? '0' : '') + m + ':' + (ss < 10 ? '0' : '') + ss; }
    function paint() { q('#pm_time').textContent = fmt(left); q('#pm_mode').textContent = mode === 'focus' ? '专注中' : '休息一下'; }
    function beep() {
      try {
        const AC = window.AudioContext || window.webkitAudioContext;
        if (!AC) return;
        const ac = new AC();
        const o = ac.createOscillator(), g = ac.createGain();
        o.connect(g); g.connect(ac.destination);
        o.frequency.value = 880; g.gain.value = 0.08; o.start();
        setTimeout(function () { try { o.stop(); } catch (e) {} }, 320);
      } catch (e) {}
    }
    function tick() {
      if (left <= 0) {
        beep();
        if (mode === 'focus') { mode = 'break'; left = 5 * 60; toast('时间到，休息一下'); }
        else { mode = 'focus'; left = 25 * 60; toast('休息结束，开始专注'); }
        paint(); return;
      }
      left--; paint();
    }
    q('#pm_start').onclick = function () {
      const b = this;
      if (timer) { clearInterval(timer); timer = null; b.textContent = '继续'; }
      else { timer = setInterval(tick, 1000); b.textContent = '暂停'; }
    };
    q('#pm_reset').onclick = function () {
      if (timer) { clearInterval(timer); timer = null; }
      mode = 'focus'; left = 25 * 60; q('#pm_start').textContent = '开始'; paint();
    };
    paint();
  });

  // 数据驱动引擎 8：链接启动器（后台自定义网址）
  defineEngine('link', function (root, cfg) {
    let url = cfg.url || '';
    if (!/^https?:\/\//i.test(url) && !/^mailto:/i.test(url)) url = '#';
    root.innerHTML = '<p class="card-desc" style="margin:0 0 12px">' + esc(cfg.text || '点击下方按钮打开链接') + '</p>'
      + '<div class="row"><a class="btn" href="' + esc(url) + '" target="_blank" rel="noopener">打开链接 ↗</a></div>';
  });

  // 数据驱动引擎 9：自定义说明（后台自定义文字）
  defineEngine('note', function (root, cfg) {
    root.innerHTML = '<div class="tool-note">' + esc(cfg.text || '（暂无说明内容）') + '</div>';
  });

  // 渲染：toolsList = content.config.tools（每个含 id,name,engine,enabled,order）
  function render(root, toolsList) {
    let list = (toolsList || []).filter(function (t) { return t.enabled !== false; });
    list = list.slice().sort(function (a, b) { return (a.order || 0) - (b.order || 0); });
    list.forEach(function (t) {
      const box = el('div', 'tool');
      box.dataset.tool = t.id;
      root.appendChild(box);
      const engine = ENGINES[t.engine];
      if (!engine) { box.innerHTML = '<p class="card-desc">未知工具引擎：' + esc(t.engine) + '</p>'; return; }
      try { engine(box, t); } catch (e) { box.innerHTML = '<p class="card-desc">工具加载出错</p>'; }
    });
  }

  window.CBTools = {
    render: render,
    // 供后台「添加工具」使用的引擎清单
    engines: function () {
      return [
        { id: 'base64', name: 'Base64 编解码' },
        { id: 'counter', name: '字数统计' },
        { id: 'timestamp', name: '时间戳转换' },
        { id: 'text', name: '文本处理' },
        { id: 'color', name: '颜色转换 HEX⇄RGB' },
        { id: 'qrcode', name: '二维码生成' },
        { id: 'filelink', name: '文件转直链下载' },
        { id: 'imgcompress', name: '🖼 图片压缩' },
        { id: 'pomodoro', name: '🍅 番茄钟' },
        { id: 'link', name: '🔗 链接启动器（自定义网址）' },
        { id: 'note', name: '📄 自定义说明（自定义文字）' }
      ];
    }
  };
})();
