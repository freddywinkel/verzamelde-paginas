import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import test from "node:test";

const output = new URL("../pages-dist/", import.meta.url);
const deployedManifestUrl = "https://freddywinkel.github.io/verzamelde-paginas/manifest.webmanifest";

test("static Pages build has a complete project-subpath shell", async () => {
  for (const path of [
    "index.html",
    "404.html",
    ".nojekyll",
    "manifest.webmanifest",
    "sw.js",
    "offline.html",
    "icons/favicon-v2-32.png",
    "icons/apple-touch-icon-v2.png",
    "icons/icon-v2-192.png",
    "icons/icon-v2-512.png",
    "icons/icon-maskable-v2-512.png",
    "icons/favicon-32.png",
    "icons/apple-touch-icon.png",
    "icons/icon-192.png",
    "icons/icon-512.png",
    "icons/icon-maskable-512.png",
  ]) {
    await access(new URL(path, output));
  }
  const [html, fallback] = await Promise.all([
    readFile(new URL("index.html", output), "utf8"),
    readFile(new URL("404.html", output), "utf8"),
  ]);
  assert.equal(fallback, html);
  assert.match(html, /href="\/verzamelde-paginas\/manifest\.webmanifest"/);
  assert.match(html, /href="\/verzamelde-paginas\/icons\/apple-touch-icon-v2\.png"/);
  assert.match(html, /<title>Freddo's Mementos<\/title>/);
  assert.match(html, /name="application-name" content="Freddo's Mementos"/);
  assert.match(html, /name="apple-mobile-web-app-capable" content="yes"/);
  assert.match(html, /name="apple-mobile-web-app-title" content="Mementos"/);
  assert.match(html, /src="\/verzamelde-paginas\/assets\/[^"']+\.js"/);
  assert.match(html, /noindex, nofollow, noarchive/);
  assert.doesNotMatch(html, /(?:src|href)="\/(?:assets|icons|sw\.js|manifest\.webmanifest)/);
});

test("relative manifest resolves entirely inside the Pages project", async () => {
  const manifest = JSON.parse(await readFile(new URL("manifest.webmanifest", output), "utf8"));
  for (const value of [manifest.id, manifest.start_url, manifest.scope, ...manifest.icons.map((icon) => icon.src), ...manifest.shortcuts.flatMap((shortcut) => [shortcut.url, ...shortcut.icons.map((icon) => icon.src)])]) {
    assert.ok(new URL(value, deployedManifestUrl).pathname.startsWith("/verzamelde-paginas/"), value);
  }
});

test("Pages worker is scoped, fresh-fetches its shell, and has a generated version", async () => {
  const worker = await readFile(new URL("sw.js", output), "utf8");
  assert.match(worker, /const CACHE_VERSION = "[a-f0-9]{16}"/);
  assert.doesNotMatch(worker, /__BUILD_VERSION__|const CACHE_VERSION = "v1"/);
  assert.match(worker, /self\.registration\.scope/);
  assert.match(worker, /cache: "reload"/);
  assert.match(worker, /event\.data\?\.type === "SKIP_WAITING"/);
  assert.doesNotMatch(worker, /indexedDB|deleteDatabase|clearLibrary|audioTakes/);
});

test("workflow automatically validates and deploys pushes to main", async () => {
  const workflow = await readFile(new URL("../.github/workflows/deploy-pages.yml", import.meta.url), "utf8");
  assert.match(workflow, /push:[\s\S]*branches: \[main\]/);
  assert.match(workflow, /workflow_dispatch:/);
  assert.match(workflow, /npm run release:check/);
  assert.match(workflow, /actions\/configure-pages@v6/);
  assert.match(workflow, /actions\/upload-pages-artifact@v5/);
  assert.match(workflow, /actions\/deploy-pages@v5/);
  assert.match(workflow, /pages: write/);
  assert.match(workflow, /id-token: write/);
});
