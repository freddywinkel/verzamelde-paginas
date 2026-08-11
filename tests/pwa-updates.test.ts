import assert from "node:assert/strict";
import test from "node:test";
import { appScopeUrl, monitorPwaUpdates } from "../lib/pwa-updates";

test("app scope resolves to the GitHub project subpath", () => {
  assert.equal(
    appScopeUrl("https://freddywinkel.github.io/verzamelde-paginas/?view=write").pathname,
    "/verzamelde-paginas/",
  );
});

test("update monitor registers under the subpath and checks on lifecycle events", async () => {
  class FakeRegistration extends EventTarget {
    waiting = { state: "installed" } as ServiceWorker;
    installing: ServiceWorker | null = null;
    updateCalls = 0;
    async update() { this.updateCalls += 1; }
  }
  class FakeWorkers extends EventTarget {
    controller = {} as ServiceWorker;
    registration = new FakeRegistration();
    script = "";
    options?: RegistrationOptions;
    async register(script: string, options?: RegistrationOptions) {
      this.script = script;
      this.options = options;
      return this.registration as unknown as ServiceWorkerRegistration;
    }
  }
  class FakeWindow extends EventTarget {
    interval?: () => void;
    setInterval(callback: TimerHandler) { this.interval = callback as () => void; return 7; }
    clearInterval() { this.interval = undefined; }
  }
  class FakeDocument extends EventTarget {
    visibilityState: DocumentVisibilityState = "visible";
  }

  const workers = new FakeWorkers();
  const pageWindow = new FakeWindow();
  const pageDocument = new FakeDocument();
  let ready = 0;
  let controlled = 0;
  const monitor = await monitorPwaUpdates({
    onUpdateReady: () => { ready += 1; },
    onControllerChange: () => { controlled += 1; },
    baseUri: "https://freddywinkel.github.io/verzamelde-paginas/",
    serviceWorkers: workers as unknown as ServiceWorkerContainer,
    pageWindow: pageWindow as unknown as Window,
    pageDocument: pageDocument as unknown as Document,
  });
  await new Promise((resolve) => setTimeout(resolve, 0));

  assert.equal(workers.script, "/verzamelde-paginas/sw.js");
  assert.deepEqual(workers.options, { scope: "/verzamelde-paginas/", updateViaCache: "none" });
  assert.ok(workers.registration.updateCalls >= 1);
  assert.ok(ready >= 1);

  const beforeFocus = workers.registration.updateCalls;
  pageWindow.dispatchEvent(new Event("focus"));
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.ok(workers.registration.updateCalls > beforeFocus);
  workers.dispatchEvent(new Event("controllerchange"));
  assert.equal(controlled, 1);

  monitor.dispose();
  const afterDispose = workers.registration.updateCalls;
  pageWindow.dispatchEvent(new Event("online"));
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(workers.registration.updateCalls, afterDispose);
});
