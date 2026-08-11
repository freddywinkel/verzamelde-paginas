import assert from "node:assert/strict";
import test from "node:test";
import { installPageTopReset, resetPageScroll } from "../lib/navigation";

test("page reset always jumps immediately to the top-left", () => {
  const calls: ScrollToOptions[] = [];
  resetPageScroll({ scrollTo: (options) => calls.push(options) });
  assert.deepEqual(calls, [{ top: 0, left: 0, behavior: "auto" }]);
});

test("initial load and pageshow reset the page and cleanup restores browser behavior", () => {
  const calls: ScrollToOptions[] = [];
  let pageShow: (() => void) | undefined;
  let removed: (() => void) | undefined;
  const pageWindow = {
    scrollTo: (options: ScrollToOptions) => calls.push(options),
    addEventListener: (_type: "pageshow", listener: () => void) => { pageShow = listener; },
    removeEventListener: (_type: "pageshow", listener: () => void) => { removed = listener; },
    requestAnimationFrame: (callback: FrameRequestCallback) => { callback(0); return 1; },
  };
  const pageHistory: { scrollRestoration?: ScrollRestoration } = { scrollRestoration: "auto" };
  const dispose = installPageTopReset(pageWindow, pageHistory);
  assert.equal(pageHistory.scrollRestoration, "manual");
  assert.equal(calls.length, 2);
  pageShow?.();
  assert.equal(calls.length, 3);
  dispose();
  assert.equal(removed, pageShow);
  assert.equal(pageHistory.scrollRestoration, "auto");
});
