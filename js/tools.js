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

  // 引擎 7：图片隐写术（LSB 隐写，纯本地、零依赖、不需要任何服务器）
  defineEngine('stego', function (root) {
    root.innerHTML = '<p class="card-desc" style="margin:0 0 10px">把一段文字藏进图片像素的最低位（LSB 隐写）。图片肉眼几乎不变，只有用本工具才能提取——适合把密码/密信藏进一张普通照片里传递。<b>注意：这是隐藏而非强加密，敏感内容请加密码。</b></p>'
      + '<div style="border:1px solid var(--line);border-radius:10px;padding:10px;margin-bottom:10px">'
      + '  <div class="field"><label>① 要隐藏的文字</label><textarea id="st_text" placeholder="输入要藏起来的内容（支持中文）"></textarea></div>'
      + '  <div class="field"><label>可选密码（对文字异或混淆，提取时需一致）</label><input id="st_key" placeholder="留空则不加密"/></div>'
      + '  <div class="field"><label>载体图片（建议 PNG/JPG，不要压缩过度的图）</label><input type="file" id="st_img" accept="image/*" style="width:auto"/></div>'
      + '  <button class="btn" id="st_encode" style="margin-top:6px">编码并下载藏密图（PNG）</button>'
      + '</div>'
      + '<div style="border:1px solid var(--line);border-radius:10px;padding:10px">'
      + '  <div class="field"><label>② 藏密图片（提取文字）</label><input type="file" id="st_img2" accept="image/*" style="width:auto"/></div>'
      + '  <div class="field"><label>可选密码（若编码时设了密码，需填一致的密码）</label><input id="st_key2" placeholder="留空则无需密码"/></div>'
      + '  <button class="btn" id="st_decode" style="margin-top:6px">提取文字</button>'
      + '  <textarea id="st_out" readonly placeholder="提取出的文字会显示在这里" style="margin-top:8px"></textarea>'
      + '</div>'
      + '<p class="help" style="color:var(--muted);font-size:12px;margin-top:8px">原理：把文字每字节拆成 8 个比特，写入连续像素 RGB 通道的最低位（人眼无法察觉）。全程在你的浏览器里完成，图片不会上传到任何服务器。</p>';

    function textToBits(str, key) {
      var bytes = new TextEncoder().encode(str);
      var len = bytes.length;
      var all = new Uint8Array(4 + len);
      all[0] = (len >>> 24) & 255; all[1] = (len >>> 16) & 255; all[2] = (len >>> 8) & 255; all[3] = len & 255;
      for (var i = 0; i < len; i++) all[4 + i] = bytes[i];
      if (key) { var kb = new TextEncoder().encode(key); for (var j = 0; j < all.length; j++) all[j] ^= kb[j % kb.length]; }
      var bits = [];
      for (var k = 0; k < all.length; k++) for (var b = 7; b >= 0; b--) bits.push((all[k] >> b) & 1);
      return bits;
    }
    function bitsToText(bits, key) {
      var n = Math.floor(bits.length / 8);
      var all = new Uint8Array(n);
      for (var i = 0; i < n; i++) { var v = 0; for (var b = 0; b < 8; b++) v = (v << 1) | bits[i * 8 + b]; all[i] = v; }
      if (key) { var kb = new TextEncoder().encode(key); for (var j = 0; j < all.length; j++) all[j] ^= kb[j % kb.length]; }
      var len = ((all[0] << 24) | (all[1] << 16) | (all[2] << 8) | all[3]) >>> 0;
      if (len <= 0 || len > all.length - 4 || len > 10485760) return '（提取失败：密码错误或不是藏密图）';
      var body = all.slice(4, 4 + len);
      try { return new TextDecoder('utf-8', { fatal: true }).decode(body); } catch (e) { return '（提取失败：密码错误或不是藏密图）'; }
    }
    function loadImage(file) {
      return new Promise(function (resolve, reject) {
        var reader = new FileReader();
        reader.onload = function () {
          var img = new Image();
          img.onload = function () { resolve(img); };
          img.onerror = function () { reject('图片读取失败'); };
          img.src = reader.result;
        };
        reader.onerror = function () { reject('文件读取失败'); };
        reader.readAsDataURL(file);
      });
    }
    q('#st_encode').onclick = function () {
      var text = q('#st_text').value;
      if (!text) { toast('请先输入要隐藏的文字'); return; }
      var file = q('#st_img').files[0];
      if (!file) { toast('请选择载体图片'); return; }
      var key = q('#st_key').value;
      loadImage(file).then(function (img) {
        var c = document.createElement('canvas');
        c.width = img.width; c.height = img.height;
        var ctx = c.getContext('2d');
        ctx.drawImage(img, 0, 0);
        var data = ctx.getImageData(0, 0, c.width, c.height);
        var px = data.data;
        var bits = textToBits(text, key);
        var capacity = Math.floor(px.length / 4) * 3;
        if (bits.length > capacity) { toast('文字太长，装不下，换小图或减少文字'); return; }
        var bi = 0;
        for (var i = 0; i < px.length && bi < bits.length; i += 4) {
          for (var ch = 0; ch < 3 && bi < bits.length; ch++) px[i + ch] = (px[i + ch] & 0xFE) | bits[bi++];
        }
        ctx.putImageData(data, 0, 0);
        c.toBlob(function (blob) {
          var a = document.createElement('a');
          a.href = URL.createObjectURL(blob);
          a.download = 'stego.png';
          document.body.appendChild(a); a.click(); a.remove();
          setTimeout(function () { URL.revokeObjectURL(a.href); }, 1000);
          toast('已生成藏密图（stego.png）');
        }, 'image/png');
      }).catch(function (e) { toast(e); });
    };
    q('#st_decode').onclick = function () {
      var file = q('#st_img2').files[0];
      if (!file) { toast('请选择藏密图片'); return; }
      var key = q('#st_key2').value;
      q('#st_out').value = '';
      loadImage(file).then(function (img) {
        var c = document.createElement('canvas');
        c.width = img.width; c.height = img.height;
        var ctx = c.getContext('2d');
        ctx.drawImage(img, 0, 0);
        var px = ctx.getImageData(0, 0, c.width, c.height).data;
        var bits = [];
        for (var i = 0; i < px.length; i += 4) for (var ch = 0; ch < 3; ch++) bits.push(px[i + ch] & 1);
        var text = bitsToText(bits, key);
        q('#st_out').value = text;
        if (text.indexOf('（提取失败') === 0) toast(text);
        else toast('提取完成');
      }).catch(function (e) { q('#st_out').value = '（提取失败：' + e + '）'; toast('提取失败：' + e); });
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
        { id: 'stego', name: '图片隐写术（藏密）' },
        { id: 'imgcompress', name: '🖼 图片压缩' },
        { id: 'pomodoro', name: '🍅 番茄钟' },
        { id: 'link', name: '🔗 链接启动器（自定义网址）' },
        { id: 'note', name: '📄 自定义说明（自定义文字）' }
      ];
    }
  };
})();
