// Offline cache for the app shell (mountain areas may have weak signal).
const CACHE = 'mythops-v4';
const VOICE_CACHE = 'mythops-voice';
const SHELL = ['./', './index.html', './story.js', './route.js', './plot.js', './app.js', './manifest.webmanifest', './icon-192.png', './icon-512.png', './icon-180.png'];

// Only the app itself is saved at install. The recorded voice (about 1,100 files) is saved
// afterwards by the page, a few at a time, so one dropped file never blocks the update.
self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL.concat(['./voice/index.json', './voice/silence.m4a']))).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE && k !== VOICE_CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin === location.origin && /\/voice\/.+\.m4a$/.test(url.pathname)) {
    // recordings never change under the same name: cache first
    e.respondWith(caches.match(req).then((r) => r || fetch(req).then((res) => {
      const copy = res.clone();
      if (res.ok) caches.open(VOICE_CACHE).then((c) => c.put(req, copy));
      return res;
    })));
  } else if (url.origin === location.origin) {
    // network first so updates arrive, cache as fallback when offline
    e.respondWith(
      fetch(req).then((res) => {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(req, copy));
        return res;
      }).catch(() => caches.match(req).then((r) => r || caches.match('./index.html')))
    );
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
