const CACHE_NAME = "villa-romeo-app-v5";
const CORE_ASSETS = [
  "/",
  "/index.html",
  "/guest.html",
  "/manifest.webmanifest",
  "/assets/icons/icon-192.png",
  "/assets/icons/icon-512.png",
  "/assets/icons/apple-touch-icon.png",
  "/assets/icons/favicon-32.png",
  "/src/app.js?v=4",
  "/src/guest.js?v=4",
  "/src/store.js",
  "/src/data.js",
  "/src/styles.css?v=4",
  "/src/guest.css?v=4"
];

self.addEventListener("install", event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => Promise.allSettled(CORE_ASSETS.map(asset => cache.add(asset))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(key => key !== CACHE_NAME).map(key => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", event => {
  if (event.request.method !== "GET") return;

  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) return;

  if (event.request.mode === "navigate") {
    event.respondWith(
      fetch(event.request).catch(() => caches.match("/index.html"))
    );
    return;
  }

  if (isFreshAsset(url.pathname)) {
    event.respondWith(
      fetch(event.request).catch(() => caches.match(event.request))
    );
    return;
  }

  event.respondWith(
    fetch(event.request)
      .then(response => {
        if (response && response.ok) {
          const copy = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(event.request, copy)).catch(() => {});
        }
        return response;
      })
      .catch(() => caches.match(event.request).then(cached => cached || caches.match("/index.html")))
  );
});

function isFreshAsset(pathname) {
  return pathname === "/sw.js"
    || pathname.endsWith(".html")
    || pathname.endsWith(".js")
    || pathname.endsWith(".css")
    || pathname.endsWith(".webmanifest");
}

self.addEventListener("push", event => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { title: "La villa Romeo", body: event.data ? event.data.text() : "" };
  }

  const title = data.title || "La villa Romeo";
  const options = {
    body: data.body || "",
    icon: data.icon || "/assets/icons/icon-192.png",
    badge: data.badge || "/assets/icons/favicon-32.png",
    tag: data.tag || "villa-romeo",
    data: { url: data.url || "/" },
    vibrate: [200, 100, 200],
    requireInteraction: false
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", event => {
  event.notification.close();
  const targetUrl = event.notification.data?.url || "/";
  event.waitUntil(
    clients.matchAll({ type: "window", includeUncontrolled: true }).then(windowClients => {
      for (const client of windowClients) {
        if (client.url.includes(self.location.origin) && "focus" in client) {
          client.focus();
          return;
        }
      }
      return clients.openWindow(targetUrl);
    })
  );
});
