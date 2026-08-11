import {
  strFromU8,
  strToU8,
  unzip,
  zip,
  type AsyncZippable,
} from "fflate";
import {
  BACKUP_FORMAT,
  DATA_VERSION,
  PRIVATE_IMPORT_FORMAT,
  slugFilename,
  type AudioTake,
  type ImportReport,
  type LibrarySnapshot,
  type Poem,
  type PrivateImportPackage,
  type Revision,
} from "./model";

interface StoredAudioTake extends Omit<AudioTake, "blob"> {
  path: string;
  checksum: string;
}

interface BackupLibrary {
  poems: Poem[];
  revisions: Revision[];
  audioTakes: StoredAudioTake[];
}

interface BackupManifest {
  format: typeof BACKUP_FORMAT;
  version: typeof DATA_VERSION;
  exportedAt: string;
  app: "Freddo's Mementos";
  counts: {
    poems: number;
    revisions: number;
    audioTakes: number;
  };
  note: string;
}

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function exactArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  return bytes.buffer.slice(
    bytes.byteOffset,
    bytes.byteOffset + bytes.byteLength,
  ) as ArrayBuffer;
}

export async function sha256(bytes: Uint8Array): Promise<string> {
  const view = bytes.buffer.slice(
    bytes.byteOffset,
    bytes.byteOffset + bytes.byteLength,
  ) as ArrayBuffer;
  const digest = await crypto.subtle.digest("SHA-256", view);
  return bytesToHex(new Uint8Array(digest));
}

function zipAsync(files: AsyncZippable): Promise<Uint8Array> {
  return new Promise((resolve, reject) => {
    zip(files, { level: 6 }, (error, data) => {
      if (error) reject(error);
      else resolve(data);
    });
  });
}

function unzipAsync(bytes: Uint8Array): Promise<Record<string, Uint8Array>> {
  return new Promise((resolve, reject) => {
    unzip(bytes, (error, data) => {
      if (error) reject(error);
      else resolve(data);
    });
  });
}

function audioExtension(mimeType: string): string {
  if (mimeType.includes("ogg")) return "ogg";
  if (mimeType.includes("mp4") || mimeType.includes("m4a")) return "m4a";
  if (mimeType.includes("mpeg")) return "mp3";
  if (mimeType.includes("wav")) return "wav";
  return "webm";
}

function isPoem(value: unknown): value is Poem {
  if (!value || typeof value !== "object") return false;
  const poem = value as Partial<Poem>;
  return (
    typeof poem.id === "string" &&
    typeof poem.title === "string" &&
    typeof poem.body === "string" &&
    typeof poem.createdAt === "string" &&
    typeof poem.updatedAt === "string" &&
    Array.isArray(poem.tags)
  );
}

function isRevision(value: unknown): value is Revision {
  if (!value || typeof value !== "object") return false;
  const revision = value as Partial<Revision>;
  return (
    typeof revision.id === "string" &&
    typeof revision.poemId === "string" &&
    typeof revision.title === "string" &&
    typeof revision.body === "string" &&
    typeof revision.createdAt === "string" &&
    typeof revision.locked === "boolean"
  );
}

function validateReferences(snapshot: LibrarySnapshot): string[] {
  const warnings: string[] = [];
  const poemIds = new Set(snapshot.poems.map((poem) => poem.id));
  const revisionIds = new Set(snapshot.revisions.map((revision) => revision.id));
  const takeIds = new Set<string>();
  const preferredByPoem = new Set<string>();

  for (const revision of snapshot.revisions) {
    if (!poemIds.has(revision.poemId)) {
      throw new Error(`Versie ${revision.id} verwijst naar een onbekend gedicht.`);
    }
  }
  for (const take of snapshot.audioTakes) {
    if (!poemIds.has(take.poemId)) {
      throw new Error(`Opname ${take.id} verwijst naar een onbekend gedicht.`);
    }
    if (takeIds.has(take.id)) throw new Error(`Dubbele opname-id: ${take.id}`);
    takeIds.add(take.id);
    if (take.isPreferred) {
      if (preferredByPoem.has(take.poemId)) {
        throw new Error("Een gedicht heeft meer dan één voorkeursopname in het archief.");
      }
      preferredByPoem.add(take.poemId);
    }
  }
  for (const poem of snapshot.poems) {
    if (poem.originalRevisionId && !revisionIds.has(poem.originalRevisionId)) {
      throw new Error(`Het origineel van “${poem.title}” ontbreekt.`);
    }
    if (poem.adjustedRevisionId && !revisionIds.has(poem.adjustedRevisionId)) {
      throw new Error(`De aangepaste versie van “${poem.title}” ontbreekt.`);
    }
    if (!poem.title.trim()) warnings.push(`Gedicht ${poem.id} heeft geen titel.`);
  }
  return warnings;
}

