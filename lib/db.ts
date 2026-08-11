import Dexie, { type EntityTable } from "dexie";
import type {
  AppSetting,
  AudioTake,
  LibrarySnapshot,
  Poem,
  Revision,
} from "./model";

class CollectedPagesDatabase extends Dexie {
  poems!: EntityTable<Poem, "id">;
  revisions!: EntityTable<Revision, "id">;
  audioTakes!: EntityTable<AudioTake, "id">;
  settings!: EntityTable<AppSetting, "key">;

  constructor() {
    super("collected-pages-library");
    this.version(1).stores({
      poems:
        "id, collectionIndex, titleLower, status, source, createdAt, updatedAt, *tags",
      revisions: "id, poemId, kind, createdAt, [poemId+createdAt]",
      audioTakes: "id, poemId, createdAt, [poemId+createdAt]",
      settings: "key",
    });
  }
}

let database: CollectedPagesDatabase | undefined;

export function getDatabase(): CollectedPagesDatabase {
  if (!database) database = new CollectedPagesDatabase();
  return database;
}

export async function loadSnapshot(): Promise<LibrarySnapshot> {
  const db = getDatabase();
  const [poems, revisions, audioTakes] = await Promise.all([
    db.poems.toArray(),
    db.revisions.toArray(),
    db.audioTakes.toArray(),
  ]);
  return { poems, revisions, audioTakes };
}

export async function getSetting<T>(key: string): Promise<T | undefined> {
  const entry = await getDatabase().settings.get(key);
  return entry?.value as T | undefined;
}

export async function setSetting(key: string, value: unknown): Promise<void> {
  await getDatabase().settings.put({ key, value });
}

export async function markChanged(): Promise<void> {
  await setSetting("lastChangedAt", new Date().toISOString());
}

export async function savePoem(poem: Poem): Promise<void> {
  await getDatabase().transaction("rw", [getDatabase().poems, getDatabase().settings], async () => {
    await getDatabase().poems.put(poem);
    await getDatabase().settings.put({
      key: "lastChangedAt",
      value: new Date().toISOString(),
    });
  });
}

export async function saveRevision(revision: Revision): Promise<void> {
  const db = getDatabase();
  const existing = await db.revisions.get(revision.id);
  if (
    existing?.locked &&
    (
      !revision.locked ||
      existing.poemId !== revision.poemId ||
      existing.title !== revision.title ||
      existing.body !== revision.body ||
      existing.kind !== revision.kind ||
      existing.label !== revision.label ||
      existing.createdAt !== revision.createdAt ||
      existing.rawMarkdown !== revision.rawMarkdown ||
      existing.checksum !== revision.checksum
    )
  ) {
    throw new Error("Een vergrendelde bronversie kan niet worden gewijzigd.");
  }
  await db.transaction(
    "rw",
    [db.revisions, db.settings],
    async () => {
      await db.revisions.put(revision);
      await db.settings.put({
        key: "lastChangedAt",
        value: new Date().toISOString(),
      });
    },
  );
}

export async function saveAudioTake(take: AudioTake): Promise<void> {
  const db = getDatabase();
  await db.transaction("rw", [db.audioTakes, db.settings], async () => {
    if (take.isPreferred) {
      const siblings = await db.audioTakes.where("poemId").equals(take.poemId).toArray();
      await db.audioTakes.bulkPut(
        siblings.map((item) => ({ ...item, isPreferred: false })),
      );
    }
    await db.audioTakes.put(take);
    await db.settings.put({ key: "lastChangedAt", value: new Date().toISOString() });
  });
}

export async function setPreferredTake(poemId: string, takeId: string): Promise<void> {
  const db = getDatabase();
  await db.transaction("rw", [db.audioTakes, db.settings], async () => {
    const siblings = await db.audioTakes.where("poemId").equals(poemId).toArray();
    await db.audioTakes.bulkPut(
      siblings.map((item) => ({ ...item, isPreferred: item.id === takeId })),
    );
    await db.settings.put({ key: "lastChangedAt", value: new Date().toISOString() });
  });
}

export async function renameTake(takeId: string, name: string): Promise<void> {
  const trimmed = name.trim();
  if (!trimmed) throw new Error("Geef de opname een naam.");
  const db = getDatabase();
  await db.transaction("rw", [db.audioTakes, db.settings], async () => {
    await db.audioTakes.update(takeId, { name: trimmed });
    await db.settings.put({ key: "lastChangedAt", value: new Date().toISOString() });
  });
}

