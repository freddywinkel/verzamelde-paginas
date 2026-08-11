import assert from "node:assert/strict";
import test from "node:test";

async function render(pathname = "/") {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}-${Math.random()}`);
  const { default: worker } = await import(workerUrl.href);
  return worker.fetch(
    new Request(`http://localhost${pathname}`, { headers: { accept: "text/html" } }),
    { ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) } },
    { waitUntil() {}, passThroughOnException() {} },
  );
}

test("server-renders the Dutch Collected Pages shell", async () => {
  const response = await render();
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);

  const html = await response.text();
  assert.match(html, /<html[^>]+lang="nl"/i);
  assert.match(html, /<title>Verzamelde pagina(?:’|&#x2019;)s<\/title>/i);
  assert.match(html, /rel="manifest"[^>]+href="\/manifest\.webmanifest"/i);
  assert.match(html, /Je priv(?:é|&#xe9;)archief wordt geopend/i);
  assert.match(html, /Verzamelde pagina(?:’|&#x2019;)s/i);
  assert.doesNotMatch(html, /codex-preview|Your site is taking shape|react-loading-skeleton/i);
});

test("shortcut routes still return the installable application shell", async () => {
  for (const view of ["write", "record", "manage"]) {
    const response = await render(`/?view=${view}`);
    assert.equal(response.status, 200);
    assert.match(await response.text(), /Verzamelde pagina/i);
  }
});