export async function createBackup(snapshot: LibrarySnapshot): Promise<{
  blob: Blob;
  filename: string;
}> {
  const exportedAt = new Date().toISOString();
  const files: AsyncZippable = {};
  const checksums: Record<string, string> = {};
  const storedAudio: StoredAudioTake[] = [];

  for (const poem of snapshot.poems) {
    const index = poem.collectionIndex
      ? String(poem.collectionIndex).padStart(3, "0")
      : "nieuw";
    const path = `poems/${index}-${slugFilename(poem.title)}-${poem.id}/gedicht.md`;
    const content = strToU8(`# ${poem.title}\n\n${poem.body}`);
    files[path] = content;
    checksums[path] = await sha256(content);
  }

  for (const revision of snapshot.revisions) {
    const path = `revisions/${revision.poemId}/${revision.id}.md`;
    const content = strToU8(`# ${revision.title}\n\n${revision.body}`);
    files[path] = content;
    checksums[path] = await sha256(content);
  }

  for (const take of snapshot.audioTakes) {
    const extension = audioExtension(take.mimeType);
    const path = `audio/${take.poemId}/${take.id}.${extension}`;
    const bytes = new Uint8Array(await take.blob.arrayBuffer());
    const checksum = await sha256(bytes);
    files[path] = [bytes, { level: 0 }];
    checksums[path] = checksum;
    storedAudio.push({
      id: take.id,
      poemId: take.poemId,
      name: take.name,
      mimeType: take.mimeType,
      durationMs: take.durationMs,
      createdAt: take.createdAt,
      isPreferred: take.isPreferred,
      path,
      checksum,
    });
  }

  const library: BackupLibrary = {
    poems: snapshot.poems,
    revisions: snapshot.revisions,
    audioTakes: storedAudio,
  };
  const libraryBytes = strToU8(JSON.stringify(library, null, 2));
  files["library.json"] = libraryBytes;
  checksums["library.json"] = await sha256(libraryBytes);

  const checksumsBytes = strToU8(JSON.stringify(checksums, null, 2));
  files["checksums.json"] = checksumsBytes;

  const manifest: BackupManifest = {
    format: BACKUP_FORMAT,
    version: DATA_VERSION,
    exportedAt,
    app: "Freddo's Mementos",
    counts: {
      poems: snapshot.poems.length,
      revisions: snapshot.revisions.length,
      audioTakes: snapshot.audioTakes.length,
    },
    note: "Deze back-up bevat privéteksten en opnames. Bewaar hem op een veilige plek.",
  };
  files["manifest.json"] = strToU8(JSON.stringify(manifest, null, 2));

  const archive = await zipAsync(files);
  const date = exportedAt.slice(0, 10);
  return {
    blob: new Blob([exactArrayBuffer(archive)], { type: "application/zip" }),
    filename: `verzamelde-paginas-backup-${date}.zip`,
  };
}

export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.rel = "noopener";
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1_000);
}

async function parsePrivateImport(value: unknown): Promise<ImportReport> {
  const payload = value as Partial<PrivateImportPackage>;
  if (payload.format !== PRIVATE_IMPORT_FORMAT || payload.version !== DATA_VERSION) {
    throw new Error("Dit is geen geldig privé-importbestand voor Freddo's Mementos.");
  }
  if (!Array.isArray(payload.poems) || !payload.poems.every(isPoem)) {
    throw new Error("De gedichtenlijst in het importbestand is beschadigd.");
  }
  if (!Array.isArray(payload.revisions) || !payload.revisions.every(isRevision)) {
    throw new Error("De versies in het importbestand zijn beschadigd.");
  }
  const snapshot: LibrarySnapshot = {
    poems: payload.poems,
    revisions: payload.revisions,
    audioTakes: [],
  };
  const warnings = validateReferences(snapshot);
  const adjustedCount = snapshot.revisions.filter((item) => item.kind === "aangepast").length;
  if (payload.counts?.poems !== snapshot.poems.length) {
    throw new Error("Het opgegeven aantal gedichten klopt niet met het bestand.");
  }
  if (payload.counts?.adjustedRevisions !== adjustedCount) {
    throw new Error("Het opgegeven aantal aangepaste versies klopt niet.");
  }
  if (payload.counts?.revisions !== snapshot.revisions.length) {
    throw new Error("Het opgegeven totale aantal versies klopt niet.");
  }
  if (!payload.checksums || typeof payload.checksums !== "object") {
    throw new Error("De integriteitsgegevens van het importbestand ontbreken.");
  }
  for (const revision of snapshot.revisions) {
    const expected = payload.checksums[revision.id];
    if (!expected) throw new Error(`Controlesom ontbreekt voor versie ${revision.id}.`);
    const actual = await sha256(strToU8(revision.rawMarkdown ?? revision.body));
    if (actual !== expected) throw new Error(`Integriteitscontrole mislukt voor versie ${revision.id}.`);
  }
  return {
    poemCount: snapshot.poems.length,
    revisionCount: snapshot.revisions.length,
    audioCount: 0,
    duplicateCount: 0,
    warnings,
    kind: "private-import",
    payload: snapshot,
  };
}

