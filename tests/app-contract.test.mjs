import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const source = await readFile(new URL("../app/PoetryApp.tsx", import.meta.url), "utf8");

test("all top-level view changes pass through the scroll-reset navigator", () => {
  assert.equal(source.match(/setView\(/g)?.length, 1, "only completeViewChange may call setView");
  assert.match(source, /setView\(nextView\);[\s\S]{0,120}resetPageScroll\(\)/);
  assert.match(source, /changeFullReader[\s\S]{0,180}resetPageScroll\(\)/);
  assert.doesNotMatch(source, /onClick=\{\(\) => setView\(/);
});

test("navigation and approved updates flush pending editor text", () => {
  assert.match(source, /onRegisterFlush\(flushSave\)/);
  assert.match(source, /if \(!await flushEditor\(\)\)/);
  assert.match(source, /updateActivationRequestedRef\.current = true/);
  assert.match(source, /monitorPwaUpdates/);
});

test("whole-poem share and copy are offered in preview and full reader", () => {
  assert.match(source, /Deel volledig gedicht/);
  assert.match(source, /Kopieer volledig gedicht/);
  assert.match(source, /Deel volledig gedicht[\s\S]*Kopieer hele tekst/);
});
