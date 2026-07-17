import { sql } from "drizzle-orm";
import {
  bigint,
  boolean,
  check,
  customType,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  real,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import type { ArticleListDensity } from "@/lib/article-list-density";
import type { EmbedLoadingPreferences } from "@/lib/embed-loading";

const tsvector = customType<{ data: string }>({
  dataType: () => "tsvector",
});

// Bigint identity PKs throughout: the Google Reader-compat API expects int64
// item ids (docs/tech-stack.md). JS numbers are safe far beyond our scale.
const id = () =>
  bigint("id", { mode: "number" }).primaryKey().generatedAlwaysAsIdentity();

const createdAt = () =>
  timestamp("created_at", { withTimezone: true }).notNull().defaultNow();

export const users = pgTable(
  "users",
  {
    id: id(),
    email: text("email").notNull().unique(),
    passwordHash: text("password_hash").notNull(),
    /** A user can read only after proving that they control this address. */
    emailVerifiedAt: timestamp("email_verified_at", { withTimezone: true }),
    /** Reserved for the account profile introduced with onboarding. */
    displayName: text("display_name"),
    /** New accounts complete the guided setup before entering the reader. */
    onboardingCompletedAt: timestamp("onboarding_completed_at", {
      withTimezone: true,
    }),
    /** The deployment owner can manage accounts; all reader accounts are members. */
    role: text("role").notNull().default("member").$type<AccountRole>(),
    /**
     * This is an account-lifecycle state, not a product plan. Server-side
     * current-user resolution enforces it on every protected request.
     */
    status: text("status").notNull().default("active").$type<AccountStatus>(),
    /** Increment to revoke every extant JWT after a security-sensitive event. */
    sessionVersion: integer("session_version").notNull().default(1),
    lastSignedInAt: timestamp("last_signed_in_at", { withTimezone: true }),
    // Reader preferences; per-feed overrides live in subscriptions.settings.
    settings: jsonb("settings").notNull().default({}).$type<{
      autoReadDays?: number;
      collapseDuplicates?: boolean;
      articleListDensity?: ArticleListDensity;
      embedLoading?: EmbedLoadingPreferences;
      collapsedFolderIds?: number[];
      sidebarFolderIds?: number[];
      sidebarFeedIds?: Record<string, number[]>;
    }>(),
    createdAt: createdAt(),
  },
  (t) => [
    check("users_status_check", sql`${t.status} in ('active', 'suspended')`),
    check("users_role_check", sql`${t.role} in ('owner', 'member')`),
    // A single operator owns a self-hosted deployment. The partial unique index
    // makes the first public registration race-safe on an empty installation.
    uniqueIndex("users_single_owner_idx")
      .on(t.role)
      .where(sql`${t.role} = 'owner'`),
  ],
);

export const accountStatuses = ["active", "suspended"] as const;
export type AccountStatus = (typeof accountStatuses)[number];

export const accountRoles = ["owner", "member"] as const;
export type AccountRole = (typeof accountRoles)[number];

export const accountTokenKinds = [
  "email_verification",
  "password_reset",
  "email_change",
] as const;
export type AccountTokenKind = (typeof accountTokenKinds)[number];

/** Controls whether a deployment accepts public, invited, or no new accounts. */
export const registrationModes = ["open", "invite_only", "closed"] as const;
export type RegistrationMode = (typeof registrationModes)[number];

export const accountAuditEventTypes = [
  "account_suspended",
  "account_restored",
  "ownership_transferred",
  "registration_mode_changed",
  "invitation_issued",
  "invitation_revoked",
  "invitation_delivery_failed",
] as const;
export type AccountAuditEventType = (typeof accountAuditEventTypes)[number];

export interface AccountAuditMetadata {
  previousRegistrationMode?: RegistrationMode;
  registrationMode?: RegistrationMode;
  invitationEmail?: string;
  invitationId?: number;
}

/** One global row: product-wide configuration must not live on an owner profile. */
export const instanceSettings = pgTable(
  "instance_settings",
  {
    id: integer("id").primaryKey().default(1),
    registrationMode: text("registration_mode")
      .notNull()
      .default("open")
      .$type<RegistrationMode>(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    check("instance_settings_singleton_check", sql`${t.id} = 1`),
    check(
      "instance_settings_registration_mode_check",
      sql`${t.registrationMode} in ('open', 'invite_only', 'closed')`,
    ),
  ],
);

/** Owner-issued admission links. Only their one-time secret hashes are stored. */
export const accountInvites = pgTable(
  "account_invites",
  {
    id: id(),
    email: text("email").notNull(),
    tokenHash: text("token_hash").notNull(),
    invitedByUserId: bigint("invited_by_user_id", { mode: "number" })
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    acceptedAt: timestamp("accepted_at", { withTimezone: true }),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex("account_invites_hash_idx").on(t.tokenHash),
    index("account_invites_email_idx").on(t.email),
    // Each new invitation replaces an outstanding one for the address. This
    // gives recipients a single current link even across repeated sends.
    uniqueIndex("account_invites_pending_email_idx")
      .on(t.email)
      .where(sql`${t.acceptedAt} is null and ${t.revokedAt} is null`),
  ],
);

/**
 * Short-lived, hashed counters for anonymous authentication endpoints. The
 * bucket/key pair carries no raw email address or network address.
 */
export const authRateLimits = pgTable(
  "auth_rate_limits",
  {
    bucket: text("bucket").notNull(),
    keyHash: text("key_hash").notNull(),
    windowStartedAt: timestamp("window_started_at", {
      withTimezone: true,
    }).notNull(),
    attempts: integer("attempts").notNull().default(0),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.bucket, t.keyHash] }),
    index("auth_rate_limits_updated_at_idx").on(t.updatedAt),
    check("auth_rate_limits_attempts_check", sql`${t.attempts} >= 0`),
  ],
);

