/* 绷绷绷单词 · 离线缓存
 * 改完代码把 VERSION 加一（bbb-v33 → bbb-v34），旧缓存会自动清掉。
 */
const VERSION = 'bbb-v34';
const AUDIO_CACHE = 'bbb-audio-v1';
// 发音缓存上限：每条约 10~30KB，600 条大约 6~18MB，超出后把最早存进来的清掉
const AUDIO_MAX = 600;
const CORE = ['./', './index.html', './data/words.js', './manifest.webmanifest', './icon-192.png', './icon-512.png'];

function trimAudio(c) {
  return c.keys().then((keys) => {
    if (keys.length <= AUDIO_MAX) return null;
    return Promise.all(keys.slice(0, keys.length - AUDIO_MAX).map((k) => c.delete(k)));
  }).catch(() => {});
}

self.addEventListener('install', (e) => {
  e.waitUntil(
    // 逐个缓存：缺一个文件也不至于整个 install 失败（addAll 是原子的）
    caches.open(VERSION)
      .then((c) => Promise.all(CORE.map((u) => c.add(u).catch(() => {}))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys
        .filter((k) => k !== VERSION && k !== AUDIO_CACHE)
        .map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  // 发音：有道录音，命中缓存直接给，没有就顺手存一份
  if (url.hostname === 'dict.youdao.com' && url.pathname.indexOf('/dictvoice') === 0) {
    e.respondWith(
      caches.open(AUDIO_CACHE).then((c) => c.match(req).then((hit) => {
        if (hit) return hit;
        return fetch(req).then((res) => {
          if (res && (res.status === 200 || res.type === 'opaque')) {
            c.put(req, res.clone()).then(() => trimAudio(c)).catch(() => {});
          }
          return res;
        });
      }))
    );
    return;
  }

  if (url.origin !== self.location.origin) return;

  // 页面走网络优先：改了内容立刻生效，断网才用缓存
  if (req.mode === 'navigate') {
    e.respondWith(
      fetch(req).then((res) => {
        const copy = res.clone();
        caches.open(VERSION).then((c) => c.put(req, copy)).catch(() => {});
        return res;
      }).catch(() => caches.match(req, { ignoreSearch: true }).then((hit) => hit || caches.match('./index.html')))
    );
    return;
  }

  // 其他静态文件：缓存优先，后台更新
  e.respondWith(
    caches.match(req, { ignoreSearch: true }).then((hit) => {
      const net = fetch(req).then((res) => {
        if (res && res.status === 200 && res.type === 'basic') {
          const copy = res.clone();
          caches.open(VERSION).then((c) => c.put(req, copy)).catch(() => {});
        }
        return res;
      }).catch(() => hit);
      return hit || net;
    })
  );
});
