interface ScrollTarget {
  scrollTo: (options: ScrollToOptions) => void;
}

interface PageLifecycleTarget extends ScrollTarget {
  addEventListener: (type: "pageshow", listener: () => void) => void;
  removeEventListener: (type: "pageshow", listener: () => void) => void;
  requestAnimationFrame: (callback: FrameRequestCallback) => number;
}

interface ScrollHistoryTarget {
  scrollRestoration?: ScrollRestoration;
}

export function resetPageScroll(target: ScrollTarget = window): void {
  target.scrollTo({ top: 0, left: 0, behavior: "auto" });
}

export function installPageTopReset(
  pageWindow: PageLifecycleTarget = window,
  pageHistory: ScrollHistoryTarget = history,
): () => void {
  const previous = pageHistory.scrollRestoration;
  pageHistory.scrollRestoration = "manual";
  const onPageShow = () => resetPageScroll(pageWindow);
  pageWindow.addEventListener("pageshow", onPageShow);
  resetPageScroll(pageWindow);
  pageWindow.requestAnimationFrame(() => resetPageScroll(pageWindow));
  return () => {
    pageWindow.removeEventListener("pageshow", onPageShow);
    pageHistory.scrollRestoration = previous;
  };
}