export async function deleteTake(takeId: string): Promise<void> {
  const db = getDatabase();
  await db.transaction("rw", [db.audioTakes, db.settings], async () => {
    const take = await db.audioTakes.get(takeId);
    await db.audioTakes.delete(takeId);
    if (take?.isPreferred) {
      const fallback = await db.audioTakes
        .where("poemId")
        .equals(take.poemId)
        .sortBy("createdAt");
      const latest = fallback.at(-1);
      if (latest) await db.audioTakes.update(latest.id, { isPreferred: true });
    }
    await db.settings.put({ key: "lastChangedAt", value: new Date().toISOString() });
  });
}

export async function deletePoem(poemId: string): Promise<void> {
  const db = getDatabase();
  await db.transaction(
    "rw",
    [db.poems, db.revisions, db.audioTakes, db.settings],
    async () => {
      await Promise.all([
        db.poems.delete(poemId),
        db.revisions.where("poemId").equals(poemId).delete(),
        db.audioTakes.where("poemId").equals(poemId).delete(),
      ]);
      await db.settings.put({ key: "lastChangedAt", value: new Date().toISOString() });
    },
  );
}

export async function importSnapshot(
  snapshot: LibrarySnapshot,
  mode: "merge" | "replace",
): Promise<{ duplicates: number }> {
  const db = getDatabase();
  const existingIds = mode === "merge"
    ? new Set((await db.poems.toCollection().primaryKeys()).map(String))
    : new Set<string>();
  const duplicates = snapshot.poems.filter((poem) => existingIds.has(poem.id)).length;
  const incomingPreferred = new Map<string, string>();
  for (const take of snapshot.audioTakes) {
    if (!take.isPreferred) continue;
    if (incomingPreferred.has(take.poemId)) {
      throw new Error("De import bevat meer dan één voorkeursopname voor hetzelfde gedicht.");
    }
    incomingPreferred.set(take.poemId, take.id);
  }

  if (mode === "merge") {
    const existingLocked = (await db.revisions.toArray()).filter((revision) => revision.locked);
    const incomingById = new Map(snapshot.revisions.map((revision) => [revision.id, revision]));
    for (const existing of existingLocked) {
      const incoming = incomingById.get(existing.id);
      if (
        incoming &&
        (
          !incoming.locked ||
          incoming.poemId !== existing.poemId ||
          incoming.title !== existing.title ||
          incoming.body !== existing.body ||
          incoming.kind !== existing.kind ||
          incoming.label !== existing.label ||
          incoming.createdAt !== existing.createdAt ||
          incoming.rawMarkdown !== existing.rawMarkdown ||
          incoming.checksum !== existing.checksum
        )
      ) {
        throw new Error("De import probeert een vergrendelde bronversie te wijzigen.");
      }
    }
  }

  await db.transaction(
    "rw",
    [db.poems, db.revisions, db.audioTakes, db.settings],
    async () => {
      if (mode === "replace") {
        await Promise.all([
          db.poems.clear(),
          db.revisions.clear(),
          db.audioTakes.clear(),
        ]);
      }
      if (mode === "merge") {
        for (const poemId of incomingPreferred.keys()) {
          const siblings = await db.audioTakes.where("poemId").equals(poemId).toArray();
          if (siblings.length) {
            await db.audioTakes.bulkPut(siblings.map((take) => ({ ...take, isPreferred: false })));
          }
        }
      }
      await db.poems.bulkPut(snapshot.poems);
      await db.revisions.bulkPut(snapshot.revisions);
      await db.audioTakes.bulkPut(snapshot.audioTakes);
      await db.settings.put({ key: "lastChangedAt", value: new Date().toISOString() });
      await db.settings.put({ key: "lastImportAt", value: new Date().toISOString() });
    },
  );
  return { duplicates };
}

export async function clearLibrary(): Promise<void> {
  const db = getDatabase();
  await db.transaction(
    "rw",
    [db.poems, db.revisions, db.audioTakes, db.settings],
    async () => {
      await Promise.all([
        db.poems.clear(),
        db.revisions.clear(),
        db.audioTakes.clear(),
        db.settings.clear(),
      ]);
    },
  );
}
