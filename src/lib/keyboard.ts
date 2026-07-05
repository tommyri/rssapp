/** True when the event target is a field where single-key shortcuts must not fire. */
export function shouldIgnoreKeyboard(target: EventTarget | null): boolean {
  if (!target || typeof target !== "object") return false;
  const el = target as { tagName?: string; isContentEditable?: boolean };
  if (!el.tagName) return false;
  const tag = el.tagName;
  if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return true;
  if (el.isContentEditable) return true;
  return false;
}

export interface ShortcutRow {
  keys: string;
  action: string;
}

/** Google Reader canon — kept in sync with design-ux.md. */
export const READER_SHORTCUTS: ShortcutRow[] = [
  { keys: "j / k", action: "Next / previous article" },
  { keys: "Space", action: "Scroll article, then next unread" },
  { keys: "m", action: "Toggle read / unread" },
  { keys: "s", action: "Star / unstar" },
  { keys: "v", action: "Open original in new tab" },
  { keys: "c", action: "Load full content" },
  { keys: "Shift + A", action: "Mark all read" },
  { keys: "o", action: "Mark older articles read" },
  { keys: "g then a", action: "Go to all articles" },
  { keys: "g then s", action: "Go to starred" },
  { keys: "g then u", action: "Go to unread only" },
  { keys: "a", action: "Focus add-feed field" },
  { keys: "/", action: "Focus search" },
  { keys: "⌘K / Ctrl+K", action: "Jump to feed, folder, or view" },
  { keys: "?", action: "Show this help" },
];