/** Immutable operator history for security-sensitive account administration. */
export const accountAuditEvents = pgTable(
  "account_audit_events",
  {
    id: id(),
    // Null identifies a break-glass operational command with no web-session actor.
    actorUserId: bigint("actor_user_id", { mode: "number" }).references(
      () => users.id,
      { onDelete: "set null" },
    ),
    targetUserId: bigint("target_user_id", { mode: "number" }).references(
      () => users.id,
      { onDelete: "set null" },
    ),
    eventType: text("event_type").notNull().$type<AccountAuditEventType>(),
    metadata: jsonb("metadata")
      .notNull()
      .default({})
      .$type<AccountAuditMetadata>(),
    createdAt: createdAt(),
  },
  (t) => [
    index("account_audit_events_created_at_idx").on(t.createdAt),
    index("account_audit_events_target_user_id_idx").on(t.targetUserId),
    check(
      "account_audit_events_type_check",
      sql`${t.eventType} in ('account_suspended', 'account_restored', 'ownership_transferred', 'registration_mode_changed', 'invitation_issued', 'invitation_revoked', 'invitation_delivery_failed')`,
    ),
  ],
);

/**
 * One-time, hashed secrets for account lifecycle links. The raw token is
 * delivered by email and is deliberately never written to Postgres.
 */
export const accountTokens = pgTable(
  "account_tokens",
  {
    id: id(),
    userId: bigint("user_id", { mode: "number" })
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    kind: text("kind").notNull().$type<AccountTokenKind>(),
    /** The address being verified or changed to; reset tokens record the current email. */
    email: text("email").notNull(),
    tokenHash: text("token_hash").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    usedAt: timestamp("used_at", { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex("account_tokens_hash_idx").on(t.tokenHash),
    index("account_tokens_user_kind_idx").on(t.userId, t.kind),
    check(
      "account_tokens_kind_check",
      sql`${t.kind} in ('email_verification', 'password_reset', 'email_change')`,
    ),
  ],
);

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
      .$type<import("@/lib/subscription-settings").SubscriptionSettings>(),
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
    // url normalized for cross-feed dedup (canonicalizeUrl): same story arriving
    // from multiple feeds shares this key so the reader can collapse duplicates.
    // Null when the item has no url or it isn't a usable http(s) URL.
    canonicalUrl: text("canonical_url"),
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
    // Partial: only the rows the dedup grouping actually touches.
    index("items_canonical_url_idx")
      .on(t.canonicalUrl)
      .where(sql`${t.canonicalUrl} is not null`),
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
    // Saved to the "Read later" queue: kept regardless of read state so the
    // user can clean out a feed but hold onto specific posts.
    readLater: boolean("read_later").notNull().default(false),
    // Set by mute rules: excluded from lists and unread counts entirely.
    muted: boolean("muted").notNull().default(false),
    readAt: timestamp("read_at", { withTimezone: true }),
    starredAt: timestamp("starred_at", { withTimezone: true }),
    readLaterAt: timestamp("read_later_at", { withTimezone: true }),
    // Null means no meaningful in-progress position (not started or finished).
    readingProgress: real("reading_progress"),
    readingProgressUpdatedAt: timestamp("reading_progress_updated_at", {
      withTimezone: true,
    }),
  },
  (t) => [
    primaryKey({ columns: [t.userId, t.itemId] }),
    index("item_states_user_starred_idx").on(t.userId, t.starred),
    index("item_states_user_read_later_idx").on(t.userId, t.readLater),
  ],
);

// Per-user organization, shared by feed articles and saved web pages through
// separate join tables. Labels are intentionally independent of subscriptions:
// an article can remain labeled even if it is also saved to Read later.
export const labels = pgTable(
  "labels",
  {
    id: id(),
    userId: bigint("user_id", { mode: "number" })
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("labels_user_name_idx").on(t.userId, t.name)],
);

