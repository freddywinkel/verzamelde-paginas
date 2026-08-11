import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);

test("manifest describes a standalone Dutch PWA with maskable artwork", async () => {
  const manifest = JSON.parse(await readFile(new URL("../public/manifest.webmanifest", import.meta.url), "utf8"));
  assert.equal(manifest.name, "Verzamelde pagina’s");
  assert.equal(manifest.lang, "nl");
  assert.equal(manifest.display, "standalone");
  assert.equal(manifest.id, "./");
  assert.equal(manifest.start_url, "./");
  assert.equal(manifest.scope, "./");
  assert.ok(manifest.icons.some((icon) => icon.sizes === "512x512" && icon.purpose === "maskable"));
});

test("PWA icons exist at their declared dimensions", async () => {
  const icons = [
    ["favicon-32.png", 32],
    ["apple-touch-icon.png", 180],
    ["icon-192.png", 192],
    ["icon-512.png", 512],
    ["icon-maskable-512.png", 512],
  ];
  for (const [name, expected] of icons) {
    const bytes = await readFile(new URL(`../public/icons/${name}`, import.meta.url));
    assert.equal(bytes.subarray(1, 4).toString("ascii"), "PNG");
    assert.equal(bytes.readUInt32BE(16), expected, `${name} width`);
    assert.equal(bytes.readUInt32BE(20), expected, `${name} height`);
  }
});

test("service worker caches only the shell and has an explicit update gate", async () => {
  const worker = await readFile(new URL("../public/sw.js", import.meta.url), "utf8");
  assert.match(worker, /collected-pages-shell/);
  assert.match(worker, /const CACHE_VERSION = "__BUILD_VERSION__"/);
  assert.match(worker, /request\.mode === "navigate"/);
  assert.match(worker, /precacheDiscoveredAssets/);
  assert.match(worker, /self\.registration\.scope/);
  assert.match(worker, /cache: "reload"/);
  assert.match(worker, /private-import/);
  assert.match(worker, /event\.data\?\.type === "SKIP_WAITING"/);
  assert.doesNotMatch(worker, /audioTakes|indexedDB|deleteDatabase|clearLibrary/);
});

test("deployment configuration has no cloud poem or audio storage", async () => {
  const config = JSON.parse(await readFile(new URL("../.openai/hosting.json", import.meta.url), "utf8"));
  assert.deepEqual({ d1: config.d1, r2: config.r2 }, { d1: null, r2: null });
  await access(new URL("../dist/client/manifest.webmanifest", import.meta.url));
  await access(new URL("../dist/client/sw.js", import.meta.url));
  await assert.rejects(access(new URL("public/private-import", root)));
});
