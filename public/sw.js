const CACHE_PREFIX = "collected-pages-shell";
const CACHE_VERSION = "__BUILD_VERSION__";
const SHELL_CACHE = `${CACHE_PREFIX}-${CACHE_VERSION}`;
const SCOPE_URL = new URL(self.registration.scope);
const BASE_PATH = SCOPE_URL.pathname.endsWith("/") ? SCOPE_URL.pathname : `${SCOPE_URL.pathname}/`;
const scopedPath = (relative = "") => new URL(relative.replace(/^\//, ""), SCOPE_URL).pathname;
const ROOT_PATH = scopedPath();
const OFFLINE_PATH = scopedPath("offline.html");
const SW_PATH = scopedPath("sw.js");
const PRECACHE = [
  ROOT_PATH,
  OFFLINE_PATH,
  scopedPath("manifest.webmanifest"),
  scopedPath("icons/favicon-v2-32.png"),
  scopedPath("icons/icon-v2-192.png"),
  scopedPath("icons/icon-v2-512.png"),
  scopedPath("icons/icon-maskable-v2-512.png"),
  scopedPath("icons/apple-touch-icon-v2.png"),
  scopedPath("icons/favicon-32.png"),
  scopedPath("icons/icon-192.png"),
  scopedPath("icons/icon-512.png"),
  scopedPath("icons/icon-maskable-512.png"),
  scopedPath("icons/apple-touch-icon.png"),
];

function relativePath(url) {
  if (!url.pathname.startsWith(BASE_PATH)) return undefined;
  return url.pathname.slice(BASE_PATH.length);
}

function isPrivateOrTransient(url) {
  const relative = relativePath(url);
  if (relative === undefined) return true;
  return (
    relative.includes("private-import") ||
    relative.endsWith(".zip") ||
    relative.endsWith(".json.backup") ||
    url.pathname === SW_PATH ||
    relative.startsWith("api/")
  );
}

function sameOriginAsset(value) {
  try {
    const url = new URL(value, SCOPE_URL);
    if (url.origin !== SCOPE_URL.origin || isPrivateOrTransient(url)) return undefined;
    return url.pathname + url.search;
  } catch {
    return undefined;
  }
}

async function fetchFresh(pathname) {
  const request = new Request(new URL(pathname, self.location.origin), { cache: "reload" });
  const response = await fetch(request);
  if (!response.ok) throw new Error(`Precache failed: ${response.status}`);
  return response;
}

async function precacheShell(cache) {
  await Promise.all(PRECACHE.map(async (pathname) => {
    await cache.put(pathname, await fetchFresh(pathname));
  }));
}

async function precacheDiscoveredAssets(cache) {
  const shell = await cache.match(ROOT_PATH);
  if (!shell) return;
  const html = await shell.text();
  const htmlAssets = Array.from(html.matchAll(/(?:src|href)=["']([^"']+)["']/gi))
    .map((match) => sameOriginAsset(match[1]))
    .filter((value) => value && value !== ROOT_PATH);
  await Promise.allSettled(htmlAssets.map(async (asset) => {
    await cache.put(asset, await fetchFresh(asset));
  }));

  const stylesheets = htmlAssets.filter((asset) => asset.includes(".css"));
  for (const stylesheet of stylesheets) {
    const response = await cache.match(stylesheet);
    if (!response) continue;
    const css = await response.text();
    const nestedAssets = Array.from(css.matchAll(/url\(["']?([^"')]+)["']?\)/gi))
      .map((match) => sameOriginAsset(new URL(match[1], new URL(stylesheet, SCOPE_URL.origin)).href))
      .filter(Boolean);
    await Promise.allSettled(nestedAssets.map(async (asset) => {
      await cache.put(asset, await fetchFresh(asset));
    }));
  }
}

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(SHELL_CACHE).then(async (cache) => {
      await precacheShell(cache);
      await precacheDiscoveredAssets(cache);
    }),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(
        keys
          .filter((key) => key.startsWith(CACHE_PREFIX) && key !== SHELL_CACHE)
          .map((key) => caches.delete(key)),
      ))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("message", (event) => {
  if (event.data?.type === "SKIP_WAITING") self.skipWaiting();
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  const url = new URL(request.url);
  if (
    request.method !== "GET" ||
    url.origin !== SCOPE_URL.origin ||
    request.headers.has("range") ||
    isPrivateOrTransient(url)
  ) return;

  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response.ok) {
            const copy = response.clone();
            void caches.open(SHELL_CACHE).then((cache) => cache.put(ROOT_PATH, copy));
          }
          return response;
        })
        .catch(async () => (await caches.match(ROOT_PATH)) || (await caches.match(OFFLINE_PATH))),
    );
    return;
  }

  const relative = relativePath(url) ?? "";
  const isStaticAsset =
    relative.startsWith("_next/") ||
    relative.startsWith("_vinext/") ||
    relative.startsWith("assets/") ||
    relative.startsWith("icons/") ||
    ["style", "script", "font", "image"].includes(request.destination);

  if (isStaticAsset) {
    event.respondWith(
      caches.match(request).then((cached) => cached || fetch(request).then((response) => {
        if (response.ok) {
          const copy = response.clone();
          void caches.open(SHELL_CACHE).then((cache) => cache.put(request, copy));
        }
        return response;
      })),
    );
  }
});
