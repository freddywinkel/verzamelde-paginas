import { access, readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const outputDirectories = ["dist", "pages-dist"]
  .map((name) => ({ name, path: path.join(root, name) }));
const privatePackage = path.join(root, "private-import", "verzamelde-paginas-prive-import.json");
const privateConfig = path.join(root, "private-import", "corpus-build-config.json");
const requirePrivatePackage = process.argv.includes("--require-private");

async function exists(target) {
  return access(target).then(() => true, () => false);
}

async function filesUnder(directory) {
  const result = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const full = path.join(directory, entry.name);
    if (entry.isDirectory()) result.push(...await filesUnder(full));
    else result.push(full);
  }
  return result;
}

function normalizedText(value) {
  return String(value ?? "")
    .normalize("NFC")
    .toLocaleLowerCase("nl-NL")
    .replace(/\s+/g, " ")
    .trim();
}

function contentMarker(...values) {
  const candidates = values
    .flatMap((value) => String(value ?? "").split(/\r?\n/))
    .map(normalizedText)
    .filter(Boolean)
    .sort((a, b) => b.length - a.length);
  const combined = normalizedText(values.join("\n"));
  const marker = candidates.find((value) => value.length >= 24) ?? combined;
  if (marker.length < 8) return undefined;
  if (marker.length <= 96) return marker;
  const start = Math.max(0, Math.floor((marker.length - 96) / 2));
  return marker.slice(start, start + 96);
}

function regexEscape(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function assertMarkersAbsent(haystack, entries, label) {
  const unique = new Map();
  for (const entry of entries) {
    for (const marker of entry.markers) {
      if (marker) unique.set(marker, entry.id);
    }
  }
  const markers = [...unique.keys()];
  for (let index = 0; index < markers.length; index += 160) {
    const chunk = markers.slice(index, index + 160);
    const match = haystack.match(new RegExp(chunk.map(regexEscape).join("|"), "u"));
    if (match) {
      const owner = unique.get(match[0]);
      throw new Error(`Privé${label} aangetroffen in build-output bij lokaal record ${owner}.`);
    }
  }
  return markers.length;
}

const availableOutputs = [];
for (const output of outputDirectories) {
  if (await exists(output.path)) availableOutputs.push(output);
}
if (!availableOutputs.length) throw new Error("Geen deploybare build-output gevonden voor de privacycontrole.");

const forbiddenNames = ["verzamelde-paginas-prive-import.json"];
if (await exists(privateConfig)) {
  const config = JSON.parse(await readFile(privateConfig, "utf8"));
  if (Array.isArray(config.forbiddenSourceNames)) forbiddenNames.push(...config.forbiddenSourceNames);
}
const textExtensions = new Set([
  ".css", ".csv", ".html", ".js", ".json", ".map", ".md", ".mjs",
  ".svg", ".txt", ".webmanifest", ".xml",
]);

let deployableText = "";
let totalFiles = 0;
for (const output of availableOutputs) {
  const files = await filesUnder(output.path);
  totalFiles += files.length;
  const relativeFiles = files.map((file) => path.relative(output.path, file).replaceAll("\\", "/"));
  for (const name of forbiddenNames) {
    if (relativeFiles.some((file) => file.includes(name))) {
      throw new Error(`Privébestand in ${output.name}: ${name}`);
    }
  }
  for (const file of files) {
    if (textExtensions.has(path.extname(file).toLocaleLowerCase("en-US"))) {
      deployableText += `\n${await readFile(file, "utf8")}`;
    }
  }
}

for (const name of forbiddenNames) {
  if (deployableText.includes(name)) throw new Error(`Privébronnaam in deploybare code: ${name}`);
}

if (await exists(privatePackage)) {
  const payload = JSON.parse(await readFile(privatePackage, "utf8"));
  const records = [
    ...payload.poems.map((poem, index) => ({
      id: `gedicht ${index + 1}`,
      markers: [
        normalizedText(poem.id),
        normalizedText(poem.originalChecksum),
        contentMarker(poem.body),
      ],
    })),
    ...payload.revisions.map((revision, index) => ({
      id: `versie ${index + 1}`,
      markers: [
        normalizedText(revision.id),
        normalizedText(revision.checksum),
        contentMarker(revision.body, revision.rawMarkdown),
      ],
    })),
  ];
  if (records.some((record) => !record.markers.some(Boolean))) {
    throw new Error("Niet ieder lokaal gedicht of iedere versie kreeg een privacy-signature.");
  }

  const normalizedBuild = normalizedText(deployableText);
  const markerCount = assertMarkersAbsent(normalizedBuild, records, "tekst, id of checksum");
  process.stdout.write(
    `Privacy boundary OK: ${records.length} lokale gedicht-/versierecords en ${markerCount} signatures afwezig uit ${totalFiles} bestanden in ${availableOutputs.map((item) => item.name).join(" + ")}.\n`,
  );
} else {
  if (requirePrivatePackage) throw new Error("Strikte privacycontrole vereist het lokale privé-importpakket.");
  process.stdout.write(
    `Privacy boundary OK: privé-import niet aanwezig; bronbestandsgrens gecontroleerd in ${totalFiles} bestanden in ${availableOutputs.map((item) => item.name).join(" + ")}.\n`,
  );
}
