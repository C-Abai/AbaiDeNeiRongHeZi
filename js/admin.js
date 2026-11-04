(async function () {
  const $ = function (s, r) { return (r || document).querySelector(s); };
  const app = $('#app');
  let content = null;

  // ===== 后台实时预览：每次保存草稿自动推送到预览 iframe（公开端效果所见即所得）=====
  let previewOpen = false;
  let previewReady = false;
  // 包裹 saveDraft：任何后台保存（文章/设置/工具/链接）都会同步刷新预览
  const _origSaveDraft = CBStore.saveDraft;
  CBStore.saveDraft = function (d) { _origSaveDraft(d); pushPreview(); };

  // 从 URL 取分享码，用于拉取线上最新内容时带上
  const SC = (function () { try { return new URLSearchParams(location.search).get('sharecode') || 'AK6QIELR67'; } catch (e) { return 'AK6QIELR67'; } })();

  function versionOf(d) {
    const a = (d && d.config && d.config.aboutApp) || '';
    const m = a.match(/v(\d+)/);
    return m ? m[1] : '?';
  }

  // 当线上内容已更新（deployMeta.ts 更新）而本机草稿落后时，以线上内容为权威打底，
  // 仅补回「本机独有、线上没有」的新增项（帖子/链接/合集/工具），避免旧草稿覆盖新发布内容
  function rebaseDraft(pub, dft) {
    const out = JSON.parse(JSON.stringify(pub));
    const keepLocalOnly = function (pubArr, dftArr, key) {
      const local = (dftArr || []).filter(function (x) {
        return !(pubArr || []).some(function (y) { return y.id === x.id; });
      });
      return (pubArr || []).concat(local);
    };
    out.posts = keepLocalOnly(pub.posts, dft.posts, 'posts');
    out.config.links = keepLocalOnly(pub.config.links, dft.config.links, 'links');
    out.config.linkGroups = keepLocalOnly(pub.config.linkGroups, dft.config.linkGroups, 'linkGroups');
    out.config.tools = keepLocalOnly(pub.config.tools, dft.config.tools, 'tools');
    // 主题：保留本机本地微调（若本机有），否则用线上；其余 config 字段本机独有也补回
    out.config.theme = (dft.config && dft.config.theme) || (pub.config && pub.config.theme);
    Object.keys(dft.config || {}).forEach(function (k) {
      if (['links', 'linkGroups', 'tools', 'theme'].indexOf(k) > -1) return;
      if (out.config[k] === undefined) out.config[k] = dft.config[k];
    });
    return out;
  }
  function pushPreview() {
    if (!previewOpen || !previewReady) return;
    const f = document.getElementById('previewFrame');
    if (f && f.contentWindow) f.contentWindow.postMessage({ type: 'cb-preview', content: content }, '*');
  }
  // 监听预览 iframe 就绪信号，就绪后立即推送当前草稿
  window.addEventListener('message', function (e) {
    if (e.data && e.data.type === 'cb-preview-ready') { previewReady = true; pushPreview(); }
  });
  function ensurePreviewOverlay() {
    if (document.getElementById('previewOverlay')) return;
    const ov = document.createElement('div');
    ov.id = 'previewOverlay';
    ov.className = 'preview-overlay';
    ov.innerHTML = '<div class="preview-bar">'
      + '<span class="preview-title">👁 预览 · 公开端效果（草稿实时同步，未发布）</span>'
      + '<div class="preview-actions"><button class="btn ghost" id="previewRefresh">🔄 刷新</button>'
      + '<button class="btn ghost" id="previewClose">✕ 关闭</button></div></div>'
      + '<iframe id="previewFrame" class="preview-frame" src=""></iframe>';
    document.body.appendChild(ov);
    document.getElementById('previewClose').onclick = closePreview;
    document.getElementById('previewRefresh').onclick = function () {
      previewReady = false;
      document.getElementById('previewFrame').src = 'preview.html?sharecode=AK6QIELR67&preview=1&pv=1';
    };
  }
  function openPreview() {
    ensurePreviewOverlay();
    previewOpen = true;
    previewReady = false;
    const ov = document.getElementById('previewOverlay');
    ov.classList.add('show');
    const f = document.getElementById('previewFrame');
    if (!f.src || f.src.indexOf('preview.html') < 0) {
      f.src = 'preview.html?sharecode=AK6QIELR67&preview=1&pv=1';
    }
  }
  function closePreview() {
    previewOpen = false;
    const ov = document.getElementById('previewOverlay');
    if (ov) ov.classList.remove('show');
  }

  // 后台门禁：仅在 URL 带正确 key 时加载，否则显示 404 并中止（公开端无入口）
  const ADMIN_KEY = 'nebadmin2026';
  // 已部署的 APK 直装链接（兜底默认值，仅当用户未自行填写时填入后台输入框；可随时在后台修改）
  const DEPLOYED_APK_URL = 'https://content-box-24323.app.workbuddy.host/app.apk?sharecode=AK6QIELR67';
  if (new URLSearchParams(location.search).get('key') !== ADMIN_KEY) {
    app.innerHTML = '<div style="padding:80px 20px;text-align:center;color:#bbb;font-size:14px">404 · 页面不存在</div>';
    return;
  }

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
  // 与公开端一致：将正文自动分段为气泡数组（聊天界面模式）
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

  // 后台自身暗调开关：本机记忆；开启后后台界面套用后台调好的暗调参数（与公开端暗调一致）
  function getAdminDim() { try { return localStorage.getItem('cb_admin_dim') === '1'; } catch (e) { return false; } }
  function setAdminDim(v) { try { localStorage.setItem('cb_admin_dim', v ? '1' : '0'); } catch (e) {} }
  function applyAdminTheme() {
    const on = getAdminDim();
    const base = (content && content.config && content.config.theme) || {};
    const t = Object.assign({}, base);
    if (on) t.dimMode = true;                     // 强制套用暗调（后台自身开关，不影响公开端默认）
    CBStore.applyTheme(t, { skipDim: !on });
    // 双保险：后台自身暗调时确保拿到与公开端一致的 body.dim 视觉（壁纸蒙版 / 玻璃卡片 / 白字 / 亮绿按钮）
    document.body.classList.toggle('dim', on);
  }

  async function boot() { document.body.classList.toggle('admin-dark', getAdminDim()); showLogin(); }

  function showLogin() {
    app.innerHTML = '<div class="login-box"><h2>后台登录</h2><p>请输入管理员密码。</p>'
      + '<div class="field"><label>密码</label><input type="password" id="pw"/></div>'
      + '<button class="btn" id="loginBtn">登录</button>'
      + '<p class="login-hint">密码为固定口令，无法在界面上修改或重置；请勿将本后台链接转发给他人。</p></div>';
    $('#loginBtn').onclick = async function () {
      if (await CBStore.verifyPassword($('#pw').value)) enterAdmin();
      else toast('密码错误');
    };
  }

  async   function enterAdmin() {
    // 拉取线上最新内容（绕过缓存，确保后台看到的是刚发布的版本，而不是旧草稿）
    let pub = null;
    try {
      const r = await fetch('./content.json?sharecode=' + encodeURIComponent(SC) + '&pv=1', { cache: 'no-store' });
      if (r.ok) pub = await r.json();
    } catch (e) { pub = null; }
    const draft = CBStore.loadDraft();
    if (!pub) {
      // 离线或拉取失败：退而用草稿 / 缓存
      content = draft || (await CBStore.fetchContent());
      if (content) CBStore.saveDraft(content);
    } else if (!draft) {
      content = pub;
      CBStore.saveDraft(content);
    } else {
      // 草稿与线上同源？同一发布基准 → 保留本机编辑；线上已更新 → 以线上打底并补回本地独有项
      const pubTs = (pub.deployMeta && pub.deployMeta.ts) || '';
      const dftTs = (draft.deployMeta && draft.deployMeta.ts) || '';
      if (dftTs && pubTs && dftTs < pubTs) {
        content = rebaseDraft(pub, draft);
        toast('已同步线上最新内容（v' + versionOf(pub) + '）');
      } else {
        content = draft;
      }
      CBStore.saveDraft(content);
    }
    if (!content.config) content.config = {};
    // 引导页默认值：关闭状态，内容留空（用户在后台「引导页」编辑并发布后再启用）
    if (!content.config.guide) content.config.guide = { enabled: false, title: '', subtitle: '', intro: '', apkUrl: '', buttonText: '立即下载安装', icon: '' };
    // 兜底：未填 APK 链接时，把已部署的直装地址预填进后台，避免输入框一直为空（用户可随时改）
    if (!content.config.apkUrl) content.config.apkUrl = DEPLOYED_APK_URL;
    // 后台界面：按本机「暗调开关」决定自身是否转暗调（默认浅色）；暗调套用后台调好的暗调参数
    document.body.classList.toggle('admin-dark', getAdminDim());
    applyAdminTheme();
    renderShell();
  }

  function renderShell() {
    app.innerHTML =
      '<div class="admin-bar"><span class="ab-title">后台管理</span>'
      + '<button class="btn ghost" id="adminThemeBtn"></button>'
      + '<button class="btn ghost" id="previewBtn">👁 预览</button><button class="btn ghost" id="logout">退出</button></div>'
      + '<div class="admin-tabs"><button class="tab active" data-t="posts">内容</button>'
      + '<button class="tab" data-t="settings">站点设置</button>'
      + '<button class="tab" data-t="tools">工具栏</button>'
      + '<button class="tab" data-t="guide">引导页</button>'
      + '<button class="tab" data-t="publish">发布</button></div>'
      + '<div id="panel"></div>';
    $('#logout').onclick = function () { boot(); };
    $('#previewBtn').onclick = openPreview;
    // 后台暗调开关：切换后台界面自身的浅色/暗调（套用后台调好的暗调参数），选择本机记忆
    const themeBtn = $('#adminThemeBtn');
    function updateThemeBtn() { themeBtn.textContent = getAdminDim() ? '☀️ 浅色' : '🌙 暗调'; }
    updateThemeBtn();
    themeBtn.onclick = function () {
      const on = !getAdminDim();
      setAdminDim(on);
      document.body.classList.toggle('admin-dark', on);
      applyAdminTheme();
      updateThemeBtn();
    };
    ensurePreviewOverlay();
    document.querySelectorAll('.admin-tabs .tab').forEach(function (b) {
      b.onclick = function () {
        document.querySelectorAll('.admin-tabs .tab').forEach(function (x) { x.classList.remove('active'); });
        b.classList.add('active');
        renderPanel(b.dataset.t);
      };
    });
    $('#modalMask').addEventListener('click', function (e) { if (e.target.id === 'modalMask') closeModal(); });
    renderPanel('posts');
  }

  function renderPanel(which) {
    const panel = $('#panel');
    if (which === 'posts') renderPosts(panel);
    else if (which === 'settings') renderSettings(panel);
    else if (which === 'tools') renderTools(panel);
    else if (which === 'guide') renderGuide(panel);
    else renderPublish(panel);
  }

  function renderPosts(panel) {
    let html = '<div class="admin-list"><button class="btn" id="newPost">+ 新建内容</button><div style="height:12px"></div>';
    const list = CBStore.sortPosts(content.posts || []);
    if (!list.length) html += '<div class="empty">还没有内容</div>';
    list.forEach(function (p) {
      html += '<div class="card"><div class="card-body">'
        + '<span class="tag ' + (p.category === 'tech' ? 'tech' : '') + '">' + (p.category === 'tech' ? '黑科技' : '文章') + '</span>'
        + '<div class="card-title">' + esc(p.title)
        + (p.pinned ? '<span class="pin-flag">置顶</span>' : '')
        + (p.published === false ? '<span class="pin-flag" style="color:#fa5151">草稿</span>' : '') + '</div>'
        + '<p class="card-desc">' + esc(p.summary || '') + '</p></div>'
        + '<div class="row" style="flex:none"><button class="btn ghost" data-edit="' + p.id + '">编辑</button>'
        + '<button class="btn danger" data-del="' + p.id + '">删除</button></div></div>';
    });
    html += '</div>';
    panel.innerHTML = html;
    $('#newPost').onclick = function () { openEditor(null); };
    panel.querySelectorAll('[data-edit]').forEach(function (b) {
      b.onclick = function () { const p = (content.posts || []).find(function (x) { return x.id === b.dataset.edit; }); openEditor(p); };
    });
    panel.querySelectorAll('[data-del]').forEach(function (b) {
      b.onclick = function () {
        if (!confirm('确定删除？')) return;
        content.posts = (content.posts || []).filter(function (x) { return x.id !== b.dataset.del; });
        CBStore.saveDraft(content);
        renderPosts(panel);
        toast('已删除');
      };
    });
  }

  let editingId = null;
  function openEditor(p) {
    editingId = p ? p.id : null;
    const isNew = !p;
    const d = p || { title: '', category: 'article', summary: '', content: '', cover: '', pinned: false, order: 0, published: true };
    const modal = $('#modal');
    modal.innerHTML = '<button class="close" id="mClose">×</button><h3>' + (isNew ? '新建内容' : '编辑内容') + '</h3>'
      + '<div class="field"><label>标题</label><input type="text" id="f_title" value="' + esc(d.title) + '"/></div>'
      + '<div class="field"><label>分类</label><select id="f_cat"><option value="article"' + (d.category === 'article' ? ' selected' : '') + '>文章</option><option value="tech"' + (d.category === 'tech' ? ' selected' : '') + '>黑科技</option></select></div>'
      + '<div class="field"><label>摘要</label><input type="text" id="f_sum" value="' + esc(d.summary) + '"/></div>'
      + '<div class="field"><label>正文（支持换行）</label><textarea id="f_content">' + esc(d.content) + '</textarea></div>'
      + '<div class="field"><label>显示模式</label><div class="seg" id="f_dmode">'
      + '<button type="button" data-v="normal"' + (d.displayMode !== 'chat' ? ' class="active"' : '') + '>📄 普通</button>'
      + '<button type="button" data-v="chat"' + (d.displayMode === 'chat' ? ' class="active"' : '') + '>💬 聊天界面</button></div>'
      + '<p class="help" id="dmodeHelp">' + (d.displayMode === 'chat' ? '聊天界面：下方为逐条气泡内容，可直接编辑；留空气泡可在保存前删除。' : '聊天界面模式会把正文自动切分成气泡、以聊天形式展示；切换后下方出现气泡编辑区。') + '</p></div>'
      + '<div id="chatSegWrap" style="' + (d.displayMode === 'chat' ? '' : 'display:none') + '"></div>'
      + '<div class="field"><label>封面图</label><input type="file" id="f_cover" accept="image/*"/><img class="cover-preview" id="f_cover_prev" src="' + (d.cover || '') + '" style="' + (d.cover ? '' : 'display:none') + '"/></div>'
      + '<div class="field"><label>封面展示方式</label><div class="seg" id="f_shape">'
      + '<button type="button" data-v="square"' + (d.coverShape !== 'landscape' ? ' class="active"' : '') + '>⬜ 正方形</button>'
      + '<button type="button" data-v="landscape"' + (d.coverShape === 'landscape' ? ' class="active"' : '') + '>▭ 横屏宽幅（红框）</button>'
      + '</div><p class="help" style="margin:4px 0 0">横屏宽幅会把封面显示为顶部通栏大图，并带红色边框突出。</p></div>'
      + '<div class="checkbox-row"><input type="checkbox" id="f_pinned" ' + (d.pinned ? 'checked' : '') + '/><label for="f_pinned">置顶（显示在首页顶部）</label></div>'
      + '<div class="field"><label>排序（越大越靠前，同置顶内生效）</label><input type="number" id="f_order" value="' + (d.order || 0) + '"/></div>'
      + '<div class="checkbox-row"><input type="checkbox" id="f_pub" ' + (d.published !== false ? 'checked' : '') + '/><label for="f_pub">发布（取消则仅存为草稿）</label></div>'
      + '<div class="row"><button class="btn" id="mSave">保存</button><button class="btn ghost" id="mCancel">取消</button></div>';
    $('#modalMask').classList.add('show');
    let coverData = d.cover || '';
    let shapeData = d.coverShape === 'landscape' ? 'landscape' : 'square';
    const shapeSeg = $('#f_shape');
    if (shapeSeg) {
      shapeSeg.querySelectorAll('button').forEach(function (b) {
        b.addEventListener('click', function () {
          shapeData = b.dataset.v;
          shapeSeg.querySelectorAll('button').forEach(function (x) { x.classList.remove('active'); });
          b.classList.add('active');
        });
      });
    }

    // ===== 聊天界面模式：显示模式 + 气泡编辑 =====
    let displayMode = d.displayMode === 'chat' ? 'chat' : 'normal';
    let chatSegData = Array.isArray(d.chatSegments) ? d.chatSegments.slice() : [];
    let chatBubbleOrder = d.chatBubbleOrder === 'reverse' ? 'reverse' : 'normal';

    // 聊天气泡编辑区：排序切换 / 逐条编辑 / 顶部·底部添加 / 从正文生成
    function renderChatSeg() {
      const wrap = $('#chatSegWrap');
      if (!wrap) return;
      const orderSeg = '<div class="seg" id="f_border" style="margin-bottom:10px">'
        + '<button type="button" data-v="normal"' + (chatBubbleOrder === 'normal' ? ' class="active"' : '') + '>↓ 从上往下</button>'
        + '<button type="button" data-v="reverse"' + (chatBubbleOrder === 'reverse' ? ' class="active"' : '') + '>↑ 从下往上</button></div>';
      let html = orderSeg;
      if (!chatSegData.length) {
        html += '<p class="help">暂无气泡。点击下方「从正文生成气泡」自动分段，或「顶部加 / 底部加」手动添加。</p>';
      } else {
        html += '<div class="chat-seg-list">' + chatSegData.map(function (s, i) {
          return '<div class="chat-seg-item"><div class="chat-seg-idx">气泡 ' + (i + 1) + '</div>'
            + '<textarea class="chat-seg-ta" data-i="' + i + '">' + esc(s) + '</textarea>'
            + '<button type="button" class="btn danger chat-seg-del" data-i="' + i + '">删除</button></div>';
        }).join('') + '</div>';
      }
      html += '<div class="row" style="margin-top:8px">'
        + '<button type="button" class="btn ghost" id="segTop">↑ 顶部加气泡</button>'
        + '<button type="button" class="btn ghost" id="segAdd">↓ 底部加气泡</button>'
        + '<button type="button" class="btn ghost" id="segAuto">从正文生成气泡</button></div>';
      wrap.innerHTML = html;
      const ob = $('#f_border');
      if (ob) ob.querySelectorAll('button').forEach(function (b) {
        b.addEventListener('click', function () {
          chatBubbleOrder = b.dataset.v;
          ob.querySelectorAll('button').forEach(function (x) { x.classList.remove('active'); });
          b.classList.add('active');
        });
      });
      wrap.querySelectorAll('.chat-seg-ta').forEach(function (ta) {
        ta.addEventListener('input', function () { chatSegData[+ta.dataset.i] = ta.value; });
      });
      wrap.querySelectorAll('.chat-seg-del').forEach(function (b) {
        b.addEventListener('click', function () { chatSegData.splice(+b.dataset.i, 1); renderChatSeg(); });
      });
      const a = $('#segAuto'); if (a) a.onclick = function () {
        chatSegData = segmentToBubbles($('#f_content').value);
        if (!chatSegData.length) { toast('正文为空，无法生成'); return; }
        renderChatSeg(); toast('已从正文生成 ' + chatSegData.length + ' 条气泡');
      };
      const addTop = $('#segTop'); if (addTop) addTop.onclick = function () { chatSegData.unshift(''); renderChatSeg(); };
      const add = $('#segAdd'); if (add) add.onclick = function () { chatSegData.push(''); renderChatSeg(); };
    }

    const dmodeSeg = $('#f_dmode');
    if (dmodeSeg) {
      dmodeSeg.querySelectorAll('button').forEach(function (b) {
        b.addEventListener('click', function () {
          displayMode = b.dataset.v;
          dmodeSeg.querySelectorAll('button').forEach(function (x) { x.classList.remove('active'); });
          b.classList.add('active');
          const wrap = $('#chatSegWrap');
          const help = $('#dmodeHelp');
          if (displayMode === 'chat') {
            wrap.style.display = '';
            if (!chatSegData.length) chatSegData = segmentToBubbles($('#f_content').value);
            renderChatSeg();
            if (help) help.textContent = '聊天界面：下方为逐条气泡内容，可直接编辑；留空气泡可在保存前删除。';
          } else {
            wrap.style.display = 'none';
            if (help) help.textContent = '聊天界面模式会把正文自动切分成气泡、以聊天形式展示；切换后下方出现气泡编辑区。';
          }
        });
      });
    }
    if (displayMode === 'chat') renderChatSeg();
    $('#f_cover').onchange = async function (e) {
      const file = e.target.files[0];
      if (!file) return;
      try {
        coverData = await CBStore.fileToResizedDataURL(file);
        $('#f_cover_prev').src = coverData;
        $('#f_cover_prev').style.display = 'block';
      } catch (err) { toast('图片处理失败'); }
    };
    $('#mClose').onclick = closeModal;
    $('#mCancel').onclick = closeModal;
    $('#mSave').onclick = function () {
      const data = {
        title: $('#f_title').value.trim(),
        category: $('#f_cat').value,
        summary: $('#f_sum').value.trim(),
        content: $('#f_content').value,
        displayMode: displayMode,
        chatSegments: chatSegData,
        chatBubbleOrder: chatBubbleOrder,
        cover: coverData,
        coverShape: shapeData,
        pinned: $('#f_pinned').checked,
        order: parseInt($('#f_order').value || '0', 10),
        published: $('#f_pub').checked
      };
      if (!data.title) { toast('标题不能为空'); return; }
      const now = new Date().toISOString();
      if (isNew) {
        data.id = CBStore.uid();
        data.createdAt = now;
        data.updatedAt = now;
        content.posts.push(data);
      } else {
        const t = (content.posts || []).find(function (x) { return x.id === editingId; });
        Object.assign(t, data);
        t.updatedAt = now;
      }
      CBStore.saveDraft(content);
      closeModal();
      renderPosts($('#panel'));
      toast('已保存');
    };
  }
  function closeModal() { $('#modalMask').classList.remove('show'); }

  function renderSettings(panel) {
    const c = content.config || {};
    const t = c.theme || {};

    // 折叠分组：默认收纳（除非本机曾展开过），点标题头展开/收拢
    function collOpen(gid) { try { return localStorage.getItem('cb_admin_coll_' + gid) === '1'; } catch (e) { return false; } }
    function collBlock(gid, title, inner) {
      const open = collOpen(gid);
      return '<div class="coll-group' + (open ? '' : ' closed') + '" data-gid="' + gid + '">'
        + '<div class="coll-head"><span>' + title + '</span><span class="coll-arrow">▼</span></div>'
        + '<div class="coll-body"' + (open ? '' : ' style="display:none"') + '>' + inner + '</div></div>';
    }

    panel.innerHTML = '<div class="admin-list">'
      + '<div class="field"><label>站点名称</label><input type="text" id="s_title" value="' + esc(c.siteTitle || '') + '"/></div>'
      + '<div class="field"><label>站点简介</label><input type="text" id="s_desc" value="' + esc(c.siteDesc || '') + '"/></div>'
      + '<div class="sub">👤 作者信息（公开端「关于」页底部「作者」入口展示）</div>'
      + '<div class="field"><label>作者名称</label><input type="text" id="s_author" value="' + esc((c.author && c.author.name) || '') + '"/></div>'
      + '<div class="field"><label>作者介绍（支持换行）</label><textarea id="s_author_intro" class="auth-textarea">' + esc((c.author && c.author.intro) || '') + '</textarea></div>'
      + '<div class="checkbox-row"><input type="checkbox" id="s_tools" ' + (c.showTools !== false ? 'checked' : '') + '/><label for="s_tools">显示「黑科技 · 小工具」板块</label></div>'
      + '<div class="sub">📦 安卓安装包（.apk）</div>'
      + '<div class="field"><label>APK 直装链接（留空则不显示下载按钮）</label><input type="text" id="s_apk" value="' + esc(c.apkUrl || '') + '" placeholder="https://.../app.apk"/></div>'
      + '<div class="sub">🟢 应用图标</div>'
      + '<div class="field"><label>上传图标（建议 512×512 PNG，用于页面与 iOS 主屏；安卓安装图标发我图片替换）</label><input type="file" id="s_icon" accept="image/*"/><img class="cover-preview" id="s_icon_prev" src="' + (c.icon || '') + '" style="' + (c.icon ? '' : 'display:none') + '"/></div>'
      + '<div class="row"><button class="btn ghost" id="s_icon_clear">清除图标</button></div>'
      + collBlock('theme', '🎨 主题配色 / 🌙 暗调模式',
          '<div class="sub">🎨 主题配色</div>'
        + '<div class="color-row">'
        + '<div class="color-item"><span>主色</span><input type="color" id="t_primary" value="' + (t.primary || '#07c160') + '"/></div>'
        + '<div class="color-item"><span>背景色</span><input type="color" id="t_bg" value="' + (t.bg || '#f5f6f8') + '"/></div>'
        + '<div class="color-item"><span>卡片色</span><input type="color" id="t_card" value="' + (t.card || '#ffffff') + '"/></div>'
        + '<div class="color-item"><span>文字色</span><input type="color" id="t_text" value="' + (t.text || '#1f2329') + '"/></div>'
        + '</div>'
        + '<div class="row"><button class="btn ghost" id="t_dark">套用暗色预设</button><button class="btn ghost" id="t_reset">恢复默认</button></div>'
        + '<div class="sub">🌙 暗调模式（深色但不过黑，公开端状态栏与气泡卡片转暗调，文字自动变浅便于阅读）</div>'
        + '<div class="checkbox-row"><input type="checkbox" id="t_dim" ' + (t.dimMode ? 'checked' : '') + '/><label for="t_dim">启用暗调模式</label></div>'
        + '<div class="field"><label>暗调强度：<span id="t_dim_v">' + (t.dimLevel == null ? 5 : t.dimLevel) + '</span> %（越大越暗，越小越接近浅色）</label><input type="range" id="t_dimlevel" min="0" max="100" value="' + (t.dimLevel == null ? 5 : t.dimLevel) + '"/></div>'
        + '<div class="field"><label>暗调气泡卡片透明度：<span id="t_dimcard_v">' + (t.dimCardOpacity == null ? 40 : t.dimCardOpacity) + '</span> %（0=最通透，背景清晰可见；100=最实。越小越像玻璃气泡，能看到背景壁纸）</label><input type="range" id="t_dimcard" min="0" max="100" value="' + (t.dimCardOpacity == null ? 40 : t.dimCardOpacity) + '"/></div>'
        + '<div class="field"><label>暗调气泡卡片模糊程度：<span id="t_dimblur_v">' + (t.dimBlur == null ? 1 : t.dimBlur) + '</span> px（越大越朦胧、背景越虚；0=无模糊，玻璃边框更清透）</label><input type="range" id="t_dimblur" min="0" max="30" value="' + (t.dimBlur == null ? 1 : t.dimBlur) + '"/></div>'
        + '<div class="field"><label>暗调状态栏按钮透明度：<span id="t_tabop_v">' + (t.tabDimOpacity == null ? 60 : t.tabDimOpacity) + '</span> %（文章/黑科技/关于按钮的玻璃通透度，0=全透明、100=实色）</label><input type="range" id="t_tabop" min="0" max="100" value="' + (t.tabDimOpacity == null ? 60 : t.tabDimOpacity) + '"/></div>'
        + '<div class="field"><label>暗调状态栏按钮模糊度：<span id="t_tabblur_v">' + (t.tabDimBlur == null ? 8 : t.tabDimBlur) + '</span> px（越大越朦胧；0=无模糊，按钮更清透）</label><input type="range" id="t_tabblur" min="0" max="30" value="' + (t.tabDimBlur == null ? 8 : t.tabDimBlur) + '"/></div>'
        + '<p class="help">开启暗调模式后，本后台与公开端会同步转暗调，可直接在此看到效果；上方「背景/卡片/文字」取色会被暗调强度计算覆盖（主色仍作为强调色）。也可点后台右上角「👁 预览」对照公开端。</p>'
        )
      + '<div class="sub">🖼 壁纸</div>'
      + '<div class="field"><label>壁纸图片（建议横图，会自动压缩）</label><input type="file" id="t_wall" accept="image/*"/><img class="cover-preview" id="t_wall_prev" src="' + (t.wallpaper || '') + '" style="' + (t.wallpaper ? '' : 'display:none') + '"/></div>'
      + '<div class="row"><button class="btn ghost" id="t_wall_clear">清除壁纸</button></div>'
      + '<div class="field"><label>壁纸模糊：<span id="t_blur_v">' + (t.wallpaperBlur || 0) + '</span> px</label><input type="range" id="t_blur" min="0" max="20" value="' + (t.wallpaperBlur || 0) + '"/></div>'
      + '<div class="field"><label>壁纸透明度：<span id="t_op_v">' + (t.wallpaperOpacity == null ? 100 : t.wallpaperOpacity) + '</span> %</label><input type="range" id="t_op" min="0" max="100" value="' + (t.wallpaperOpacity == null ? 100 : t.wallpaperOpacity) + '"/></div>'
      + '<div class="checkbox-row"><input type="checkbox" id="t_wallfull" ' + (t.wallpaperFull ? 'checked' : '') + '/><label for="t_wallfull">全屏壁纸（覆盖到顶栏，背景全透明）</label></div>'
      + collBlock('trans', '🫧 透明度（浅色模式）',
          '<div class="sub">🫧 透明度</div>'
        + '<div class="field"><label>内容气泡透明度：<span id="t_cop_v">' + (t.cardOpacity == null ? 100 : t.cardOpacity) + '</span> %</label><input type="range" id="t_cop" min="10" max="100" value="' + (t.cardOpacity == null ? 100 : t.cardOpacity) + '"/></div>'
        + '<div class="field"><label>浅色模式卡片模糊度：<span id="t_cblur_v">' + (t.cardBlur == null ? 0 : t.cardBlur) + '</span> px（仅浅色模式生效；默认 0 无模糊，越大越朦胧、背景越虚）</label><input type="range" id="t_cblur" min="0" max="30" value="' + (t.cardBlur == null ? 0 : t.cardBlur) + '"/></div>'
        + '<div class="field"><label>导航按钮透明度：<span id="t_bop_v">' + (t.barOpacity == null ? (t.wallpaper ? 55 : 92) : t.barOpacity) + '</span> %</label><input type="range" id="t_bop" min="0" max="100" value="' + (t.barOpacity == null ? (t.wallpaper ? 55 : 92) : t.barOpacity) + '"/></div>'
        + '<p class="help">内容气泡 = 文章/工具/小工具面板等卡片背景（含黑科技页「小工具」内容栏），数值越小越透；导航按钮 = 最上方「文章/黑科技/关于」三个切换按钮（不含上方标题），数值越小越透。</p>'
        )
      + '<div class="row" style="margin-top:18px"><button class="btn" id="s_save">保存设置</button></div>'
      + '<p class="help">设置保存在本机草稿中，点「发布」推上线后所有人可见。改配色/壁纸时已实时预览本页效果。</p></div>';

    // 关于页文案（公开端「关于」页自定义）
    const aboutBlock = '<div class="sub">📱 关于页文案（公开端「关于」页自定义）</div>'
      + '<div class="field"><label>「关于本应用」说明（支持换行）</label><textarea id="s_about_app" class="auth-textarea">' + esc(c.aboutApp || '') + '</textarea></div>'
      + '<div class="field"><label>「安装 APP」说明文字（支持换行）</label><textarea id="s_install_text" class="auth-textarea">' + esc(c.installText || '') + '</textarea></div>';
    panel.insertAdjacentHTML('beforeend', aboutBlock);

    // 后台「站点设置」折叠分组：点标题头展开/收拢，状态本机记忆（默认收纳）
    panel.querySelectorAll('.coll-head').forEach(function (h) {
      h.addEventListener('click', function () {
        const g = h.closest('.coll-group');
        const body = g.querySelector('.coll-body');
        const willOpen = body.style.display === 'none';
        body.style.display = willOpen ? '' : 'none';
        g.classList.toggle('closed', !willOpen);
        try { localStorage.setItem('cb_admin_coll_' + g.dataset.gid, willOpen ? '1' : '0'); } catch (e) {}
      });
    });

    let wallData = t.wallpaper || '';
    let iconData = (content.config && content.config.icon) || '';

    $('#s_icon').onchange = async function (e) {
      const file = e.target.files[0];
      if (!file) return;
      try {
        iconData = await CBStore.fileToResizedDataURL(file, 512, 0.95);
        $('#s_icon_prev').src = iconData;
        $('#s_icon_prev').style.display = 'block';
        CBStore.applyIcon(iconData);
        if (content && content.config) content.config.icon = iconData;
        pushPreview();
      } catch (err) { toast('图片处理失败'); }
    };
    $('#s_icon_clear').onclick = function () {
      iconData = ''; $('#s_icon_prev').src = ''; $('#s_icon_prev').style.display = 'none'; CBStore.applyIcon('');
      if (content && content.config) content.config.icon = '';
      pushPreview();
    };

    function liveTheme() {
      const t = {
        primary: $('#t_primary').value,
        bg: $('#t_bg').value,
        card: $('#t_card').value,
        text: $('#t_text').value,
        wallpaper: wallData,
        wallpaperBlur: parseInt($('#t_blur').value, 10),
        wallpaperOpacity: parseInt($('#t_op').value, 10),
        wallpaperFull: $('#t_wallfull').checked,
        cardOpacity: parseInt($('#t_cop').value, 10),
        cardBlur: parseInt($('#t_cblur').value, 10),
        tabDimOpacity: parseInt($('#t_tabop').value, 10),
        tabDimBlur: parseInt($('#t_tabblur').value, 10),
        barOpacity: parseInt($('#t_bop').value, 10),
        dimMode: $('#t_dim').checked,
        dimLevel: parseInt($('#t_dimlevel').value, 10),
        dimCardOpacity: parseInt($('#t_dimcard').value, 10),
        dimBlur: parseInt($('#t_dimblur').value, 10)
      };
      const _on = getAdminDim();
      CBStore.applyTheme(_on ? Object.assign({}, t, { dimMode: true }) : t, { skipDim: !_on });
      // 实时同步到预览（无需点保存也能在预览看到配色/壁纸/暗调变化）
      if (content && content.config) content.config.theme = t;
      $('#t_blur_v').textContent = $('#t_blur').value;
      $('#t_op_v').textContent = $('#t_op').value;
      $('#t_cop_v').textContent = $('#t_cop').value;
      $('#t_cblur_v').textContent = $('#t_cblur').value;
      $('#t_bop_v').textContent = $('#t_bop').value;
      $('#t_dim_v').textContent = $('#t_dimlevel').value;
      $('#t_dimcard_v').textContent = $('#t_dimcard').value;
      $('#t_dimblur_v').textContent = $('#t_dimblur').value;
      $('#t_tabop_v').textContent = $('#t_tabop').value;
      $('#t_tabblur_v').textContent = $('#t_tabblur').value;
      pushPreview();
    }

    ['t_primary', 't_bg', 't_card', 't_text'].forEach(function (id) {
      const node = $('#' + id);
      if (node) node.addEventListener('input', liveTheme);
    });
    $('#t_blur').addEventListener('input', liveTheme);
    $('#t_op').addEventListener('input', liveTheme);
    $('#t_cop').addEventListener('input', liveTheme);
    $('#t_cblur').addEventListener('input', liveTheme);
    $('#t_bop').addEventListener('input', liveTheme);
    $('#t_dim').addEventListener('change', liveTheme);
    $('#t_dimlevel').addEventListener('input', liveTheme);
    $('#t_dimcard').addEventListener('input', liveTheme);
    $('#t_dimblur').addEventListener('input', liveTheme);
    $('#t_tabop').addEventListener('input', liveTheme);
    $('#t_tabblur').addEventListener('input', liveTheme);

    $('#t_dark').onclick = function () {
      $('#t_primary').value = '#07c160'; $('#t_bg').value = '#0f1115';
      $('#t_card').value = '#1a1d23'; $('#t_text').value = '#e6e8eb';
      liveTheme();
    };
    $('#t_reset').onclick = function () {
      $('#t_primary').value = '#07c160'; $('#t_bg').value = '#f5f6f8';
      $('#t_card').value = '#ffffff'; $('#t_text').value = '#1f2329';
      liveTheme();
    };

    $('#t_wall').onchange = async function (e) {
      const file = e.target.files[0];
      if (!file) return;
      try {
        wallData = await CBStore.fileToResizedDataURL(file, 1400, 0.8);
        $('#t_wall_prev').src = wallData;
        $('#t_wall_prev').style.display = 'block';
        liveTheme();
      } catch (err) { toast('图片处理失败'); }
    };
    $('#t_wall_clear').onclick = function () {
      wallData = ''; $('#t_wall_prev').src = ''; $('#t_wall_prev').style.display = 'none'; liveTheme();
    };

    $('#s_save').onclick = function () {
      content.config = content.config || {};
      content.config.siteTitle = $('#s_title').value.trim();
      content.config.siteDesc = $('#s_desc').value.trim();
      content.config.author = { name: $('#s_author').value.trim(), intro: $('#s_author_intro').value };
      content.config.showTools = $('#s_tools').checked;
      content.config.apkUrl = ($('#s_apk').value || '').trim();
      content.config.icon = iconData;
      content.config.aboutApp = $('#s_about_app').value;
      content.config.installText = $('#s_install_text').value;
      content.config.theme = {
        primary: $('#t_primary').value,
        bg: $('#t_bg').value,
        card: $('#t_card').value,
        text: $('#t_text').value,
        wallpaper: wallData,
        wallpaperBlur: parseInt($('#t_blur').value, 10),
        wallpaperOpacity: parseInt($('#t_op').value, 10),
        wallpaperFull: $('#t_wallfull').checked,
        cardOpacity: parseInt($('#t_cop').value, 10),
        cardBlur: parseInt($('#t_cblur').value, 10),
        tabDimOpacity: parseInt($('#t_tabop').value, 10),
        tabDimBlur: parseInt($('#t_tabblur').value, 10),
        barOpacity: parseInt($('#t_bop').value, 10),
        dimMode: $('#t_dim').checked,
        dimLevel: parseInt($('#t_dimlevel').value, 10),
        dimCardOpacity: parseInt($('#t_dimcard').value, 10),
        dimBlur: parseInt($('#t_dimblur').value, 10)
      };
      CBStore.saveDraft(content);
      toast('已保存');
    };
  }

  function defaultToolsConfig() {
    return [
      { id: 't_base64', name: '🔐 Base64 编解码', engine: 'base64', enabled: true, order: 1 },
      { id: 't_counter', name: '🔢 字数统计', engine: 'counter', enabled: true, order: 2 },
      { id: 't_timestamp', name: '⏱ 时间戳转换', engine: 'timestamp', enabled: true, order: 3 },
      { id: 't_text', name: '📝 文本处理', engine: 'text', enabled: true, order: 4 },
      { id: 't_color', name: '🎨 颜色转换 HEX⇄RGB', engine: 'color', enabled: true, order: 5 },
      { id: 't_qrcode', name: '🔳 二维码生成', engine: 'qrcode', enabled: true, order: 6 },
      { id: 't_filelink', name: '🔗 文件转直链下载', engine: 'filelink', enabled: true, order: 7 },
      { id: 't_imgcompress', name: '🖼 图片压缩', engine: 'imgcompress', enabled: true, order: 8 },
      { id: 't_pomodoro', name: '🍅 番茄钟', engine: 'pomodoro', enabled: true, order: 9 }
    ];
  }

  function renderGuide(panel) {
    const g = (content.config && content.config.guide) || {};
    const guideUrl = location.origin + '/guide.html?sharecode=AK6QIELR67';
    panel.innerHTML = '<div class="admin-list">'
      + '<div class="sub">📥 引导下载页（独立网页 <code>guide.html</code>，用于引导用户下载安装 APK）</div>'
      + '<div class="guide-preview-box"><div class="gpb-lbl">📱 实时预览（根据下方设置即时更新，预览内按钮不会真正跳转 / 下载）</div>'
      + '<div class="gpb-frame"><iframe id="g_preview" class="gpb-iframe" title="引导页预览"></iframe></div></div>'
      + '<div class="checkbox-row"><input type="checkbox" id="g_enabled" ' + (g.enabled ? 'checked' : '') + '/><label for="g_enabled">启用引导页（关闭时访问引导页显示「未配置」占位）</label></div>'
      + '<div class="field"><label>页面标题</label><input type="text" id="g_title" value="' + esc(g.title || '') + '" placeholder="如：内容盒子"/></div>'
      + '<div class="field"><label>副标题 / 应用名</label><input type="text" id="g_subtitle" value="' + esc(g.subtitle || '') + '" placeholder="如：你的随身内容工具"/></div>'
      + '<div class="field"><label>内容介绍（支持换行）</label><textarea id="g_intro" class="auth-textarea">' + esc(g.intro || '') + '</textarea></div>'
      + '<div class="field"><label>APK 直装链接（留空则使用「站点设置」里的 APK 链接）</label><input type="text" id="g_apk" value="' + esc(g.apkUrl || '') + '" placeholder="https://.../app.apk?sharecode=..."/></div>'
      + '<div class="field"><label>安装按钮文字</label><input type="text" id="g_btn" value="' + esc(g.buttonText || '立即下载安装') + '"/></div>'
      + '<div class="field"><label>图标 / Logo（上传图片，自动居中裁剪为 256×256 方形图标）</label>'
      + '<div class="icon-upload"><div class="icon-prev" id="g_icon_prev">' + (g.icon ? '<img src="' + esc(g.icon) + '" alt="icon"/>' : '<span class="ph">预览</span>') + '</div>'
      + '<div class="icon-actions"><input type="file" id="g_icon_file" accept="image/*" style="display:none">'
      + '<button type="button" class="btn ghost" id="g_icon_pick">选择图片</button>'
      + (g.icon ? '<button type="button" class="btn ghost" id="g_icon_del">移除</button>' : '') + '</div></div>'
      + '<p class="help">支持横屏 / 竖屏 / 长图，上传后自动缩放并居中裁剪为 256×256 方形图标，无需手动处理尺寸。</p></div>'
      + '<div class="row" style="margin-top:14px"><button class="btn" id="g_save">保存引导页设置</button>'
      + '<a class="btn ghost" id="g_open" href="guide.html?sharecode=AK6QIELR67" target="_blank" rel="noopener">👁 打开引导页</a></div>'
      + '<div class="guide-url-box"><div class="gub-lbl">引导页独立地址（可直接发送给用户）</div>'
      + '<div class="gub-row"><input class="gub-input" id="g_url" type="text" readonly value="' + esc(guideUrl) + '">'
      + '<button type="button" class="btn ghost" id="g_url_cp">复制</button></div>'
      + '<p class="help">该地址即引导页独立链接，可在「站点设置 → APK 直装链接」里指向它作为统一下载入口。</p></div>';

    var currentIcon = g.icon || '';
    var pickBtn = $('#g_icon_pick');
    var fileInput = $('#g_icon_file');
    var prev = $('#g_icon_prev');
    if (pickBtn && fileInput) {
      pickBtn.onclick = function () { fileInput.click(); };
      fileInput.onchange = function () {
        var f = fileInput.files && fileInput.files[0];
        if (!f) return;
        resizeImageToSquare(f, 256, function (dataUrl) {
          currentIcon = dataUrl;
          if (prev) prev.innerHTML = '<img src="' + dataUrl + '" alt="icon"/>';
          updatePreview();
          toast('图标已裁剪，保存后生效');
        }, function (err) { toast('图片处理失败：' + err); });
      };
    }
    var delBtn = $('#g_icon_del');
    if (delBtn) delBtn.onclick = function () { currentIcon = ''; if (prev) prev.innerHTML = '<span class="ph">预览</span>'; if (fileInput) fileInput.value = ''; updatePreview(); };

    var urlCp = $('#g_url_cp');
    if (urlCp) urlCp.onclick = function () {
      var inp = $('#g_url');
      var doCopy = function (text) {
        if (navigator.clipboard && navigator.clipboard.writeText) {
          navigator.clipboard.writeText(text).then(function () { toast('地址已复制'); }, function () { toast('复制失败，请手动复制'); });
        } else { toast('当前环境不支持复制'); }
      };
      if (inp) { inp.focus(); inp.select(); doCopy(inp.value); }
    };

    // ---- 引导页实时预览：用 iframe 加载一份与 guide.html 同源渲染，注入当前表单值 ----
    var GUIDE_CSS = ':root{--g-primary:#07c160;--g-primary-d:#06a653;--g-bg:#f2f5f8;--g-card:#fff;--g-text:#1f2329;--g-sub:#8a9099}'
      + '*{box-sizing:border-box;-webkit-tap-highlight-color:transparent}html,body{margin:0;padding:0}'
      + 'body{font-family:-apple-system,BlinkMacSystemFont,"PingFang SC","Microsoft YaHei","Helvetica Neue",Arial,sans-serif;'
      + 'background:linear-gradient(160deg,#e9f7ef 0%,var(--g-bg) 45%);color:var(--g-text);min-height:100vh;'
      + 'display:flex;align-items:center;justify-content:center;padding:24px 16px}'
      + '.guide-wrap{width:100%;max-width:420px}.guide-card{background:var(--g-card);border-radius:22px;padding:34px 24px 28px;'
      + 'text-align:center;box-shadow:0 12px 40px rgba(7,193,96,.12)}'
      + '.g-icon{width:96px;height:96px;border-radius:22px;object-fit:cover;margin:0 auto 18px;display:block;box-shadow:0 6px 18px rgba(0,0,0,.12)}'
      + '.g-title{font-size:24px;font-weight:700;margin:0 0 6px;letter-spacing:.5px}.g-sub{font-size:14px;color:var(--g-sub);margin:0 0 20px}'
      + '.g-intro{font-size:15px;line-height:1.75;color:#3a3f47;text-align:left;background:#f6f8fa;border-radius:14px;'
      + 'padding:16px 18px;margin:0 0 22px;white-space:pre-wrap;word-break:break-word}'
      + '.g-btn{display:block;width:100%;border:none;background:linear-gradient(180deg,var(--g-primary),var(--g-primary-d));'
      + 'color:#fff;font-size:17px;font-weight:600;padding:16px;border-radius:14px;margin-bottom:12px;box-shadow:0 8px 20px rgba(7,193,96,.32)}'
      + '.g-copy{display:block;width:100%;border:1px solid #d7dde3;background:#fff;color:#5a6470;font-size:14px;padding:12px;border-radius:12px}'
      + '.g-tip{font-size:13px;color:var(--g-sub);margin:16px 0 0;line-height:1.6}'
      + '.g-empty{text-align:center;color:var(--g-sub);padding:40px 10px;font-size:15px;line-height:1.8}.g-empty .em{font-size:40px;display:block;margin-bottom:12px}';

    function buildGuideHtml(f) {
      var inner;
      if (!f.enabled) {
        inner = '<div class="g-empty"><span class="em">📦</span>引导页尚未配置<br>请在内容盒子后台「引导页」中编辑并发布</div>';
      } else {
        var title = f.title || '下载安装';
        var sub = f.subtitle || '';
        var intro = f.intro || '';
        var apk = f.apkUrl || '';
        var btn = f.buttonText || '立即下载安装';
        var h = '';
        if (f.icon) h += '<img class="g-icon" src="' + esc(f.icon) + '" alt="icon"/>';
        h += '<h1 class="g-title">' + esc(title) + '</h1>';
        if (sub) h += '<p class="g-sub">' + esc(sub) + '</p>';
        if (intro) h += '<div class="g-intro">' + esc(intro).replace(/\n/g, '<br>') + '</div>';
        if (apk) {
          h += '<button class="g-btn" disabled>' + esc(btn) + '</button>';
          h += '<button class="g-copy" disabled>复制下载链接</button>';
        } else {
          h += '<div class="g-tip">尚未配置安装包链接，请联系管理员。</div>';
        }
        h += '<p class="g-tip">下载完成后，按系统提示完成安装即可使用。</p>';
        inner = h;
      }
      return '<!DOCTYPE html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">'
        + '<style>' + GUIDE_CSS + '</style></head><body><div class="guide-wrap"><div class="guide-card" id="card">' + inner + '</div></div></body></html>';
    }

    function updatePreview() {
      var siteTitle = (content.config && content.config.siteTitle) || '下载安装';
      var f = {
        enabled: $('#g_enabled').checked,
        title: $('#g_title').value.trim() || siteTitle,
        subtitle: $('#g_subtitle').value.trim(),
        intro: $('#g_intro').value,
        apkUrl: $('#g_apk').value.trim(),
        buttonText: ($('#g_btn').value || '').trim(),
        icon: currentIcon
      };
      var ifr = $('#g_preview');
      if (ifr) ifr.srcdoc = buildGuideHtml(f);
    }

    ['g_enabled', 'g_title', 'g_subtitle', 'g_intro', 'g_apk', 'g_btn'].forEach(function (id) {
      var el = document.getElementById(id);
      if (el) { el.addEventListener('input', updatePreview); el.addEventListener('change', updatePreview); }
    });
    updatePreview();

    $('#g_save').onclick = function () {
      content.config = content.config || {};
      content.config.guide = {
        enabled: $('#g_enabled').checked,
        title: $('#g_title').value.trim(),
        subtitle: $('#g_subtitle').value.trim(),
        intro: $('#g_intro').value,
        apkUrl: ($('#g_apk').value || '').trim(),
        buttonText: ($('#g_btn').value || '立即下载安装').trim(),
        icon: currentIcon
      };
      CBStore.saveDraft(content);
      toast('已保存（点「发布」推上线后生效）');
    };
  }

  // 上传图片居中裁剪为 size×size 正方形（兼容横屏/竖屏/长图），输出 PNG dataURL
  function resizeImageToSquare(file, size, cb, errCb) {
    var reader = new FileReader();
    reader.onload = function (e) {
      var img = new Image();
      img.onload = function () {
        try {
          var w = img.width, h = img.height;
          var side = Math.min(w, h);
          var sx = (w - side) / 2, sy = (h - side) / 2;
          var canvas = document.createElement('canvas');
          canvas.width = size; canvas.height = size;
          var ctx = canvas.getContext('2d');
          ctx.drawImage(img, sx, sy, side, side, 0, 0, size, size);
          cb(canvas.toDataURL('image/png'));
        } catch (err) { errCb && errCb(err && err.message ? err.message : '处理失败'); }
      };
      img.onerror = function () { errCb && errCb('图片解码失败'); };
      img.src = e.target.result;
    };
    reader.onerror = function () { errCb && errCb('文件读取失败'); };
    reader.readAsDataURL(file);
  }

  function renderTools(panel) {
    const c = (content.config = content.config || {});
    let tools = c.tools;
    if (!Array.isArray(tools) || !tools.length) { tools = c.tools = defaultToolsConfig(); }

    function renumber() { tools.forEach(function (t, i) { t.order = i + 1; }); }

    function draw() {
      const engines = (window.CBTools ? CBTools.engines() : []);
      let rows = '';
      tools.forEach(function (t, i) {
        const eng = engines.find(function (e) { return e.id === t.engine; });
        const engName = eng ? eng.name : ('未知：' + t.engine);
        rows += '<div class="card adm-card" style="padding:12px;margin-bottom:8px">'
          + '<div class="card-body">'
          + '<div class="card-title" style="font-size:14px">' + esc(t.name) + '</div>'
          + '<p class="card-desc">引擎：' + esc(engName) + '</p></div>'
          + '<div class="adm-actions">'
          + '<button class="btn ghost" data-up="' + i + '">↑ 上移</button>'
          + '<button class="btn ghost" data-down="' + i + '">↓ 下移</button>'
          + '<label class="tool-toggle"><input type="checkbox" data-on="' + i + '" ' + (t.enabled !== false ? 'checked' : '') + '/> 显示</label>'
          + '<button class="btn ghost" data-rename="' + i + '">改名</button>'
          + '<button class="btn danger" data-del="' + i + '">删除</button>'
          + '</div></div>';
      });

      const links = (c.links || []).slice();
      const groups = (c.linkGroups = c.linkGroups || []);
      // 归一化：确保每个分组（含「未分组」）的 order 连续 1..n，兼容旧草稿缺失/重复的 order
      [null].concat(groups.map(function (g) { return g.id; })).forEach(function (gid) {
        (c.links || []).filter(function (l) { return (l.groupId || null) === gid; })
          .sort(function (a, b) { return (a.order || 0) - (b.order || 0); })
          .forEach(function (x, k) { x.order = k + 1; });
      });
      // 注意：data-g-sel 必须存「快捷方式自身 id」，才能在 onchange 里反查到该条链接写入 groupId
      function groupSelect(linkId, selectedGroupId) {
        return '<select class="link-group-sel" data-g-sel="' + (linkId || '') + '">'
          + '<option value="">未分组</option>'
          + groups.slice().sort(function (a, b) { return (a.order || 0) - (b.order || 0); })
            .map(function (g) { return '<option value="' + g.id + '" ' + (selectedGroupId === g.id ? 'selected' : '') + '>' + esc(g.name) + '</option>'; })
            .join('')
          + '</select>';
      }
      // 取某合集（或「未分组」）下的快捷方式，按 order 排序
      function linksOfGroup(gid) {
        return links.filter(function (l) { return (l.groupId || null) === gid; })
          .sort(function (a, b) { return (a.order || 0) - (b.order || 0); });
      }
      // 在同组合内上移 / 下移：真正移动位置并重新编号 1..n（即使初始 order 重复/缺失也能正确换序）
      function moveLink(id, dir) {
        try {
          const lk = (c.links || []).find(function (x) { return x.id === id; });
          if (!lk) return;
          const gid = (lk.groupId || null);
          const arr = (c.links || []).filter(function (l) { return (l.groupId || null) === gid; })
            .sort(function (a, b) { return (a.order || 0) - (b.order || 0); });
          const i = arr.findIndex(function (x) { return x.id === id; });
          if (i < 0) return;
          const j = i + dir;
          if (j < 0 || j >= arr.length) return; // 已在顶端 / 底端，无需移动
          const item = arr.splice(i, 1)[0];
          arr.splice(j, 0, item);
          arr.forEach(function (x, k) { x.order = k + 1; }); // 重新连续编号，确保换序可见
          CBStore.saveDraft(content);
          draw();
          toast(dir < 0 ? '已上移' : '已下移');
        } catch (e) {
          toast('排序失败：' + (e && e.message ? e.message : e));
        }
      }
      // 单条快捷方式卡片（含合集下拉 + 组内排序 ↑↓ + 编辑/删除）
      function linkCard(lk) {
        const ic = lk.icon ? '<img class="link-ic" src="' + esc(lk.icon) + '" alt=""/>' : '';
        return '<div class="card adm-card" style="padding:12px;margin-bottom:8px">'
          + '<div class="card-body">'
          + '<div class="adm-link-head">'
          + (ic ? ic : '')
          + '<div class="card-title" style="font-size:14px">' + esc(lk.title) + '</div></div>'
          + (lk.description ? '<p class="card-desc">' + esc(lk.description) + '</p>' : '')
          + '<p class="card-desc" style="word-break:break-all">' + esc(lk.url) + '</p></div>'
          + '<div class="adm-actions"><span class="tool-toggle">合集：' + groupSelect(lk.id, lk.groupId) + '</span>'
          + '<button class="btn ghost" data-l-up="' + lk.id + '">↑ 上移</button>'
          + '<button class="btn ghost" data-l-down="' + lk.id + '">↓ 下移</button>'
          + '<button class="btn ghost" data-edit-link="' + lk.id + '">编辑</button>'
          + '<button class="btn danger" data-del-link="' + lk.id + '">删除</button></div></div>';
      }
      let linkRows = links.length ? '' : '<div class="empty">还没有热门工具</div>';
      if (links.length) {
        const gList = groups.slice().sort(function (a, b) { return (a.order || 0) - (b.order || 0); });
        gList.forEach(function (g) {
          const items = linksOfGroup(g.id);
          if (!items.length) return;
          linkRows += '<div class="adm-group-title">📁 ' + esc(g.name) + '（' + items.length + ' 个 · 可用 ↑↓ 排序）</div>';
          items.forEach(function (lk) { linkRows += linkCard(lk); });
        });
        const ungr = linksOfGroup(null);
        if (ungr.length) {
          linkRows += '<div class="adm-group-title">📂 未分组（' + ungr.length + ' 个 · 可用 ↑↓ 排序）</div>';
          ungr.forEach(function (lk) { linkRows += linkCard(lk); });
        }
      }

      let groupRows = groups.length ? '' : '<div class="empty">还没有合集</div>';
      groups.slice().sort(function (a, b) { return (a.order || 0) - (b.order || 0); }).forEach(function (g, idx, arr) {
        const cnt = links.filter(function (l) { return l.groupId === g.id; }).length;
        groupRows += '<div class="card adm-card" style="padding:10px 12px;margin-bottom:8px"><div class="card-body">'
          + '<div class="card-title" style="font-size:14px">📁 ' + esc(g.name) + '</div>'
          + '<p class="card-desc">' + cnt + ' 个快捷方式</p></div>'
          + '<div class="adm-actions">'
          + (idx > 0 ? '<button class="btn ghost" data-g-up="' + g.id + '">↑</button>' : '')
          + (idx < arr.length - 1 ? '<button class="btn ghost" data-g-down="' + g.id + '">↓</button>' : '')
          + '<button class="btn ghost" data-g-ren="' + g.id + '">改名</button>'
          + '<button class="btn danger" data-g-del="' + g.id + '">取消合集</button></div></div>';
      });

      panel.innerHTML = '<div class="admin-list">'
        + '<div class="sub">🧰 小工具（公开端「黑科技」里的「黑科技 · 小工具」逐条显示）</div>'
        + '<div id="tool_list">' + rows + '</div>'
        + '<div class="row" style="margin:6px 0 18px"><button class="btn" id="tk_add">+ 添加工具</button><button class="btn ghost" id="tk_save">保存</button></div>'
        + '<div class="sub">📁 合集（把工具分组归类，公开端「热门工具集合」按合集折叠展示）</div>'
        + '<div id="group_list">' + groupRows + '</div>'
        + '<div class="row" style="margin:6px 0 18px"><button class="btn" id="g_add">+ 新建合集</button></div>'
        + '<div class="sub">🔥 热门工具（可上传图标、写介绍；用上方「合集」下拉把工具归入合集）</div>'
        + '<div class="field"><label>名称</label><input type="text" id="lk_title" placeholder="如：我的博客"/></div>'
        + '<div class="field"><label>网址（需以 http:// 或 https:// 开头）</label><input type="text" id="lk_url" placeholder="https://..."/></div>'
        + '<div class="field"><label>链接介绍（可选，显示在名称下方）</label><input type="text" id="lk_desc" placeholder="一句话描述这个链接"/></div>'
        + '<div class="field"><label>图标（可选，上传图片，建议 256×256）</label><input type="file" id="lk_icon" accept="image/*"/><img class="cover-preview" id="lk_icon_prev" style="display:none"/></div>'
        + '<div class="row"><button class="btn" id="lk_add">添加快捷方式</button><button class="btn ghost" id="lk_save">保存更改</button></div>'
        + '<div id="lk_list" style="margin-top:14px">' + linkRows + '</div>'
        + '<p class="help">「添加快捷方式」即新增一条；「保存更改」保存本区全部改动（含合集归属、图标、介绍）。改完点顶部「发布」推上线后所有人可见。合集可新建 / 改名 / 取消（取消后其下快捷方式回到「未分组」）/ 用 ↑↓ 排序；每个快捷方式用「合集」下拉归入对应合集。快捷方式在每个合集（含未分组）内可用「↑ 上移 / ↓ 下移」自定义排序，顺序会同步到公开端。</p></div>';

      // 工具：上移 / 下移 / 显示切换 / 改名 / 删除
      panel.querySelectorAll('[data-up]').forEach(function (b) {
        b.onclick = function () { const i = +b.dataset.up; if (i > 0) { const t = tools[i]; tools[i] = tools[i - 1]; tools[i - 1] = t; renumber(); draw(); } };
      });
      panel.querySelectorAll('[data-down]').forEach(function (b) {
        b.onclick = function () { const i = +b.dataset.down; if (i < tools.length - 1) { const t = tools[i]; tools[i] = tools[i + 1]; tools[i + 1] = t; renumber(); draw(); } };
      });
      panel.querySelectorAll('[data-on]').forEach(function (b) {
        b.onclick = function () { tools[+b.dataset.on].enabled = b.checked; };
      });
      panel.querySelectorAll('[data-rename]').forEach(function (b) {
        b.onclick = function () { const t = tools[+b.dataset.rename]; const v = prompt('修改工具名称：', t.name); if (v === null) return; t.name = v.trim() || t.name; draw(); };
      });
      panel.querySelectorAll('[data-del]').forEach(function (b) {
        b.onclick = function () { if (!confirm('确定删除该工具？')) return; tools.splice(+b.dataset.del, 1); renumber(); draw(); };
      });

      $('#tk_add').onclick = openAddTool;
      $('#tk_save').onclick = function () { renumber(); CBStore.saveDraft(content); toast('已保存'); };

      // 热门工具
      $('#lk_add').onclick = async function () {
        const title = $('#lk_title').value.trim();
        const url = $('#lk_url').value.trim();
        if (!title || !url) { toast('请填写名称和网址'); return; }
        if (!/^https?:\/\//i.test(url)) { toast('网址需以 http:// 或 https:// 开头'); return; }
        let iconData = '';
        const f = ($('#lk_icon').files && $('#lk_icon').files[0]);
        if (f) {
          try { iconData = await CBStore.fileToResizedDataURL(f, 256, 0.9); }
          catch (err) { toast('图标处理失败，已忽略'); }
        }
        c.links = c.links || [];
        const maxOrder = c.links.reduce(function (m, x) { return Math.max(m, (x.order || 0)); }, 0);
        c.links.push({ id: CBStore.uid(), title: title, url: url, description: $('#lk_desc').value.trim(), icon: iconData, order: maxOrder + 1 });
        CBStore.saveDraft(content);
        $('#lk_title').value = ''; $('#lk_url').value = ''; $('#lk_desc').value = '';
        $('#lk_icon').value = ''; $('#lk_icon_prev').style.display = 'none';
        draw();
        toast('已添加');
      };
      panel.querySelectorAll('[data-del-link]').forEach(function (b) {
        b.onclick = function () {
          if (!confirm('确定删除该快捷方式？')) return;
          c.links = (c.links || []).filter(function (x) { return x.id !== b.dataset.delLink; });
          CBStore.saveDraft(content);
          draw();
          toast('已删除');
        };
      });
      panel.querySelectorAll('[data-edit-link]').forEach(function (b) {
        b.onclick = function () {
          const lk = (c.links || []).find(function (x) { return x.id === b.dataset.editLink; });
          if (lk) openLinkEditor(lk);
        };
      });
      $('#lk_save').onclick = function () { CBStore.saveDraft(content); toast('已保存快捷方式与合集'); };

      // 快捷方式：同组合内上移 / 下移 —— 事件委托（只对 panel 挂一次），重渲染后依旧有效
      if (!panel._lDelegated) {
        panel._lDelegated = true;
        panel.addEventListener('click', function (e) {
          const up = e.target.closest('[data-l-up]');
          const down = e.target.closest('[data-l-down]');
          if (up) { e.preventDefault(); moveLink(up.getAttribute('data-l-up'), -1); }
          else if (down) { e.preventDefault(); moveLink(down.getAttribute('data-l-down'), 1); }
        });
      }

      // 合集管理
      $('#g_add').onclick = function () {
        const name = prompt('合集名称：', '新合集');
        if (name === null) return;
        const nm = name.trim();
        if (!nm) { toast('名称不能为空'); return; }
        c.linkGroups = c.linkGroups || [];
        c.linkGroups.push({ id: 'g_' + CBStore.uid(), name: nm, order: c.linkGroups.length + 1 });
        CBStore.saveDraft(content);
        draw();
        toast('已新建合集：' + nm);
      };
      panel.querySelectorAll('[data-g-ren]').forEach(function (b) {
        b.onclick = function () {
          const g = (c.linkGroups || []).find(function (x) { return x.id === b.dataset.gRen; });
          if (!g) return;
          const v = prompt('修改合集名称：', g.name);
          if (v === null) return;
          const nm = v.trim();
          if (!nm) { toast('名称不能为空'); return; }
          g.name = nm;
          CBStore.saveDraft(content);
          draw();
        };
      });
      panel.querySelectorAll('[data-g-del]').forEach(function (b) {
        b.onclick = function () {
          if (!confirm('取消该合集会把它下面的快捷方式移回「未分组」，确定？')) return;
          const gid = b.dataset.gDel;
          c.linkGroups = (c.linkGroups || []).filter(function (x) { return x.id !== gid; });
          (c.links || []).forEach(function (l) { if (l.groupId === gid) l.groupId = null; });
          CBStore.saveDraft(content);
          draw();
          toast('已取消合集');
        };
      });
      function moveGroup(id, dir) {
        const arr = (c.linkGroups || []).slice().sort(function (a, b) { return (a.order || 0) - (b.order || 0); });
        const i = arr.findIndex(function (g) { return g.id === id; });
        if (i < 0) return;
        const j = i + dir;
        if (j < 0 || j >= arr.length) return;
        const t = arr[i]; arr[i] = arr[j]; arr[j] = t;
        arr.forEach(function (g, k) { g.order = k + 1; });
        CBStore.saveDraft(content);
        draw();
      }
      panel.querySelectorAll('[data-g-up]').forEach(function (b) {
        b.onclick = function () { moveGroup(b.dataset.gUp, -1); };
      });
      panel.querySelectorAll('[data-g-down]').forEach(function (b) {
        b.onclick = function () { moveGroup(b.dataset.gDown, 1); };
      });
      panel.querySelectorAll('[data-g-sel]').forEach(function (s) {
        s.onchange = function () {
          const lk = (c.links || []).find(function (x) { return x.id === s.dataset.gSel; });
          if (!lk) return;
          lk.groupId = s.value || null;
          CBStore.saveDraft(content);
          draw();
        };
      });
    }

    function openLinkEditor(lk) {
      const m = $('#modal');
      m.innerHTML = '<button class="close" id="lClose">×</button><h3>编辑快捷方式</h3>'
        + '<div class="field"><label>名称</label><input type="text" id="l_title" value="' + esc(lk.title) + '"/></div>'
        + '<div class="field"><label>网址</label><input type="text" id="l_url" value="' + esc(lk.url) + '"/></div>'
        + '<div class="field"><label>链接介绍（可选）</label><input type="text" id="l_desc" value="' + esc(lk.description || '') + '"/></div>'
        + '<div class="field"><label>图标（可选，上传图片替换）</label><input type="file" id="l_icon" accept="image/*"/><img class="cover-preview" id="l_icon_prev" src="' + (lk.icon || '') + '" style="' + (lk.icon ? '' : 'display:none') + '"/></div>'
        + '<div class="row"><button class="btn" id="lSave">保存</button><button class="btn danger" id="lDel">删除</button><button class="btn ghost" id="lCancel">取消</button></div>';
      $('#modalMask').classList.add('show');
      let iconData = lk.icon || '';
      $('#l_icon').onchange = async function (e) {
        const file = e.target.files[0];
        if (!file) return;
        try {
          iconData = await CBStore.fileToResizedDataURL(file, 256, 0.9);
          $('#l_icon_prev').src = iconData;
          $('#l_icon_prev').style.display = 'block';
        } catch (err) { toast('图片处理失败'); }
      };
      $('#lClose').onclick = closeModal;
      $('#lCancel').onclick = closeModal;
      $('#lSave').onclick = function () {
        const title = $('#l_title').value.trim();
        const url = $('#l_url').value.trim();
        if (!title || !url) { toast('请填写名称和网址'); return; }
        if (!/^https?:\/\//i.test(url)) { toast('网址需以 http(s):// 开头'); return; }
        lk.title = title; lk.url = url; lk.description = $('#l_desc').value.trim(); lk.icon = iconData;
        CBStore.saveDraft(content);
        closeModal();
        draw();
        toast('已更新');
      };
      $('#lDel').onclick = function () {
        if (!confirm('确定删除该快捷方式？')) return;
        c.links = (c.links || []).filter(function (x) { return x.id !== lk.id; });
        CBStore.saveDraft(content);
        closeModal();
        draw();
        toast('已删除');
      };
    }

    function openAddTool() {
      const engines = (window.CBTools ? CBTools.engines() : []);
      const opts = engines.map(function (e) { return '<option value="' + e.id + '">' + esc(e.name) + '</option>'; }).join('');
      const m = $('#modal');
      m.innerHTML = '<button class="close" id="aClose">×</button><h3>添加工具</h3>'
        + '<div class="field"><label>工具类型</label><select id="a_engine">' + opts + '</select></div>'
        + '<div class="field"><label>显示名称</label><input type="text" id="a_name" placeholder="如：我的二维码"/></div>'
        + '<div id="a_extra"></div>'
        + '<div class="row"><button class="btn" id="aSave">添加</button><button class="btn ghost" id="aCancel">取消</button></div>';
      $('#modalMask').classList.add('show');
      function syncExtra() {
        const eid = $('#a_engine').value;
        let ex = '';
        if (eid === 'link') ex = '<div class="field"><label>按钮文字（可选）</label><input type="text" id="a_text" placeholder="点击下方按钮打开链接"/></div>'
          + '<div class="field"><label>链接网址</label><input type="text" id="a_url" placeholder="https://..."/></div>';
        else if (eid === 'note') ex = '<div class="field"><label>说明文字</label><textarea id="a_text"></textarea></div>';
        $('#a_extra').innerHTML = ex;
      }
      syncExtra();
      $('#a_engine').onchange = syncExtra;
      $('#aClose').onclick = closeModal;
      $('#aCancel').onclick = closeModal;
      $('#aSave').onclick = function () {
        const eid = $('#a_engine').value;
        const eng = engines.find(function (e) { return e.id === eid; });
        const name = $('#a_name').value.trim() || (eng ? eng.name : eid);
        const item = { id: 't_' + CBStore.uid(), name: name, engine: eid, enabled: true, order: tools.length + 1 };
        if (eid === 'link') {
          const url = $('#a_url') ? $('#a_url').value.trim() : '';
          if (!/^https?:\/\//i.test(url)) { toast('链接网址需以 http(s):// 开头'); return; }
          item.url = url;
          item.text = $('#a_text') ? $('#a_text').value.trim() : '';
        } else if (eid === 'note') {
          item.text = $('#a_text') ? $('#a_text').value : '';
        }
        tools.push(item);
        CBStore.saveDraft(content);
        closeModal();
        draw();
        toast('已添加：' + name);
      };
    }

    draw();
  }

  function renderPublish(panel) {
    panel.innerHTML = '<div class="admin-list"><div class="tool"><h3>📡 发布更新</h3>'
      + '<p class="card-desc">本应用没有云端。更新内容的方式：在本机改好 → 导出 <b>content.json</b> → 让助手把它推上线（说一声「发布」即可）。别人重开 App（或自动更新）就会同步到新内容。</p>'
      + '<div class="row"><button class="btn" id="p_export">导出 content.json</button><button class="btn ghost" id="p_copy">复制内容文本</button><button class="btn ghost" id="p_local">仅存本机草稿</button></div>'
      + '<p class="help">本应用没有云端。更新内容的方式：在本机改好 → 点「复制内容文本」把内容发给我（说一声「发布」）→ 我推上线，别人重开 App 即同步。也可「导出 content.json」文件发我。</p>'
      + '<div class="sw-version-box"><h4>🔧 SW 缓存版本（Service Worker）</h4>'
      + '<p class="help">线上已发布版本：<b id="sw_online">读取中…</b>　|　本机运行版本：<b id="sw_running">读取中…</b></p>'
      + '<p class="help" id="sw_time">读取中…</p>'
      + '<p class="help">每次部署发布后线上版本号会自动递增，重进本页即刷新。若「本机运行版本」落后于「线上已发布版本」，说明设备尚未同步，重开 App 即可（无需清数据）。</p>'
      + '</div></div>';
    $('#p_export').onclick = function () { CBStore.exportContent(content); toast('已导出，发给助手发布'); };
    $('#p_copy').onclick = function () { if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(JSON.stringify(content, null, 2)); toast('已复制，发给助手即可发布'); };
    $('#p_local').onclick = function () { CBStore.saveDraft(content); toast('已存本机'); };
    refreshSwVersion();
  }

  function refreshSwVersion() {
    const onlineEl = document.getElementById('sw_online');
    const runEl = document.getElementById('sw_running');
    const timeEl = document.getElementById('sw_time');
    if (onlineEl) {
      fetch('sw.js?sharecode=AK6QIELR67&pv=1').then(function (r) { return r.text(); }).then(function (t) {
        const m = t.match(/const\s+CACHE\s*=\s*['"]([^'"]+)['"]/);
        onlineEl.textContent = m ? m[1] : '未知';
        if (timeEl) timeEl.textContent = '最近读取：' + new Date().toLocaleString('zh-CN');
      }).catch(function () { onlineEl.textContent = '读取失败'; });
    }
    if (runEl && 'serviceWorker' in navigator) {
      let done = false;
      const onMsg = function (e) {
        if (e.data && e.data.type === 'SW_VERSION') {
          if (!done) { runEl.textContent = e.data.version || '未知'; done = true; }
          navigator.serviceWorker.removeEventListener('message', onMsg);
        }
      };
      navigator.serviceWorker.addEventListener('message', onMsg);
      setTimeout(function () { if (!done) { runEl.textContent = '未响应'; navigator.serviceWorker.removeEventListener('message', onMsg); } }, 3000);
      navigator.serviceWorker.ready.then(function (reg) {
        if (reg.active) reg.active.postMessage({ type: 'GET_VERSION' });
      }).catch(function () {});
    }
  }

  boot();
})();
