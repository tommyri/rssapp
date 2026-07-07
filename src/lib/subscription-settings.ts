/** Per-feed preferences stored in subscriptions.settings (see schema.ts). */
export type SortOrder = "newest" | "oldest";

export interface SubscriptionSettings {
  fullContent?: boolean;
  autoReadDays?: number;
  /** When `'oldest'`, the feed view lists articles oldest-first. Default: newest. */
  sortOrder?: SortOrder;
  /**
   * When `false`, opening the feed shows read + unread (unless `?show=unread`).
   * Default / absent: unread-only, matching the global reader default.
   */
  defaultUnreadOnly?: boolean;
  /**
   * When `true`, stop fetching this feed for this user (feed health,
   * docs/features.md v0.2). Per-subscription so it's multi-tenant correct: the
   * scheduler polls a feed while at least one non-paused subscription wants it.
   * Written by setSubscriptionPaused, not the Manage-feeds Save form —
   * buildSubscriptionSettings passes unknown keys through, so a Save never
   * clears a pause.
   */
  paused?: boolean;
}

export const DEFAULT_SORT_ORDER: SortOrder = "newest";

export function parseSubscriptionSettings(raw: unknown): {
  fullContent: boolean;
  // null = no per-feed override; the global default applies.
  autoReadDays: number | null;
  sortOrder: SortOrder;
  defaultUnreadOnly: boolean;
  paused: boolean;
} {
  const s = (raw ?? {}) as SubscriptionSettings;
  return {
    fullContent: s.fullContent === true,
    autoReadDays:
      typeof s.autoReadDays === "number" && s.autoReadDays >= 1
        ? s.autoReadDays
        : null,
    sortOrder: s.sortOrder === "oldest" ? "oldest" : DEFAULT_SORT_ORDER,
    defaultUnreadOnly: s.defaultUnreadOnly !== false,
    paused: s.paused === true,
  };
}

/** Merge a settings patch for update; omits keys that match app defaults. */
export function buildSubscriptionSettings(
  current: SubscriptionSettings,
  patch: {
    fullContent: boolean;
    autoReadDays: number | null;
    sortOrder: SortOrder;
    defaultUnreadOnly: boolean;
  },
): SubscriptionSettings {
  const next: SubscriptionSettings = {
    ...current,
    fullContent: patch.fullContent,
  };

  if (patch.autoReadDays) next.autoReadDays = patch.autoReadDays;
  else delete next.autoReadDays;

  if (patch.sortOrder === "oldest") next.sortOrder = "oldest";
  else delete next.sortOrder;

  if (patch.defaultUnreadOnly === false) next.defaultUnreadOnly = false;
  else delete next.defaultUnreadOnly;

  return next;
}

/**
 * Whether the current view shows read articles. Global views default to
 * unread-only; a feed with defaultUnreadOnly=false opens on all articles.
 */
export function effectiveShowingAll(
  show: string | undefined,
  /** Pass when viewing a single feed; omit for all/folder/archive views. */
  feedDefaultUnreadOnly?: boolean,
): boolean {
  if (show === "all") return true;
  if (show === "unread") return false;
  if (feedDefaultUnreadOnly === false) return true;
  return false;
}

/** Href that toggles read/unread filter for the current view. */
export function toggleShowHref(
  params: {
    feed?: string;
    folder?: string;
    view?: string;
    show?: string;
  },
  feedDefaultUnreadOnly?: boolean,
): string {
  const query = new URLSearchParams();
  if (params.feed) query.set("feed", params.feed);
  if (params.folder) query.set("folder", params.folder);
  if (params.view) query.set("view", params.view);

  const showingAll = effectiveShowingAll(
    params.show,
    params.feed ? (feedDefaultUnreadOnly ?? true) : undefined,
  );

  if (showingAll) {
    if (feedDefaultUnreadOnly === false) query.set("show", "unread");
  } else {
    query.set("show", "all");
  }

  const qs = query.toString();
  return qs ? `/?${qs}` : "/";
}
