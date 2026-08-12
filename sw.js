/* Service worker.
   An arena is the worst network environment a web app will ever meet: thousands
   of phones, one saturated AP, and a match starting in ninety seconds. The app
   shell is precached so scouting works with no connection at all, and the data
   feeds fall back to whatever was last seen rather than to an error. */

const VERSION = 'gh-v2-2026-08-12';
const SHELL = `shell-${VERSION}`;
const RUNTIME = `runtime-${VERSION}`;

const SHELL_FILES = [
  '/', '/index.html', '/styles.css', '/logo.png', '/manifest.webmanifest',
  '/src/main.js', '/src/util.js', '/src/icons.js', '/src/store.js', '/src/api.js',
  '/src/charts.js', '/src/solver.js', '/src/qr.js', '/src/ui.js',
  '/src/views/parts.js', '/src/views/overview.js', '/src/views/strategy.js',
  '/src/views/event.js', '/src/views/collect.js', '/src/views/pipeline.js',
  '/src/views/team.js',
];

self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const cache = await caches.open(SHELL);
    // addAll fails the whole install if any single file 404s, so add them
    // individually and let the rest through.
    await Promise.all(SHELL_FILES.map(url =>
      cache.add(new Request(url, { cache: 'reload' })).catch(() => {})));
    self.skipWaiting();
  })());
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys
      .filter(k => k !== SHELL && k !== RUNTIME)
      .map(k => caches.delete(k)));
    await self.clients.claim();
  })());
});

const isFeed = url =>
  url.hostname.endsWith('thebluealliance.com') || url.hostname.endsWith('statbotics.io');

self.addEventListener('fetch', event => {
  const { request } = event;
  if (request.method !== 'GET') return;                  // never touch the board PUT

  const url = new URL(request.url);

  // Full page loads: try the network so a deploy lands, fall back to the shell.
  if (request.mode === 'navigate') {
    event.respondWith((async () => {
      try { return await fetch(request); }
      catch { return (await caches.match('/index.html')) || Response.error(); }
    })());
    return;
  }

  // Live feeds: fresh when possible, last known when not. A stale OPR beats a
  // blank table when you are standing in a queue line.
  if (isFeed(url)) {
    event.respondWith((async () => {
      const cache = await caches.open(RUNTIME);
      try {
        const fresh = await fetch(request);
        if (fresh.ok) cache.put(request, fresh.clone());
        return fresh;
      } catch {
        const hit = await cache.match(request);
        if (hit) return hit;
        return new Response(JSON.stringify({ offline: true }), {
          status: 503, headers: { 'Content-Type': 'application/json' },
        });
      }
    })());
    return;
  }

  // Our own files and the fonts: serve from cache, refresh in the background.
  if (url.origin === self.location.origin || url.hostname.endsWith('gstatic.com')
      || url.hostname.endsWith('googleapis.com')) {
    event.respondWith((async () => {
      const cached = await caches.match(request);
      const network = fetch(request).then(res => {
        if (res.ok) caches.open(SHELL).then(c => c.put(request, res.clone()));
        return res;
      }).catch(() => null);
      return cached || (await network) || Response.error();
    })());
  }
});
