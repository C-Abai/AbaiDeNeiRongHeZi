const CACHE = 'contentbox-v98';
const SC = 'LXZ6WX2ERL';
const ASSETS = [
  './index.html?sharecode=' + SC,
  './admin.html?sharecode=' + SC,
  './preview.html?sharecode=' + SC,
  './watch.html?sharecode=' + SC,
  './css/style.css?sharecode=' + SC,
  './js/store.js?sharecode=' + SC,
  './js/notice.js?sharecode=' + SC,
  './js/app.js?sharecode=' + SC,
  './js/admin.js?sharecode=' + SC,
  './icon.svg?sharecode=' + SC,
  './manifest.webmanifest?sharecode=' + SC,
  './meta.json?sharecode=' + SC
];

self.addEventListener('install', (event) => {
  // 容错预缓存：单个资源失败不影响整体安装，避免 SW 卡死在旧版本
  // 关键：cache.add 用 cache:'reload' 绕过浏览器「HTTP 缓存」，否则旧 HTTP 缓存会把
  // 过期的 tools.js/app.js 写进 SW 缓存，导致「版本号更新了、工具却显示未知引擎」的错配。
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    await Promise.allSettled(ASSETS.map((u) => cache.add(new Request(u, { cache: 'reload' })).catch((e) => console.warn('SW cache add failed:', u, e))));
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// 后台或 app.js 发来指令（安卓 standalone 关键）
self.addEventListener('message', (event) => {
  if (!event.data) return;
  if (event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  } else if (event.data.type === 'GET_VERSION') {
    const reply = { type: 'SW_VERSION', version: CACHE };
    if (event.source && event.source.postMessage) event.source.postMessage(reply);
    else self.clients.matchAll().then((cs) => cs.forEach((c) => c.postMessage(reply)));
  }
});

// 判断是否为应用外壳资源（index/admin/preview/watch 页面、css、js、icon、manifest）
function isShellUrl(url) {
  return /\/(index\.html|admin\.html|preview\.html|watch\.html|css\/style\.css|js\/store\.js|js\/notice\.js|js\/app\.js|js\/admin\.js|icon\.svg|manifest\.webmanifest)(\?|$)/.test(url);
}

// 网络优先：启动即同步最新；失败回退「当前版本」缓存（离线可用）
// 注意：回退只允许查当前 CACHE，严禁回退到旧版本缓存，否则会出现
// 「新 content.json + 旧 tools.js」这类跨版本错配，导致工具显示「未知引擎」。
// 关键：fetch 用 cache:'reload' 绕过浏览器 HTTP 缓存，确保每次都向服务器取真正最新的文件
// （否则浏览器 HTTP 缓存会返回一个没有 pomodoro/imgcompress 引擎的旧 tools.js）。
function netFirst(event) {
  return fetch(new Request(event.request, { cache: 'reload' }))
    .then((res) => {
      if (res && res.status === 200) {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(event.request, copy));
      }
      return res;
    })
    .catch(() => caches.open(CACHE).then((c) => c.match(event.request)));
}

// 缓存优先（即时返回）+ 后台静默刷新：应用外壳走这条，重开即秒开、无网络往返。
// 【v85】数据层 store.js 已改为每次启动后台无条件校验 GitHub 全量内容（不再依赖 meta.json
// 指纹），内容有变化就 onUpdate 重绘；所以壳从缓存秒开是安全的，内容不会被旧部署快照锁死。
// content.json / meta.json 在下方 fetch 分支里被完全放行、不进 SW 缓存。
function staleWhileRevalidate(event) {
  const req = event.request;
  return caches.open(CACHE).then((cache) =>
    cache.match(req).then((cached) => {
      const network = fetch(new Request(req, { cache: 'reload' }))
        .then((res) => {
          if (res && res.status === 200) cache.put(req, res.clone());
          return res;
        })
        .catch(() => cached);
      // 有缓存则立即返回缓存（秒开），同时后台更新缓存；无缓存则等网络
      return cached || network;
    })
  );
}

// 缓存优先：离线可用，后台静默更新
function cacheFirst(event) {
  return caches.match(event.request).then((cached) => {
    const network = fetch(event.request)
      .then((res) => {
        if (res && res.status === 200) {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(event.request, copy));
        }
        return res;
      })
      .catch(() => cached);
    return cached || network;
  });
}

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  const url = event.request.url;
  const req = event.request;
  // 预览资源（带 pv=1）：始终走网络、不进缓存，确保后台「预览」所见即所得
  if (url.indexOf('pv=1') > -1) {
    event.respondWith(fetch(req));
    return;
  }
  // 【v79】引导页：独立下载页，永远走网络、绝不进 SW 缓存。
  // 旧版导航统一 netFirst 会把 guide.html 写进壳缓存，容易与主应用界面串味；
  // 现在它完全不受 SW 接管，打开就是一张干净的下载卡片，也回不到内容界面。
  if (url.indexOf('guide.html') > -1) {
    event.respondWith(fetch(req));
    return;
  }
  // 【v79】数据请求（同域 + 跨域 GitHub raw）全部放行，由页面自己的 no-store + 超时控制。
  // SW 绝不缓存 content.json / meta.json：旧版会缓存「链接不完整」HTML 和带时间戳的
  // raw 副本，造成老内容残留、缓存膨胀，也是「刷新好多遍才是新内容」的帮凶。
  if (url.indexOf('content.json') > -1 || url.indexOf('meta.json') > -1) {
    event.respondWith(fetch(req));
    return;
  }
  // 【v98】影视观看页 watch.html 是纯壳（目标站点由 ?url= 动态注入），内容几乎不变。
  // 旧版把它归在 navigate→netFirst，每次点影视快捷站点都要等网络往返，表现为「先黑屏再出界面」。
  // 改为缓存优先秒开：壳立即呈现（含加载提示），目标站点 iframe 并行加载，消除黑屏等待。
  if (url.indexOf('watch.html') > -1) {
    event.respondWith(
      caches.open(CACHE).then((cache) =>
        // ignoreSearch：watch.html?url=xxx 与预缓存的 watch.html?sharecode=xxx 视为同一壳，命中秒开
        cache.match(req, { ignoreSearch: true }).then((cached) => {
          const network = fetch(new Request(req, { cache: 'reload' }))
            .then((res) => {
              if (res && res.status === 200) cache.put(req, res.clone());
              return res;
            })
            .catch(() => cached);
          return cached || network;
        })
      )
    );
    return;
  }
  // 导航请求（HTML 文档）与后台页：网络优先，确保每次扫码 / 打开都是最新页面
  if (req.mode === 'navigate' || url.indexOf('admin.html') > -1) {
    event.respondWith(netFirst(event));
    return;
  }
  // 【v79】应用外壳（js/css/icon/manifest）：缓存优先 + 后台静默更新，首屏秒开。
  // 新版本 SW install 时已用 cache:'reload' 预缓存全部新壳，配合 app.js 的
  // controllerchange 自动 reload，部署后一次刷新即生效，不会残留旧壳。
  // 旧版这里走网络优先，每次打开都要重下全部 js/css，是「网页端延迟大」的主因之一。
  if (isShellUrl(url)) {
    event.respondWith(staleWhileRevalidate(event));
    return;
  }
  // 其他静态资源：缓存优先，离线可用
  event.respondWith(cacheFirst(event));
});
