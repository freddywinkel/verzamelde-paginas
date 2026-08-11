import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { access, readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);

test("manifest describes a standalone Dutch PWA with maskable artwork", async () => {
  const manifest = JSON.parse(await readFile(new URL("../public/manifest.webmanifest", import.meta.url), "utf8"));
  assert.equal(manifest.name, "Freddo's Mementos");
  assert.equal(manifest.short_name, "Mementos");
  assert.equal(manifest.lang, "nl");
  assert.equal(manifest.display, "standalone");
  assert.equal(manifest.id, "./");
  assert.equal(manifest.start_url, "./");
  assert.equal(manifest.scope, "./");
  assert.deepEqual(
    manifest.icons.map((icon) => icon.src),
    ["./icons/icon-v2-192.png", "./icons/icon-v2-512.png", "./icons/icon-maskable-v2-512.png"],
  );
  assert.deepEqual(
    manifest.shortcuts.flatMap((shortcut) => shortcut.icons.map((icon) => icon.src)),
    ["./icons/icon-v2-192.png", "./icons/icon-v2-192.png"],
  );
  assert.ok(manifest.icons.some((icon) => icon.sizes === "512x512" && icon.purpose === "maskable"));
});

test("PWA icons exist at their declared dimensions", async () => {
  const icons = [
    ["favicon-v2-32.png", 32, "f18369fd81507b8583ec9c1e2fad972d029ef3e470a8b4faf5996d838dc73f20"],
    ["apple-touch-icon-v2.png", 180, "9153b329b77724af26f02f3a6b3fd47f58e7b9566de86f8f38c304f59a7b11c2"],
    ["icon-v2-192.png", 192, "27eaf57820c6bd0e29df3067aeaca3d6fd300c92dc2cbf34e21471e1e7d961b5"],
    ["icon-v2-512.png", 512, "f70e80b12cba81ce8080c9efecd13e97d994dfabb372d6a7f7eeaa9712cf58d6"],
    ["icon-maskable-v2-512.png", 512, "fe5ab623766d7430570cbd0732380109f37d2b0122ca24154ab91c533a2bd3ff"],
  ];
  for (const [name, expected, expectedHash] of icons) {
    const bytes = await readFile(new URL(`../public/icons/${name}`, import.meta.url));
    assert.equal(bytes.subarray(1, 4).toString("ascii"), "PNG");
    assert.equal(bytes.readUInt32BE(16), expected, `${name} width`);
    assert.equal(bytes.readUInt32BE(20), expected, `${name} height`);
    assert.equal(bytes[24], 8, `${name} bit depth`);
    assert.equal(bytes[25], 2, `${name} must be opaque RGB`);
    assert.equal(bytes.includes(Buffer.from("tRNS")), false, `${name} must not declare transparency`);
    assert.equal(createHash("sha256").update(bytes).digest("hex"), expectedHash, `${name} artwork`);
  }

  for (const [legacyName, versionedName] of [
    ["favicon-32.png", "favicon-v2-32.png"],
    ["apple-touch-icon.png", "apple-touch-icon-v2.png"],
    ["icon-192.png", "icon-v2-192.png"],
    ["icon-512.png", "icon-v2-512.png"],
    ["icon-maskable-512.png", "icon-maskable-v2-512.png"],
  ]) {
    const [legacy, versioned] = await Promise.all([
      readFile(new URL(`../public/icons/${legacyName}`, import.meta.url)),
      readFile(new URL(`../public/icons/${versionedName}`, import.meta.url)),
    ]);
    assert.deepEqual(legacy, versioned, `${legacyName} compatibility alias`);
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
  assert.match(worker, /icons\/icon-v2-192\.png/);
  assert.match(worker, /icons\/apple-touch-icon-v2\.png/);
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
