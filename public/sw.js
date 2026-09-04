/*
 * Service worker tối giản cho PWA.
 *
 * QUAN TRỌNG: chỉ cache static asset (JS/CSS/icon do Next sinh ra).
 * TUYỆT ĐỐI không cache request tới Firestore/Firebase — dữ liệu giải phải
 * luôn realtime, và Firestore SDK đã có cơ chế offline riêng.
 */
const CACHE = "pickleball-static-v1";
const PRECACHE = ["/icon.svg", "/manifest.webmanifest"];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(PRECACHE)));
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return; // bỏ qua Firebase & CDN
  const isStatic =
    url.pathname.startsWith("/_next/static/") ||
    url.pathname === "/icon.svg" ||
    url.pathname === "/icon-maskable.svg" ||
    url.pathname === "/manifest.webmanifest";
  if (!isStatic) return; // trang HTML luôn lấy từ mạng

  event.respondWith(
    caches.match(request).then(
      (cached) =>
        cached ||
        fetch(request).then((response) => {
          if (response.ok) {
            const copy = response.clone();
            caches.open(CACHE).then((cache) => cache.put(request, copy));
          }
          return response;
        }),
    ),
  );
});
