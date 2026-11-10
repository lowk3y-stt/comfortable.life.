/* Comfortable life — работа без интернета.
   Файлы приложения кэшируются при первом открытии; шрифты Google сохраняются при первом удачном запросе.
   При выпуске новой версии измените VERSION — старый кэш удалится сам. */
var VERSION = 'cl-app-0.7.0';
var SHELL = [
  './', 'index.html', 'privacy.html', 'manifest.webmanifest', 'css/app.css',
  'js/i18n.js', 'js/i18n-ext.js', 'js/lang-es.js', 'js/lang-fr.js', 'js/lang-it.js', 'js/lang-zh.js', 'js/store.js', 'js/theme.js', 'js/ui.js', 'js/logic.js', 'js/e2e.js', 'js/sync.js', 'js/account.js', 'js/auth-ui.js', 'js/pwd.js', 'js/yandex.js', 'config.js',
  'js/view-today.js', 'js/view-home.js', 'js/view-notes.js', 'js/view-calendar.js',
  'js/view-sport.js', 'js/view-health.js', 'js/view-family.js', 'js/view-settings.js',
  'js/assistant.js', 'js/app.js',
  'icons/icon.svg', 'icons/icon-192.png', 'icons/icon-512.png', 'icons/maskable-192.png', 'icons/maskable-512.png', 'icons/apple-touch-icon.png'
];

self.addEventListener('install', function (e) {
  e.waitUntil(caches.open(VERSION).then(function (c) { return c.addAll(SHELL); }).then(function () { return self.skipWaiting(); }));
});
self.addEventListener('activate', function (e) {
  e.waitUntil(caches.keys().then(function (keys) {
    return Promise.all(keys.filter(function (k) { return k !== VERSION; }).map(function (k) { return caches.delete(k); }));
  }).then(function () { return self.clients.claim(); }));
});
self.addEventListener('fetch', function (e) {
  var req = e.request;
  if (req.method !== 'GET') return;
  var url = new URL(req.url);
  var sameOrigin = url.origin === self.location.origin;
  var fonts = url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com';
  if (!sameOrigin && !fonts) return;
  /* config.js и страница: сначала сеть, чтобы новый адрес сервера подхватывался сразу */
  if (sameOrigin && (req.mode === 'navigate' || /\/config\.js$/.test(url.pathname))) {
    e.respondWith(fetch(req).then(function (res) {
      if (res && res.ok) { var copy = res.clone(); caches.open(VERSION).then(function (c) { c.put(req, copy); }); }
      return res;
    }).catch(function () { return caches.match(req, { ignoreSearch: true }).then(function (hit) { return hit || caches.match('index.html'); }); }));
    return;
  }
  e.respondWith(
    caches.match(req, { ignoreSearch: true }).then(function (hit) {
      var net = fetch(req).then(function (res) {
        if (res && (res.ok || res.type === 'opaque')) { var copy = res.clone(); caches.open(VERSION).then(function (c) { c.put(req, copy); }); }
        return res;
      }).catch(function () { return hit || (req.mode === 'navigate' ? caches.match('index.html') : undefined); });
      return hit || net;
    })
  );
});
