export const PRIVATE_IMPORT_FORMAT = "collected-pages-private-import";
export const BACKUP_FORMAT = "collected-pages-backup";
export const DATA_VERSION = 1;

export type PoemStatus = "origineel" | "klad" | "definitief";
export type RevisionKind = "origineel" | "aangepast" | "momentopname";

export interface Poem {
  id: string;
  sourceKey?: string;
  collectionIndex?: number;
  title: string;
  titleLower: string;
  body: string;
  status: PoemStatus;
  source: "import" | "geschreven";
  tags: string[];
  language?: string;
  writtenOn?: string;
  privateNote?: string;
  createdAt: string;
  updatedAt: string;
  activeRevisionId?: string;
  originalRevisionId?: string;
  adjustedRevisionId?: string;
  originalChecksum?: string;
}

export interface Revision {
  id: string;
  poemId: string;
  title: string;
  body: string;
  kind: RevisionKind;
  label: string;
  createdAt: string;
  locked: boolean;
  checksum?: string;
  rawMarkdown?: string;
}

export interface AudioTake {
  id: string;
  poemId: string;
  name: string;
  mimeType: string;
  durationMs: number;
  createdAt: string;
  isPreferred: boolean;
  blob: Blob;
}

export interface AppSetting {
  key: string;
  value: unknown;
}

export interface LibrarySnapshot {
  poems: Poem[];
  revisions: Revision[];
  audioTakes: AudioTake[];
}

export interface ImportReport {
  poemCount: number;
  revisionCount: number;
  audioCount: number;
  duplicateCount: number;
  warnings: string[];
  kind: "private-import" | "backup";
  payload: LibrarySnapshot;
}

export interface PrivateImportPackage {
  format: typeof PRIVATE_IMPORT_FORMAT;
  version: typeof DATA_VERSION;
  generatedAt: string;
  source: {
    original: string;
    adjusted?: string;
    note?: string;
  };
  counts: {
    poems: number;
    revisions: number;
    adjustedRevisions: number;
  };
  poems: Poem[];
  revisions: Revision[];
  checksums: Record<string, string>;
}

export type AppView = "library" | "write" | "record" | "manage";

export function makeId(prefix: string): string {
  const random = globalThis.crypto?.randomUUID?.() ??
    `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  return `${prefix}-${random}`;
}

export function normalizeTitle(title: string): string {
  return title.trim().toLocaleLowerCase("nl-NL");
}

export function countWords(text: string): number {
  const words = text.trim().match(/[\p{L}\p{N}][\p{L}\p{N}\p{M}'’-]*/gu);
  return words?.length ?? 0;
}

export function excerpt(text: string, length = 150): string {
  const compact = text.replace(/\s+/g, " ").trim();
  if (compact.length <= length) return compact;
  return `${compact.slice(0, length).replace(/\s+\S*$/, "")}…`;
}

export function formatDate(value?: string): string {
  if (!value) return "Datum onbekend";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Datum onbekend";
  return new Intl.DateTimeFormat("nl-NL", {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(date);
}

export function formatTime(value?: string): string {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("nl-NL", {
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

export function formatDuration(durationMs: number): string {
  const totalSeconds = Math.max(0, Math.round(durationMs / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

export function formatBytes(bytes?: number): string {
  if (bytes === undefined || Number.isNaN(bytes)) return "Onbekend";
  if (bytes < 1024) return `${bytes} B`;
  const units = ["KB", "MB", "GB", "TB"];
  let value = bytes / 1024;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${value.toFixed(value >= 10 ? 1 : 2)} ${units[unit]}`;
}

export function slugFilename(value: string): string {
  const slug = value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("nl-NL")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 72);
  return slug || "gedicht";
}
