import "fake-indexeddb/auto";
import assert from "node:assert/strict";
import test, { beforeEach } from "node:test";

const db = await import("../lib/db");
const archive = await import("../lib/archive");
const model = await import("../lib/model");

function samplePoem(id = "poem-test") {
  return {
    id,
    title: "Testgedicht",
    titleLower: "testgedicht",
    body: "Eerste regel\n\nTweede strofe",
    status: "klad" as const,
    source: "geschreven" as const,
    tags: ["test"],
    createdAt: "2026-08-11T00:00:00.000Z",
    updatedAt: "2026-08-11T00:00:00.000Z",
  };
}

beforeEach(async () => {
  await db.clearLibrary();
});

test("a locked source revision cannot be altered", async () => {
  const poem = samplePoem();
  const revision = {
    id: "rev-original-test",
    poemId: poem.id,
    title: poem.title,
    body: poem.body,
    rawMarkdown: "# Testgedicht\r\n\r\nEerste regel\r\n",
    kind: "origineel" as const,
    label: "Origineel archief",
    createdAt: poem.createdAt,
    locked: true,
    checksum: "abc",
  };
  await db.savePoem({ ...poem, originalRevisionId: revision.id });
  await db.saveRevision(revision);
  await assert.rejects(
    db.saveRevision({ ...revision, body: "Gewijzigd" }),
    /vergrendelde bronversie/i,
  );
  const snapshot = await db.loadSnapshot();
  assert.equal(snapshot.revisions[0].body, poem.body);
});

test("only one take is preferred and deleting it promotes a fallback", async () => {
  const poem = samplePoem();
  await db.savePoem(poem);
  const first = {
    id: "take-one",
    poemId: poem.id,
    name: "Eerste take",
    mimeType: "audio/webm",
    durationMs: 1000,
    createdAt: "2026-08-11T01:00:00.000Z",
    isPreferred: true,
    blob: new Blob(["one"], { type: "audio/webm" }),
  };
  const second = {
    ...first,
    id: "take-two",
    name: "Tweede take",
    createdAt: "2026-08-11T02:00:00.000Z",
    blob: new Blob(["two"], { type: "audio/webm" }),
  };
  await db.saveAudioTake(first);
  await db.saveAudioTake(second);
  let takes = (await db.loadSnapshot()).audioTakes;
  assert.deepEqual(takes.map((take) => [take.id, take.isPreferred]).sort(), [["take-one", false], ["take-two", true]]);
  await db.deleteTake("take-two");
  takes = (await db.loadSnapshot()).audioTakes;
  assert.equal(takes.length, 1);
  assert.equal(takes[0].isPreferred, true);
});

test("ZIP backup round-trips text, metadata, and binary audio", async () => {
  const poem = samplePoem("poem-roundtrip");
  const take = {
    id: "take-roundtrip",
    poemId: poem.id,
    name: "Stem",
    mimeType: "audio/webm",
    durationMs: 2345,
    createdAt: poem.createdAt,
    isPreferred: true,
    blob: new Blob(["\u0001\u0004\u0009\u0010"], { type: "audio/webm" }),
  };
  const result = await archive.createBackup({ poems: [poem], revisions: [], audioTakes: [take] });
  assert.match(result.filename, /^verzamelde-paginas-backup-/);
  const report = await archive.inspectImportFile(new File([result.blob], result.filename, { type: "application/zip" }));
  assert.equal(report.kind, "backup");
  assert.equal(report.poemCount, 1);
  assert.equal(report.audioCount, 1);
  assert.equal(report.payload.poems[0].body, poem.body);
  assert.deepEqual(new Uint8Array(await report.payload.audioTakes[0].blob.arrayBuffer()), new Uint8Array([1, 4, 9, 16]));
  assert.equal(model.countWords(poem.body), 4);
});

test("merge rejects attempts to replace a locked imported original", async () => {
  const poem = samplePoem("poem-locked-merge");
  const revision = {
    id: "rev-locked-merge",
    poemId: poem.id,
    title: poem.title,
    body: poem.body,
    rawMarkdown: "original",
    kind: "origineel" as const,
    label: "Origineel archief",
    createdAt: poem.createdAt,
    locked: true,
    checksum: "original-hash",
  };
  await db.savePoem({ ...poem, originalRevisionId: revision.id });
  await db.saveRevision(revision);
  await assert.rejects(
    db.importSnapshot({
      poems: [{ ...poem, originalRevisionId: revision.id }],
      revisions: [{ ...revision, rawMarkdown: "tampered", checksum: "tampered-hash" }],
      audioTakes: [],
    }, "merge"),
    /vergrendelde bronversie/i,
  );
});

test("renaming is persisted and deleting a poem cascades to versions and audio", async () => {
  const poem = samplePoem("poem-cascade");
  const revision = {
    id: "rev-cascade",
    poemId: poem.id,
    title: poem.title,
    body: poem.body,
    kind: "momentopname" as const,
    label: "Versie 1",
    createdAt: poem.createdAt,
    locked: false,
  };
  const take = {
    id: "take-cascade",
    poemId: poem.id,
    name: "Oude naam",
    mimeType: "audio/webm",
    durationMs: 100,
    createdAt: poem.createdAt,
    isPreferred: true,
    blob: new Blob(["audio"], { type: "audio/webm" }),
  };
  await db.savePoem(poem);
  await db.saveRevision(revision);
  await db.saveAudioTake(take);
  await db.renameTake(take.id, "Nieuwe naam");
  assert.equal((await db.loadSnapshot()).audioTakes[0].name, "Nieuwe naam");
  await db.deletePoem(poem.id);
  assert.deepEqual(await db.loadSnapshot(), { poems: [], revisions: [], audioTakes: [] });
});

test("private JSON import rejects checksum tampering", async () => {
  const poem = samplePoem("poem-checksum");
  const rawMarkdown = "# Testgedicht\r\n\r\nBronregel\r\n";
  const revision = {
    id: "rev-checksum",
    poemId: poem.id,
    title: poem.title,
    body: "Bronregel",
    rawMarkdown: `${rawMarkdown}geknoeid`,
    kind: "origineel" as const,
    label: "Origineel archief",
    createdAt: poem.createdAt,
    locked: true,
  };
  const expected = await archive.sha256(new TextEncoder().encode(rawMarkdown));
  const payload = {
    format: "collected-pages-private-import",
    version: 1,
    generatedAt: poem.createdAt,
    source: { original: "test" },
    counts: { poems: 1, revisions: 1, adjustedRevisions: 0 },
    poems: [{ ...poem, originalRevisionId: revision.id, activeRevisionId: revision.id }],
    revisions: [revision],
    checksums: { [revision.id]: expected },
  };
  await assert.rejects(
    archive.inspectImportFile(new File([JSON.stringify(payload)], "import.json", { type: "application/json" })),
    /integriteitscontrole/i,
  );
});
