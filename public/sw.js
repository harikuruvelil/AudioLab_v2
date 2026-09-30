const CACHE_NAME = "audiolab-v2-shell-__VERSION__";
const APP_SHELL = /* SHELL_FILES */ [];
const INDEX_HTML = /* INDEX_HTML */ "";
const ROOMS_CACHE = "audiolab-v2-rooms";
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(async (cache) => {
      await cache.addAll(
        APP_SHELL.map(
          (path) =>
            new Request(new URL(path, self.registration.scope).href, {
              cache: "reload",
            }),
        ),
      );
      // HTML is compiled into this worker so HTTP/CDN caches cannot mix releases.
      await cache.put(
        new URL("index.html", self.registration.scope).href,
        new Response(INDEX_HTML, {
          headers: { "Content-Type": "text/html; charset=utf-8" },
        }),
      );
    }),
  );
});
self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const old = (await caches.keys()).filter(
        (key) => key.startsWith("audiolab-v2-shell-") && key !== CACHE_NAME,
      );
      await Promise.all(
        old
          .slice(0, Math.max(0, old.length - 1))
          .map((key) => caches.delete(key)),
      );
      await self.clients.claim();
    })(),
  );
});
self.addEventListener("fetch", (event) => {
  const request = event.request,
    url = new URL(request.url);
  if (
    request.method !== "GET" ||
    url.origin !== self.location.origin ||
    !url.href.startsWith(self.registration.scope) ||
    url.pathname.endsWith("/sw.js")
  )
    return;
  if (request.mode === "navigate") {
    // Keep HTML and its hashed assets from one coherent installed release.
    event.respondWith(
      (async () => {
        const cache = await caches.open(CACHE_NAME);
        return (
          (await cache.match(
            new URL("index.html", self.registration.scope).href,
          )) || fetch(request)
        );
      })(),
    );
    return;
  }
  if (
    !/\/(assets|icons|worklets|irs|fonts)\//.test(url.pathname) &&
    !url.pathname.endsWith("/manifest.json")
  )
    return;
  event.respondWith(
    (async () => {
      const cache = await caches.open(
        url.pathname.includes("/irs/") ? ROOMS_CACHE : CACHE_NAME,
      );
      const cached = await cache.match(request);
      if (cached) return cached;
      const response = await fetch(request);
      if (response.ok) await cache.put(request, response.clone());
      return response;
    })(),
  );
});
self.addEventListener("message", (event) => {
  if (
    event.data?.type !== "APPLY_UPDATE" ||
    !event.source?.url?.startsWith(self.registration.scope)
  )
    return;
  event.waitUntil(
    (async () => {
      // Only the requesting, paused tab reloads; another tab may still be playing.
      event.source.postMessage({ type: "APPLYING_UPDATE" });
      await self.skipWaiting();
    })(),
  );
});
