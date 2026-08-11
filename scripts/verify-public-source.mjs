import { execFileSync } from "node:child_process";
import { access, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const privatePackage = path.join(root, "private-import", "verzamelde-paginas-prive-import.json");
const requirePrivatePackage = process.argv.includes("--require-private");

const tracked = execFileSync("git", ["ls-files", "-z"], { cwd: root })
  .toString("utf8")
  .split("\0")
  .filter(Boolean);

const forbiddenPathPatterns = [
  /(^|\/)private-import\//i,
  /(^|\/)private-data\//i,
  /\.poetry-backup\.zip$/i,
  /verzamelde-paginas-backup-.*\.zip$/i,
  /\.(?:m4a|mp3|wav|webm)$/i,
];
for (const file of tracked) {
  if (forbiddenPathPatterns.some((pattern) => pattern.test(file))) {
    throw new Error(`Privépad wordt door Git gevolgd: ${file}`);
  }
}

const packageAvailable = await access(privatePackage).then(() => true, () => false);
if (packageAvailable) {
  const payload = JSON.parse(await readFile(privatePackage, "utf8"));
  const trackedText = (
    await Promise.all(tracked
      .filter((file) => /\.(?:css|html|js|json|md|mjs|ts|tsx|txt|webmanifest|yml|yaml)$/i.test(file))
      .map((file) => readFile(path.join(root, file), "utf8")))
  ).join("\n").normalize("NFC").toLocaleLowerCase("nl-NL").replace(/\s+/g, " ");

  const strongPrivateValues = new Set();
  for (const poem of payload.poems) {
    if (poem.id) strongPrivateValues.add(String(poem.id).toLocaleLowerCase("nl-NL"));
    if (poem.originalChecksum) strongPrivateValues.add(String(poem.originalChecksum).toLocaleLowerCase("nl-NL"));
    const body = String(poem.body ?? "").normalize("NFC").toLocaleLowerCase("nl-NL").replace(/\s+/g, " ").trim();
    if (body.length >= 24) strongPrivateValues.add(body.slice(0, Math.min(body.length, 80)));
  }
  for (const revision of payload.revisions) {
    if (revision.id) strongPrivateValues.add(String(revision.id).toLocaleLowerCase("nl-NL"));
    if (revision.checksum) strongPrivateValues.add(String(revision.checksum).toLocaleLowerCase("nl-NL"));
  }
  for (const marker of strongPrivateValues) {
    if (trackedText.includes(marker)) {
      throw new Error("Privé-inhoud of een privécorpusfingerprint staat in een door Git gevolgd tekstbestand.");
    }
  }
  process.stdout.write(`Public-source boundary OK: ${tracked.length} gevolgde bestanden bevatten geen lokale corpusinhoud of fingerprints.\n`);
} else {
  if (requirePrivatePackage) throw new Error("Strikte broncontrole vereist het lokale privé-importpakket.");
  process.stdout.write(`Public-source boundary OK: ${tracked.length} gevolgde paden gecontroleerd; lokale inhoudsscan overgeslagen omdat het privé-importpakket afwezig is.\n`);
}
