export interface PoemShareContent {
  title: string;
  body: string;
}

export type ShareOutcome = "shared" | "copied" | "cancelled";

interface ShareCapabilities {
  share?: (data: ShareData) => Promise<void>;
  writeClipboard?: (text: string) => Promise<void>;
  legacyCopy?: (text: string) => boolean;
}

export function formatPoemForSharing({ title, body }: PoemShareContent): string {
  const displayTitle = title.trim() || "Naamloos gedicht";
  return body ? `${displayTitle}\n\n${body}` : displayTitle;
}

function legacyCopyText(text: string): boolean {
  if (typeof document === "undefined" || !document.body) return false;
  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.readOnly = true;
  textarea.setAttribute("aria-hidden", "true");
  Object.assign(textarea.style, {
    position: "fixed",
    inset: "0 auto auto 0",
    width: "1px",
    height: "1px",
    opacity: "0",
    pointerEvents: "none",
  });
  document.body.append(textarea);
  textarea.focus({ preventScroll: true });
  textarea.select();
  textarea.setSelectionRange(0, textarea.value.length);
  let copied = false;
  try {
    copied = document.execCommand("copy");
  } finally {
    textarea.remove();
  }
  return copied;
}

function browserCapabilities(): ShareCapabilities {
  if (typeof navigator === "undefined") return {};
  return {
    share: typeof navigator.share === "function" ? navigator.share.bind(navigator) : undefined,
    writeClipboard: navigator.clipboard?.writeText
      ? navigator.clipboard.writeText.bind(navigator.clipboard)
      : undefined,
    legacyCopy: legacyCopyText,
  };
}

export async function copyWholePoem(
  content: PoemShareContent,
  capabilities: ShareCapabilities = browserCapabilities(),
): Promise<void> {
  const text = formatPoemForSharing(content);
  if (capabilities.writeClipboard) {
    try {
      await capabilities.writeClipboard(text);
      return;
    } catch {
      // Older browsers and denied Clipboard API permissions can still support
      // the user-gesture-driven selection fallback below.
    }
  }
  if (capabilities.legacyCopy?.(text)) return;
  throw new Error("Het volledige gedicht kon niet naar het klembord worden gekopieerd.");
}

export async function shareWholePoem(
  content: PoemShareContent,
  capabilities: ShareCapabilities = browserCapabilities(),
): Promise<ShareOutcome> {
  const text = formatPoemForSharing(content);
  if (!capabilities.share) {
    await copyWholePoem(content, capabilities);
    return "copied";
  }

  try {
    await capabilities.share({ title: content.title.trim() || "Naamloos gedicht", text });
    return "shared";
  } catch (cause) {
    if (typeof DOMException !== "undefined" && cause instanceof DOMException && cause.name === "AbortError") return "cancelled";
    if (cause && typeof cause === "object" && "name" in cause && cause.name === "AbortError") return "cancelled";
    throw new Error("Delen lukte niet. Gebruik ‘Kopieer tekst’ om het volledige gedicht over te nemen.");
  }
}
