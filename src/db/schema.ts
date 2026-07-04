import { sql } from "drizzle-orm";
import {
  bigint,
  boolean,
  customType,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";

const tsvector = customType<{ data: string }>({
  dataType: () => "tsvector",
});

// Bigint identity PKs throughout: the Google Reader-compat API expects int64
// item ids (docs/tech-stack.md). JS numbers are safe far beyond our scale.
const id = () =>
  bigint("id", { mode: "number" }).primaryKey().generatedAlwaysAsIdentity();

const createdAt = () =>
  timestamp("created_at", { withTimezone: true }).notNull().defaultNow();

export const users = pgTable("users", {
  id: id(),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  // Reader preferences; per-feed overrides live in subscriptions.settings.
  settings: jsonb("settings")
    .notNull()
    .default({})
    .$type<{ autoReadDays?: number }>(),
  createdAt: createdAt(),
});

// Global, shared across users: one row per feed URL, fetched once for everyone.
export const feeds = pgTable(
  "feeds",
  {
    id: id(),
    url: text("url").notNull().unique(),
    title: text("title"),
    siteUrl: text("site_url"),
    description: text("description"),
    // Conditional GET state
    etag: text("etag"),
    lastModified: text("last_modified"),
    // Scheduling: the worker picks up feeds where next_fetch_at <= now()
    nextFetchAt: timestamp("next_fetch_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    fetchIntervalMinutes: integer("fetch_interval_minutes")
      .notNull()
      .default(15),
    lastFetchedAt: timestamp("last_fetched_at", { withTimezone: true }),
    consecutiveFailures: integer("consecutive_failures").notNull().default(0),
    lastError: text("last_error"),
    createdAt: createdAt(),
  },
  (t) => [index("feeds_next_fetch_at_idx").on(t.nextFetchAt)],
);

export const folders = pgTable(
  "folders",
  {
    id: id(),
    userId: bigint("user_id", { mode: "number" })
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("folders_user_name_idx").on(t.userId, t.name)],
);

// Per-user: which feeds a user follows, and their personal settings for each.
export const subscriptions = pgTable(
  "subscriptions",
  {
    id: id(),
    userId: bigint("user_id", { mode: "number" })
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    feedId: bigint("feed_id", { mode: "number" })
      .notNull()
      .references(() => feeds.id, { onDelete: "cascade" }),
    folderId: bigint("folder_id", { mode: "number" }).references(
      () => folders.id,
      { onDelete: "set null" },
    ),
    customTitle: text("custom_title"),
    // Per-feed preferences (docs/design-ux.md); extend the type as settings grow.
    // autoReadDays overrides the user-level default from users.settings.
    settings: jsonb("settings")
      .notNull()
      .default({})
      .$type<{ fullContent?: boolean; autoReadDays?: number }>(),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("subscriptions_user_feed_idx").on(t.userId, t.feedId)],
);

// Global, shared across users; deduplicated per feed by guid.
export const items = pgTable(
  "items",
  {
    id: id(),
    feedId: bigint("feed_id", { mode: "number" })
      .notNull()
      .references(() => feeds.id, { onDelete: "cascade" }),
    guid: text("guid").notNull(),
    url: text("url"),
    title: text("title"),
    author: text("author"),
    // Sanitized at ingest; never store or render raw feed HTML.
    contentHtml: text("content_html"),
    // Readability-extracted article body (sanitized), cached once per item.
    fullContentHtml: text("full_content_html"),
    publishedAt: timestamp("published_at", { withTimezone: true }),
    createdAt: createdAt(),
    // Weighted FTS document: title > author > body (extracted content when
    // present, tags stripped). Indexed with BOTH english and norwegian
    // stemmers — the user's feeds mix the two; queries OR both parsers
    // (src/lib/reader.ts). Scaling beyond two known languages is a business
    // question, parked in docs/business-option.md.
    searchVector: tsvector("search_vector").generatedAlwaysAs(
      sql`setweight(to_tsvector('english', coalesce(title, '')), 'A') || setweight(to_tsvector('norwegian', coalesce(title, '')), 'A') || setweight(to_tsvector('english', coalesce(author, '')), 'B') || setweight(to_tsvector('english', regexp_replace(coalesce(full_content_html, content_html, ''), '<[^>]*>', ' ', 'g')), 'C') || setweight(to_tsvector('norwegian', regexp_replace(coalesce(full_content_html, content_html, ''), '<[^>]*>', ' ', 'g')), 'C')`,
    ),
  },
  (t) => [
    uniqueIndex("items_feed_guid_idx").on(t.feedId, t.guid),
    index("items_feed_published_idx").on(t.feedId, t.publishedAt),
    index("items_search_idx").using("gin", t.searchVector),
  ],
);

// Per-user read/star state, only written when state diverges from default.
export const itemStates = pgTable(
  "item_states",
  {
    userId: bigint("user_id", { mode: "number" })
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    itemId: bigint("item_id", { mode: "number" })
      .notNull()
      .references(() => items.id, { onDelete: "cascade" }),
    read: boolean("read").notNull().default(false),
    starred: boolean("starred").notNull().default(false),
    // Set by mute rules: excluded from lists and unread counts entirely.
    muted: boolean("muted").notNull().default(false),
    readAt: timestamp("read_at", { withTimezone: true }),
    starredAt: timestamp("starred_at", { withTimezone: true }),
  },
  (t) => [
    primaryKey({ columns: [t.userId, t.itemId] }),
    index("item_states_user_starred_idx").on(t.userId, t.starred),
  ],
);

// Per-user automation (docs/features.md v1): match new items by keyword/regex
// and mute, mark read, or star them. Values of field/match_type/action are
// constrained by the TS unions in src/lib/rules/engine.ts.
export const rules = pgTable(
  "rules",
  {
    id: id(),
    userId: bigint("user_id", { mode: "number" })
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    // null = applies to all of the user's feeds
    feedId: bigint("feed_id", { mode: "number" }).references(() => feeds.id, {
      onDelete: "cascade",
    }),
    field: text("field").notNull(), // 'title' | 'content' | 'author'
    matchType: text("match_type").notNull(), // 'contains' | 'regex'
    pattern: text("pattern").notNull(),
    action: text("action").notNull(), // 'mute' | 'mark_read' | 'star'
    enabled: boolean("enabled").notNull().default(true),
    createdAt: createdAt(),
  },
  (t) => [index("rules_user_idx").on(t.userId)],
);

// One row per fetch attempt; powers the feed health view (docs/features.md v1).
export const fetchLog = pgTable(
  "fetch_log",
  {
    id: id(),
    feedId: bigint("feed_id", { mode: "number" })
      .notNull()
      .references(() => feeds.id, { onDelete: "cascade" }),
    fetchedAt: timestamp("fetched_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    httpStatus: integer("http_status"),
    itemsAdded: integer("items_added").notNull().default(0),
    durationMs: integer("duration_ms"),
    error: text("error"),
  },
  (t) => [index("fetch_log_feed_fetched_idx").on(t.feedId, t.fetchedAt)],
);
