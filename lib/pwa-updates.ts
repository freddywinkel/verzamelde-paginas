export interface PwaUpdateMonitor {
  registration: ServiceWorkerRegistration;
  dispose: () => void;
}

interface PwaUpdateOptions {
  onUpdateReady: (worker: ServiceWorker) => void;
  onControllerChange: () => void;
  onCheckError?: () => void;
  intervalMs?: number;
  baseUri?: string;
  serviceWorkers?: ServiceWorkerContainer;
  pageWindow?: Window;
  pageDocument?: Document;
}

export function appScopeUrl(baseUri: string): URL {
  return new URL("./", baseUri);
}

export async function monitorPwaUpdates({
  onUpdateReady,
  onControllerChange,
  onCheckError,
  intervalMs = 60 * 60 * 1_000,
  baseUri = document.baseURI,
  serviceWorkers = navigator.serviceWorker,
  pageWindow = window,
  pageDocument = document,
}: PwaUpdateOptions): Promise<PwaUpdateMonitor> {
  const scopeUrl = appScopeUrl(baseUri);
  const registration = await serviceWorkers.register(new URL("sw.js", scopeUrl).pathname, {
    scope: scopeUrl.pathname,
    updateViaCache: "none",
  });

  const reportWaiting = () => {
    if (registration.waiting && serviceWorkers.controller) onUpdateReady(registration.waiting);
  };
  const check = async () => {
    try {
      await registration.update();
      reportWaiting();
    } catch {
      onCheckError?.();
    }
  };
  const onUpdateFound = () => {
    const worker = registration.installing;
    if (!worker) return;
    const onStateChange = () => {
      if (worker.state === "installed") {
        worker.removeEventListener("statechange", onStateChange);
        if (serviceWorkers.controller) onUpdateReady(worker);
      }
    };
    worker.addEventListener("statechange", onStateChange);
  };
  const onVisibilityChange = () => {
    if (pageDocument.visibilityState === "visible") void check();
  };
  const onFocus = () => { void check(); };
  const onOnline = () => { void check(); };

  registration.addEventListener("updatefound", onUpdateFound);
  serviceWorkers.addEventListener("controllerchange", onControllerChange);
  pageDocument.addEventListener("visibilitychange", onVisibilityChange);
  pageWindow.addEventListener("focus", onFocus);
  pageWindow.addEventListener("online", onOnline);
  const interval = pageWindow.setInterval(() => { void check(); }, intervalMs);

  reportWaiting();
  void check();

  return {
    registration,
    dispose: () => {
      pageWindow.clearInterval(interval);
      registration.removeEventListener("updatefound", onUpdateFound);
      serviceWorkers.removeEventListener("controllerchange", onControllerChange);
      pageDocument.removeEventListener("visibilitychange", onVisibilityChange);
      pageWindow.removeEventListener("focus", onFocus);
      pageWindow.removeEventListener("online", onOnline);
    },
  };
}
