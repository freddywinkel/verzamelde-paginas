import { createHash } from "node:crypto";
import { copyFile, readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const output = path.join(projectRoot, "pages-dist");

async function filesUnder(directory) {
  const result = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const full = path.join(directory, entry.name);
    if (entry.isDirectory()) result.push(...await filesUnder(full));
    else result.push(full);
  }
  return result;
}

const files = (await filesUnder(output))
  .filter((file) => path.basename(file) !== "sw.js")
  .sort((a, b) => a.localeCompare(b, "en"));
const digest = createHash("sha256");
for (const file of files) {
  digest.update(path.relative(output, file).replaceAll("\\", "/"));
  digest.update(await readFile(file));
}
const workerPath = path.join(output, "sw.js");
const worker = await readFile(workerPath, "utf8");
digest.update("sw.js");
digest.update(worker);
const buildVersion = digest.digest("hex").slice(0, 16);

if (!worker.includes('const CACHE_VERSION = "__BUILD_VERSION__";')) {
  throw new Error("Service-worker build marker ontbreekt.");
}
await writeFile(
  workerPath,
  worker.replace('const CACHE_VERSION = "__BUILD_VERSION__";', `const CACHE_VERSION = "${buildVersion}";`),
  "utf8",
);
await copyFile(path.join(output, "index.html"), path.join(output, "404.html"));
await writeFile(path.join(output, ".nojekyll"), "", "utf8");
process.stdout.write(`GitHub Pages build ${buildVersion}\n`);
