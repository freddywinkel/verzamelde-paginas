import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import test from "node:test";

const packageUrl = new URL("../private-import/verzamelde-paginas-prive-import.json", import.meta.url);
const available = await access(packageUrl).then(() => true, () => false);

test("private corpus package preserves all originals and only genuine adjusted revisions", { skip: !available }, async () => {
  const payload = JSON.parse(await readFile(packageUrl, "utf8"));
  assert.equal(payload.format, "collected-pages-private-import");
  assert.equal(payload.version, 1);
  assert.equal(payload.counts.poems, payload.poems.length);
  assert.equal(payload.counts.revisions, payload.revisions.length);
  assert.equal(payload.counts.adjustedRevisions, payload.revisions.filter((revision) => revision.kind === "aangepast").length);
  assert.equal(new Set(payload.poems.map((poem) => poem.id)).size, payload.poems.length);
  assert.equal(payload.revisions.filter((revision) => revision.kind === "origineel").length, payload.poems.length);
  assert.ok(payload.revisions.every((revision) => revision.locked && revision.rawMarkdown && revision.body.trim()));
  assert.ok(payload.poems.every((poem) => poem.originalRevisionId === poem.activeRevisionId));
  assert.ok(payload.poems.every((poem) => poem.body.trim() && !poem.writtenOn));
  assert.equal(new Set(payload.poems.map((poem) => poem.sourceKey)).size, payload.poems.length);
  assert.equal(new Set(payload.poems.map((poem) => poem.originalChecksum)).size, payload.poems.length);
  assert.match(payload.source.original, /SHA-256 [a-f0-9]{64}/i);
  assert.match(payload.source.adjusted, /SHA-256 [a-f0-9]{64}/i);
});
