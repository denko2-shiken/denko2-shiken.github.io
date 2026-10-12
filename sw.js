// オフラインでも使えるようにするための仕組み（サービスワーカー）
// ファイルを変えて公開したら、VERSION の数字を1つ上げる（古い保存分が入れ替わる）
const VERSION = "v9";
const CACHE = "denko2-renshu-" + VERSION;
const FILES = [
  "./",
  "./index.html",
  "./style.css",
  "./app.js",
  "./osusume.js",
  "./questions/keisan.js",
  "./questions/hourei.js",
  "./questions/kizai.js",
  "./questions/sekou.js",
  "./questions/oen.js",
  "./oen.js",
  "./site.js",
  "./manifest.webmanifest",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
  "./icons/apple-touch-icon.png"
];

self.addEventListener("install", e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(FILES)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// ネットにつながるときは最新を取りに行き、つながらないときは保存分を使う
self.addEventListener("fetch", e => {
  // 外部のアクセス解析などは扱わず、同じオリジンのGETだけを保存する。
  if (e.request.method !== "GET" || new URL(e.request.url).origin !== self.location.origin) return;
  e.respondWith(
    fetch(e.request)
      .then(res => {
        const copy = res.clone();
        caches.open(CACHE).then(c => c.put(e.request, copy));
        return res;
      })
      .catch(() => caches.match(e.request, { ignoreSearch: true }))
  );
});