export const itemLabels = pgTable(
  "item_labels",
  {
    labelId: bigint("label_id", { mode: "number" })
      .notNull()
      .references(() => labels.id, { onDelete: "cascade" }),
    itemId: bigint("item_id", { mode: "number" })
      .notNull()
      .references(() => items.id, { onDelete: "cascade" }),
  },
  (t) => [
    primaryKey({ columns: [t.labelId, t.itemId] }),
    index("item_labels_item_idx").on(t.itemId),
  ],
);

// Per-user automation (docs/features.md v1): match new items by keyword/regex
// and mute, mark read, star, or label them. Values of field/match_type/action are
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
    action: text("action").notNull(), // 'mute' | 'mark_read' | 'star' | 'tag'
    // Required for tag rules; deleting a label also removes its rules.
    labelId: bigint("label_id", { mode: "number" }).references(
      () => labels.id,
      { onDelete: "cascade" },
    ),
    enabled: boolean("enabled").notNull().default(true),
    createdAt: createdAt(),
  },
  (t) => [
    index("rules_user_idx").on(t.userId),
    index("rules_label_idx").on(t.labelId),
  ],
);

// Per-user "save any link to read later" (docs/features.md v0.2): arbitrary web
// pages saved by URL. They have no feed, so they live here instead of `items`.
// A Readability copy is fetched in the background (status pending -> ready/error)
// and folds into the unified Read later view alongside flagged feed items.
export const savedPages = pgTable(
  "saved_pages",
  {
    id: id(),
    userId: bigint("user_id", { mode: "number" })
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    // Canonicalized at save time (src/lib/saved-pages.ts); unique per user.
    url: text("url").notNull(),
    title: text("title"),
    byline: text("byline"),
    siteName: text("site_name"),
    excerpt: text("excerpt"),
    // Readability-extracted, sanitized article body — safe to render directly.
    contentHtml: text("content_html"),
    // Extraction lifecycle: 'pending' until fetched, then 'ready' or 'error'.
    status: text("status").notNull().default("pending"),
    error: text("error"),
    read: boolean("read").notNull().default(false),
    readAt: timestamp("read_at", { withTimezone: true }),
    // Saved pages are per-user, so their resume state can live on the row.
    readingProgress: real("reading_progress"),
    readingProgressUpdatedAt: timestamp("reading_progress_updated_at", {
      withTimezone: true,
    }),
    savedAt: timestamp("saved_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    // Same weighted, bilingual FTS document as items (schema.ts above), so
    // saved pages fold into search results next to feed articles.
    searchVector: tsvector("search_vector").generatedAlwaysAs(
      sql`setweight(to_tsvector('english', coalesce(title, '')), 'A') || setweight(to_tsvector('norwegian', coalesce(title, '')), 'A') || setweight(to_tsvector('english', coalesce(site_name, '')), 'B') || setweight(to_tsvector('english', coalesce(excerpt, '')), 'C') || setweight(to_tsvector('english', regexp_replace(coalesce(content_html, ''), '<[^>]*>', ' ', 'g')), 'C') || setweight(to_tsvector('norwegian', regexp_replace(coalesce(content_html, ''), '<[^>]*>', ' ', 'g')), 'C')`,
    ),
  },
  (t) => [
    uniqueIndex("saved_pages_user_url_idx").on(t.userId, t.url),
    index("saved_pages_user_saved_idx").on(t.userId, t.savedAt),
    index("saved_pages_status_idx").on(t.status),
    index("saved_pages_search_idx").using("gin", t.searchVector),
  ],
);

export const savedPageLabels = pgTable(
  "saved_page_labels",
  {
    labelId: bigint("label_id", { mode: "number" })
      .notNull()
      .references(() => labels.id, { onDelete: "cascade" }),
    savedPageId: bigint("saved_page_id", { mode: "number" })
      .notNull()
      .references(() => savedPages.id, { onDelete: "cascade" }),
  },
  (t) => [
    primaryKey({ columns: [t.labelId, t.savedPageId] }),
    index("saved_page_labels_page_idx").on(t.savedPageId),
  ],
);

// Per-user annotations on reader-visible text. Anchors use character offsets
// plus the selected quote so changed article text can never be highlighted by
// accident (src/lib/highlight-selection.ts).
export const highlights = pgTable(
  "highlights",
  {
    id: id(),
    userId: bigint("user_id", { mode: "number" })
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    itemId: bigint("item_id", { mode: "number" }).references(() => items.id, {
      onDelete: "cascade",
    }),
    savedPageId: bigint("saved_page_id", { mode: "number" }).references(
      () => savedPages.id,
      { onDelete: "cascade" },
    ),
    quote: text("quote").notNull(),
    startOffset: integer("start_offset").notNull(),
    endOffset: integer("end_offset").notNull(),
    note: text("note"),
    createdAt: createdAt(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("highlights_user_item_created_idx").on(
      t.userId,
      t.itemId,
      t.createdAt,
    ),
    index("highlights_user_page_created_idx").on(
      t.userId,
      t.savedPageId,
      t.createdAt,
    ),
  ],
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
