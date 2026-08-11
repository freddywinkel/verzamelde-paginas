import assert from "node:assert/strict";
import test from "node:test";
import { copyWholePoem, formatPoemForSharing, shareWholePoem } from "../lib/share-poem";

test("whole-poem text preserves every stanza and Unicode character", () => {
  const body = "Eerste regel\n\nTweede strofe — café 🌊\n";
  assert.equal(
    formatPoemForSharing({ title: "  Een titel  ", body }),
    `Een titel\n\n${body}`,
  );
});

test("native sharing receives the complete poem without a URL", async () => {
  let received: ShareData | undefined;
  const outcome = await shareWholePoem(
    { title: "Titel", body: "regel 1\n\nregel 2" },
    { share: async (data) => { received = data; } },
  );
  assert.equal(outcome, "shared");
  assert.deepEqual(received, {
    title: "Titel",
    text: "Titel\n\nregel 1\n\nregel 2",
  });
});

test("unsupported sharing copies the complete poem", async () => {
  let copied = "";
  const outcome = await shareWholePoem(
    { title: "Titel", body: "alle regels" },
    { writeClipboard: async (text) => { copied = text; } },
  );
  assert.equal(outcome, "copied");
  assert.equal(copied, "Titel\n\nalle regels");
});

test("cancelling a share does not copy unexpectedly", async () => {
  let copies = 0;
  const outcome = await shareWholePoem(
    { title: "Titel", body: "tekst" },
    {
      share: async () => { throw new DOMException("cancelled", "AbortError"); },
      writeClipboard: async () => { copies += 1; },
    },
  );
  assert.equal(outcome, "cancelled");
  assert.equal(copies, 0);
});

test("explicit copy falls back when Clipboard API writing is denied", async () => {
  let legacyText = "";
  await copyWholePoem(
    { title: "Titel", body: "tekst" },
    {
      writeClipboard: async () => { throw new Error("denied"); },
      legacyCopy: (text) => { legacyText = text; return true; },
    },
  );
  assert.equal(legacyText, "Titel\n\ntekst");
});
