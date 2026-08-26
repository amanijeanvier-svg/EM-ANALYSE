/* ================================================================
   Service worker — stratégie "réseau en priorité" pour l'appli.
   Important : le navigateur ne détecte une mise à jour de CE fichier
   qu'en le comparant octet par octet à chaque visite — donc à chaque
   fois que tu publies une nouvelle version de l'appli, INCRÉMENTE
   CACHE_NAME ci-dessous (v3, v4, v5...), même si tu ne changes rien
   d'autre à ce fichier. C'est ce qui garantit que les utilisateurs
   reçoivent la nouvelle version sans avoir à désinstaller/réinstaller.
================================================================= */
const CACHE_NAME = 'ea-cabinet-cache-v4';
const STATIC_ASSETS = ['manifest.json', 'icon-192.png', 'icon-512.png', 'icon-512-maskable.png'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(STATIC_ASSETS))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  const isNavigation = req.mode === 'navigate' ||
    (req.method === 'GET' && (req.headers.get('accept') || '').includes('text/html'));

  if (isNavigation) {
    // Page principale (index.html) : toujours essayer le réseau EN PREMIER,
    // pour que chaque visite en ligne charge la dernière version publiée.
    // Le cache ne sert que si la personne est hors-ligne.
    event.respondWith(
      fetch(req)
        .then((res) => {
          const clone = res.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(req, clone));
          return res;
        })
        .catch(() => caches.match(req).then((r) => r || caches.match('index.html')))
    );
    return;
  }

  // Fichiers statiques (icônes, manifest) : cache d'abord, réseau en repli.
  event.respondWith(
    caches.match(req).then((r) => r || fetch(req))
  );
});

/* ================================================================
   NOTIFICATIONS PUSH — reçues même app fermée (tant que le navigateur
   tourne en arrière-plan), contrairement aux notifications locales
   déclenchées depuis l'app elle-même. Le corps ne révèle jamais le
   contenu du pari, juste qu'un nouveau pari est disponible.
================================================================= */
self.addEventListener('push', (event) => {
  let data = {};
  try { data = event.data ? event.data.json() : {}; }
  catch (e) { data = { title: 'EA', body: event.data ? event.data.text() : '' }; }
  const title = data.title || 'EA — Cabinet d\'Analyse Privée';
  const options = {
    body: data.body || '',
    icon: 'icon-192.png',
    badge: 'icon-192.png',
    tag: data.tag || 'ea-push',
    data: { url: data.url || './' },
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const targetUrl = (event.notification.data && event.notification.data.url) || './';
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windowClients) => {
      for (const client of windowClients) { if ('focus' in client) return client.focus(); }
      if (clients.openWindow) return clients.openWindow(targetUrl);
    })
  );
});
