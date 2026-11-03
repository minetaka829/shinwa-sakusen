// Offline cache for the app shell (mountain areas may have weak signal).
const CACHE = 'mythops-v14';
const VOICE_CACHE = 'mythops-voice';
const FILM_CACHE = 'mythops-film'; // 作戦映像（ページが保存する）
const SHELL = ['./', './index.html', './story.js', './route.js', './site.js', './plot.js', './bossgl.js', './boss.png', './app.js', './fx.js', './manifest.webmanifest', './icon-192.png', './icon-512.png', './icon-180.png'];

// Only the app itself is saved at install. The recorded voice (about 1,100 files) is saved
// afterwards by the page, a few at a time, so one dropped file never blocks the update.
self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL.concat(['./voice/index.json', './voice/env.json', './voice/silence.m4a']).map((u) => new Request(u, { cache: 'reload' })))).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE && k !== VOICE_CACHE && k !== FILM_CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

function timeout(p, ms) {
  return new Promise((ok, ng) => {
    const t = setTimeout(() => ng('timeout'), ms);
    p.then((r) => { clearTimeout(t); ok(r); }, (err) => { clearTimeout(t); ng(err); });
  });
}

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin === location.origin && /\/film\/.+\.mp4$/.test(url.pathname)) {
    // 映像は大きいので、保存済みならそれを、なければネットから（保存はページが行う）
    e.respondWith(caches.match(req).then((r) => r || fetch(req)));
  } else if (url.origin === location.origin && /\/voice\/.+\.m4a$/.test(url.pathname)) {
    // recordings never change under the same name: cache first
    e.respondWith(caches.match(req).then((r) => r || fetch(req).then((res) => {
      const copy = res.clone();
      if (res.ok) caches.open(VOICE_CACHE).then((c) => c.put(req, copy));
      return res;
    })));
  } else if (url.origin === location.origin) {
    // network first (skipping the browser's HTTP cache) so updates arrive; on a slow mountain
    // connection give up after 3 s and use the saved copy, while the download goes on to refresh it
    const net = fetch(req, { cache: 'no-cache' }).then((res) => {
      if (res.ok) { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(req, copy)); }
      return res;
    });
    e.waitUntil(net.catch(() => {}));
    e.respondWith(timeout(net, 3000).catch(() =>
      caches.match(req, { ignoreSearch: true }).then((r) => r || (req.mode === 'navigate' ? caches.match('./index.html') : null)).then((r) => r || net)));
  } else if (url.hostname.endsWith('fonts.googleapis.com') || url.hostname.endsWith('fonts.gstatic.com')) {
    e.respondWith(
      caches.match(req).then((r) => r || fetch(req).then((res) => {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(req, copy));
        return res;
      }))
    );
  }
});