async function parseBackup(bytes: Uint8Array): Promise<ImportReport> {
  const files = await unzipAsync(bytes);
  const manifestBytes = files["manifest.json"];
  const libraryBytes = files["library.json"];
  const checksumBytes = files["checksums.json"];
  if (!manifestBytes || !libraryBytes || !checksumBytes) {
    throw new Error("De back-up mist manifest.json, library.json of checksums.json.");
  }

  const manifest = JSON.parse(strFromU8(manifestBytes)) as Partial<BackupManifest>;
  if (manifest.format !== BACKUP_FORMAT || manifest.version !== DATA_VERSION) {
    throw new Error("Deze back-upversie wordt niet ondersteund.");
  }
  const checksums = JSON.parse(strFromU8(checksumBytes)) as Record<string, string>;
  for (const [path, expected] of Object.entries(checksums)) {
    const entry = files[path];
    if (!entry) throw new Error(`Bestand ontbreekt in back-up: ${path}`);
    const actual = await sha256(entry);
    if (actual !== expected) throw new Error(`Integriteitscontrole mislukt voor ${path}.`);
  }

  const library = JSON.parse(strFromU8(libraryBytes)) as Partial<BackupLibrary>;
  if (!Array.isArray(library.poems) || !library.poems.every(isPoem)) {
    throw new Error("De gedichtenlijst in de back-up is beschadigd.");
  }
  if (!Array.isArray(library.revisions) || !library.revisions.every(isRevision)) {
    throw new Error("De versielijst in de back-up is beschadigd.");
  }
  if (!Array.isArray(library.audioTakes)) {
    throw new Error("De opnamelijst in de back-up is beschadigd.");
  }

  const audioTakes: AudioTake[] = [];
  for (const stored of library.audioTakes) {
    if (
      !stored ||
      typeof stored.id !== "string" ||
      typeof stored.poemId !== "string" ||
      typeof stored.path !== "string" ||
      typeof stored.mimeType !== "string"
    ) {
      throw new Error("Een opnamevermelding in de back-up is ongeldig.");
    }
    const audioBytes = files[stored.path];
    if (!audioBytes) throw new Error(`Opname ontbreekt: ${stored.path}`);
    audioTakes.push({
      id: stored.id,
      poemId: stored.poemId,
      name: stored.name,
      mimeType: stored.mimeType,
      durationMs: stored.durationMs,
      createdAt: stored.createdAt,
      isPreferred: stored.isPreferred,
      blob: new Blob([exactArrayBuffer(audioBytes)], { type: stored.mimeType }),
    });
  }

  const snapshot: LibrarySnapshot = {
    poems: library.poems,
    revisions: library.revisions,
    audioTakes,
  };
  const warnings = validateReferences(snapshot);
  if (
    manifest.counts?.poems !== snapshot.poems.length ||
    manifest.counts?.revisions !== snapshot.revisions.length ||
    manifest.counts?.audioTakes !== snapshot.audioTakes.length
  ) {
    throw new Error("De aantallen in het back-upmanifest kloppen niet.");
  }
  return {
    poemCount: snapshot.poems.length,
    revisionCount: snapshot.revisions.length,
    audioCount: snapshot.audioTakes.length,
    duplicateCount: 0,
    warnings,
    kind: "backup",
    payload: snapshot,
  };
}

export async function inspectImportFile(file: File): Promise<ImportReport> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  if (bytes[0] === 0x50 && bytes[1] === 0x4b) return parseBackup(bytes);
  try {
    return await parsePrivateImport(JSON.parse(new TextDecoder().decode(bytes)));
  } catch (error) {
    if (error instanceof SyntaxError) {
      throw new Error("Dit bestand is geen leesbaar JSON-importbestand of ZIP-back-up.");
    }
    throw error;
  }
}
