const CACHE_NAME = "villa-romeo-app-v4";
const CORE_ASSETS = [
  "/",
  "/index.html",
  "/guest.html",
  "/manifest.webmanifest",
  "/assets/icons/icon-192.png",
  "/assets/icons/icon-512.png",
  "/assets/icons/apple-touch-icon.png",
  "/assets/icons/favicon-32.png",
  "/src/app.js",
  "/src/guest.js",
  "/src/store.js",
  "/src/data.js",
  "/src/styles.css",
  "/src/guest.css"
];

self.addEventListener("install", event => {
  event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.addAll(CORE_ASSETS)));
  self.skipWaiting();
});

self.addEventListener("activate", event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(key => key !== CACHE_NAME).map(key => caches.delete(key)))
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", event => {
  if (event.request.method !== "GET") return;
  const url = new URL(event.request.url);
  if ([".html", ".js", ".css", ".webmanifest"].some(ext => url.pathname.endsWith(ext)) || url.pathname === "/" || url.pathname === "/sw.js") {
    event.respondWith(fetch(event.request));
    return;
  }

  event.respondWith(
    fetch(event.request)
      .then(response => {
        const copy = response.clone();
        caches.open(CACHE_NAME).then(cache => cache.put(event.request, copy));
        return response;
      })
      .catch(() => caches.match(event.request))
  );
});

self.addEventListener("push", event => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { title: "La villa Roméo", body: event.data ? event.data.text() : "" };
  }

  const title = data.title || "La villa Roméo";
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
