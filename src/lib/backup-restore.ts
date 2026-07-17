import { and, count, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import {
  feeds,
  folders,
  highlights,
  itemLabels,
  itemStates,
  items,
  labels,
  rules,
  savedPageLabels,
  savedPages,
  subscriptions,
  users,
} from "@/db/schema";
import { normalizeArticleListDensity } from "@/lib/article-list-density";
import { canonicalizeUrl } from "@/lib/canonical-url";
import { normalizeEmbedLoadingPreferences } from "@/lib/embed-loading";
import { sanitizeArticleHtml } from "@/lib/feeds/sanitize";
import {
  parseSubscriptionSettings,
  type SubscriptionSettings,
} from "@/lib/subscription-settings";

const BACKUP_FORMAT = "rssapp-backup";
const BACKUP_VERSION = 1;
const IMPORT_BATCH_SIZE = 200;
const MAX_LABEL_NAME_LENGTH = 40;

const shortText = z.string().max(4_000);
const nullableText = shortText.nullable();
const nullableHtml = z.string().max(50_000_000).nullable();
const timestamp = z.string().datetime({ offset: true });
const nullableTimestamp = timestamp.nullable();
const httpUrl = z
  .string()
  .url()
  .refine((value) => /^https?:\/\//i.test(value), "Expected an HTTP(S) URL");

const userSettings = z.object({
  autoReadDays: z.number().int().min(1).max(3_650).nullable().optional(),
  collapseDuplicates: z.boolean().optional(),
  articleListDensity: z.unknown().optional(),
  embedLoading: z.unknown().optional(),
});

const itemSchema = z.object({
  feedUrl: httpUrl,
  guid: shortText.min(1),
  // Existing feed entries may contain a relative or otherwise malformed link.
  // Accept exported copies and normalize unsafe values away during the restore.
  url: nullableText,
  canonicalUrl: nullableText,
  title: nullableText,
  author: nullableText,
  contentHtml: nullableHtml,
  fullContentHtml: nullableHtml,
  // Backups produced before audio enclosures existed remain valid.
  audioUrl: httpUrl.nullable().optional().default(null),
  audioType: nullableText.optional().default(null),
  publishedAt: nullableTimestamp,
  createdAt: timestamp,
});

const backupDocumentSchema = z.object({
  format: z.literal(BACKUP_FORMAT),
  version: z.literal(BACKUP_VERSION),
  exportedAt: timestamp,
  user: z.object({
    email: z.string().email(),
    settings: userSettings,
    createdAt: timestamp,
  }),
  folders: z.array(z.object({ name: shortText.min(1), createdAt: timestamp })),
  subscriptions: z.array(
    z.object({
      feed: z.object({
        url: httpUrl,
        title: nullableText,
        siteUrl: nullableText,
        description: nullableText,
      }),
      folderName: nullableText,
      customTitle: nullableText,
      settings: z.unknown(),
      createdAt: timestamp,
    }),
  ),
  items: z.array(itemSchema),
  itemStates: z.array(
    z.object({
      feedUrl: httpUrl,
      guid: shortText.min(1),
      read: z.boolean(),
      starred: z.boolean(),
      readLater: z.boolean(),
      muted: z.boolean(),
      readAt: nullableTimestamp,
      starredAt: nullableTimestamp,
      readLaterAt: nullableTimestamp,
      readingProgress: z.number().min(0).max(1).nullable(),
      readingProgressUpdatedAt: nullableTimestamp,
    }),
  ),
  labels: z.array(
    z.object({
      name: z.string().min(1).max(MAX_LABEL_NAME_LENGTH),
      createdAt: timestamp,
    }),
  ),
  itemLabels: z.array(
    z.object({
      labelName: z.string().min(1).max(MAX_LABEL_NAME_LENGTH),
      feedUrl: httpUrl,
      guid: shortText.min(1),
    }),
  ),
  rules: z.array(
    z.object({
      feedUrl: httpUrl.nullable(),
      field: z.enum(["title", "content", "author"]),
      matchType: z.enum(["contains", "regex"]),
      pattern: shortText.min(1),
      action: z.enum(["mute", "mark_read", "star", "tag"]),
      labelName: z.string().min(1).max(MAX_LABEL_NAME_LENGTH).nullable(),
      enabled: z.boolean(),
      createdAt: timestamp,
    }),
  ),
  savedPages: z.array(
    z.object({
      url: httpUrl,
      title: nullableText,
      byline: nullableText,
      siteName: nullableText,
      excerpt: nullableText,
      contentHtml: nullableHtml,
      status: z.enum(["pending", "ready", "error"]),
      error: nullableText,
      read: z.boolean(),
      readAt: nullableTimestamp,
      readingProgress: z.number().min(0).max(1).nullable(),
      readingProgressUpdatedAt: nullableTimestamp,
      savedAt: timestamp,
    }),
  ),
  savedPageLabels: z.array(
    z.object({
      labelName: z.string().min(1).max(MAX_LABEL_NAME_LENGTH),
      pageUrl: httpUrl,
    }),
  ),
  highlights: z.array(
    z.object({
      target: z.discriminatedUnion("kind", [
        z.object({
          kind: z.literal("item"),
          feedUrl: httpUrl,
          guid: shortText.min(1),
        }),
        z.object({ kind: z.literal("savedPage"), url: httpUrl }),
      ]),
      quote: shortText.min(1),
      startOffset: z.number().int().min(0),
      endOffset: z.number().int().positive(),
      note: nullableText,
      createdAt: timestamp,
      updatedAt: timestamp,
    }),
  ),
});

export type BackupDocument = z.infer<typeof backupDocumentSchema>;

export class BackupRestoreError extends Error {}

function itemKey(feedUrl: string, guid: string): string {
  return `${feedUrl}\u0000${guid}`;
}

function unique(values: string[], description: string): void {
  const normalized = new Set<string>();
  for (const value of values) {
    const key = value.toLocaleLowerCase();
    if (normalized.has(key)) {
      throw new BackupRestoreError(
        `The backup contains duplicate ${description}.`,
      );
    }
    normalized.add(key);
  }
}

function validateReferences(backup: BackupDocument): void {
  unique(
    backup.folders.map((folder) => folder.name),
    "folder names",
  );
  unique(
    backup.labels.map((label) => label.name),
    "label names",
  );
  unique(
    backup.items.map((item) => itemKey(item.feedUrl, item.guid)),
    "articles",
  );
  unique(
    backup.savedPages.map((page) => page.url),
    "saved pages",
  );

  const folderNames = new Set(backup.folders.map((folder) => folder.name));
  const labelNames = new Set(
    backup.labels.map((label) => label.name.toLocaleLowerCase()),
  );
  const itemKeys = new Set(
    backup.items.map((item) => itemKey(item.feedUrl, item.guid)),
  );
  const pageUrls = new Set(backup.savedPages.map((page) => page.url));

  for (const subscription of backup.subscriptions) {
    if (subscription.folderName && !folderNames.has(subscription.folderName)) {
      throw new BackupRestoreError(
        "A subscription references a missing folder.",
      );
    }
  }
  for (const state of backup.itemStates) {
    if (!itemKeys.has(itemKey(state.feedUrl, state.guid))) {
      throw new BackupRestoreError(
        "An article state references a missing article.",
      );
    }
  }
  for (const assignment of backup.itemLabels) {
    if (
      !labelNames.has(assignment.labelName.toLocaleLowerCase()) ||
      !itemKeys.has(itemKey(assignment.feedUrl, assignment.guid))
    ) {
      throw new BackupRestoreError("An article label references missing data.");
    }
  }
  for (const assignment of backup.savedPageLabels) {
    if (
      !labelNames.has(assignment.labelName.toLocaleLowerCase()) ||
      !pageUrls.has(assignment.pageUrl)
    ) {
      throw new BackupRestoreError(
        "A saved-page label references missing data.",
      );
    }
  }
  for (const rule of backup.rules) {
    if (
      (rule.action === "tag" && !rule.labelName) ||
      (rule.labelName && !labelNames.has(rule.labelName.toLocaleLowerCase()))
    ) {
      throw new BackupRestoreError("A rule references a missing label.");
    }
  }
  for (const highlight of backup.highlights) {
    const targetExists =
      highlight.target.kind === "item"
        ? itemKeys.has(itemKey(highlight.target.feedUrl, highlight.target.guid))
        : pageUrls.has(highlight.target.url);
    if (!targetExists || highlight.endOffset <= highlight.startOffset) {
      throw new BackupRestoreError(
        "A highlight has an invalid source or range.",
      );
    }
  }
}

/** Parse and cross-check an untrusted export before previewing or restoring it. */
export function parseBackupDocument(input: unknown): BackupDocument {
  const parsed = backupDocumentSchema.safeParse(input);
  if (!parsed.success) {
    throw new BackupRestoreError("Choose a valid rssapp JSON backup file.");
  }
  validateReferences(parsed.data);
  return parsed.data;
}

export interface BackupRestorePreview {
  sourceEmail: string;
  exportedAt: string;
  folders: number;
  subscriptions: number;
  articles: number;
  savedPages: number;
  labels: number;
  rules: number;
  highlights: number;
}

/** Current user-owned records that a replace restore will remove. */
export interface CurrentReaderDataPreview {
  folders: number;
  subscriptions: number;
  articleStates: number;
  savedPages: number;
  labels: number;
  rules: number;
  highlights: number;
}

export function previewBackupRestore(
  backup: BackupDocument,
): BackupRestorePreview {
  return {
    sourceEmail: backup.user.email,
    exportedAt: backup.exportedAt,
    folders: backup.folders.length,
    subscriptions: backup.subscriptions.length,
    articles: backup.items.length,
    savedPages: backup.savedPages.length,
    labels: backup.labels.length,
    rules: backup.rules.length,
    highlights: backup.highlights.length,
  };
}

function date(value: string | null): Date | null {
  return value ? new Date(value) : null;
}

function safeHttpUrl(value: string | null): string | null {
  if (!value) return null;
  try {
    const parsed = new URL(value);
    return parsed.protocol === "http:" || parsed.protocol === "https:"
      ? parsed.toString()
      : null;
  } catch {
    return null;
  }
}

function chunks<T>(values: T[]): T[][] {
  const out: T[][] = [];
  for (let index = 0; index < values.length; index += IMPORT_BATCH_SIZE) {
    out.push(values.slice(index, index + IMPORT_BATCH_SIZE));
  }
  return out;
}

function restoredUserSettings(backup: BackupDocument) {
  const settings = backup.user.settings;
  return {
    ...(settings.autoReadDays ? { autoReadDays: settings.autoReadDays } : {}),
    ...(typeof settings.collapseDuplicates === "boolean"
      ? { collapseDuplicates: settings.collapseDuplicates }
      : {}),
    ...(settings.articleListDensity !== undefined
      ? {
          articleListDensity: normalizeArticleListDensity(
            settings.articleListDensity,
          ),
        }
      : {}),
    ...(settings.embedLoading !== undefined
      ? {
          embedLoading: normalizeEmbedLoadingPreferences(settings.embedLoading),
        }
      : {}),
  };
}

function restoredSubscriptionSettings(raw: unknown): SubscriptionSettings {
  const settings = parseSubscriptionSettings(raw);
  return {
    ...(settings.fullContent ? { fullContent: true } : {}),
    ...(settings.autoReadDays && settings.autoReadDays <= 3_650
      ? { autoReadDays: settings.autoReadDays }
      : {}),
    ...(settings.sortOrder === "oldest"
      ? { sortOrder: "oldest" as const }
      : {}),
    ...(settings.defaultUnreadOnly === false
      ? { defaultUnreadOnly: false }
      : {}),
    ...(settings.paused ? { paused: true } : {}),
  };
}

type RestoreTransaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

async function currentReaderDataPreview(
  tx: RestoreTransaction,
  userId: number,
): Promise<CurrentReaderDataPreview> {
  const [
    folderCount,
    subscriptionCount,
    stateCount,
    labelCount,
    ruleCount,
    pageCount,
    highlightCount,
  ] = await Promise.all([
    tx
      .select({ value: count() })
      .from(folders)
      .where(eq(folders.userId, userId)),
    tx
      .select({ value: count() })
      .from(subscriptions)
      .where(eq(subscriptions.userId, userId)),
    tx
      .select({ value: count() })
      .from(itemStates)
      .where(eq(itemStates.userId, userId)),
    tx.select({ value: count() }).from(labels).where(eq(labels.userId, userId)),
    tx.select({ value: count() }).from(rules).where(eq(rules.userId, userId)),
    tx
      .select({ value: count() })
      .from(savedPages)
      .where(eq(savedPages.userId, userId)),
    tx
      .select({ value: count() })
      .from(highlights)
      .where(eq(highlights.userId, userId)),
  ]);
  return {
    folders: Number(folderCount[0]?.value ?? 0),
    subscriptions: Number(subscriptionCount[0]?.value ?? 0),
    articleStates: Number(stateCount[0]?.value ?? 0),
    labels: Number(labelCount[0]?.value ?? 0),
    rules: Number(ruleCount[0]?.value ?? 0),
    savedPages: Number(pageCount[0]?.value ?? 0),
    highlights: Number(highlightCount[0]?.value ?? 0),
  };
}

/** Preview the user-owned records a confirmed restore would replace. */
export async function previewCurrentReaderData(
  userId: number,
): Promise<CurrentReaderDataPreview> {
  return db.transaction((tx) => currentReaderDataPreview(tx, userId));
}

async function clearCurrentReaderData(
  tx: RestoreTransaction,
  userId: number,
): Promise<void> {
  // All of these rows are user-owned. Their global feed and item cache remains
  // intact for other accounts and can be reused by the restored subscriptions.
  await tx.delete(highlights).where(eq(highlights.userId, userId));
  await tx.delete(itemStates).where(eq(itemStates.userId, userId));
  await tx.delete(rules).where(eq(rules.userId, userId));
  await tx.delete(savedPages).where(eq(savedPages.userId, userId));
  await tx.delete(labels).where(eq(labels.userId, userId));
  await tx.delete(subscriptions).where(eq(subscriptions.userId, userId));
  await tx.delete(folders).where(eq(folders.userId, userId));
}

/**
 * Replace the current account's reader data with a validated backup. The whole
 * delete-and-restore operation is one transaction, so it cannot leave a
 * partially cleared account. Account credentials are never touched.
 */
export async function restoreBackup(
  userId: number,
  backup: BackupDocument,
): Promise<BackupRestorePreview> {
  return db.transaction(async (tx) => {
    await clearCurrentReaderData(tx, userId);

    const folderIdByName = new Map<string, number>();
    for (const folder of backup.folders) {
      const [created] = await tx
        .insert(folders)
        .values({
          userId,
          name: folder.name,
          createdAt: new Date(folder.createdAt),
        })
        .returning({ id: folders.id, name: folders.name });
      if (created) folderIdByName.set(created.name, created.id);
    }

    const feedMetadata = new Map<
      string,
      {
        title: string | null;
        siteUrl: string | null;
        description: string | null;
      }
    >();
    for (const subscription of backup.subscriptions) {
      feedMetadata.set(subscription.feed.url, subscription.feed);
    }
    for (const item of backup.items) {
      if (!feedMetadata.has(item.feedUrl)) {
        feedMetadata.set(item.feedUrl, {
          title: null,
          siteUrl: null,
          description: null,
        });
      }
    }
    for (const rule of backup.rules) {
      if (rule.feedUrl && !feedMetadata.has(rule.feedUrl)) {
        feedMetadata.set(rule.feedUrl, {
          title: null,
          siteUrl: null,
          description: null,
        });
      }
    }

    const feedIdByUrl = new Map<string, number>();
    for (const [url, metadata] of feedMetadata) {
      const [inserted] = await tx
        .insert(feeds)
        .values({
          url,
          title: metadata.title,
          siteUrl: safeHttpUrl(metadata.siteUrl),
          description: metadata.description,
          nextFetchAt: new Date(),
        })
        .onConflictDoNothing({ target: feeds.url })
        .returning({ id: feeds.id });
      if (inserted) {
        feedIdByUrl.set(url, inserted.id);
        continue;
      }
      const [existing] = await tx
        .select({ id: feeds.id })
        .from(feeds)
        .where(eq(feeds.url, url));
      if (!existing) throw new BackupRestoreError("Couldn't restore a feed.");
      feedIdByUrl.set(url, existing.id);
    }

    for (const subscription of backup.subscriptions) {
      const feedId = feedIdByUrl.get(subscription.feed.url);
      if (!feedId)
        throw new BackupRestoreError("Couldn't restore a subscription.");
      await tx
        .insert(subscriptions)
        .values({
          userId,
          feedId,
          folderId: subscription.folderName
            ? (folderIdByName.get(subscription.folderName) ?? null)
            : null,
          customTitle: subscription.customTitle,
          settings: restoredSubscriptionSettings(subscription.settings),
          createdAt: new Date(subscription.createdAt),
        })
        .onConflictDoNothing({
          target: [subscriptions.userId, subscriptions.feedId],
        });
    }

    for (const batch of chunks(backup.items)) {
      await tx
        .insert(items)
        .values(
          batch.map((item) => {
            const feedId = feedIdByUrl.get(item.feedUrl);
            if (!feedId) {
              throw new BackupRestoreError("Couldn't restore an article feed.");
            }
            return {
              feedId,
              guid: item.guid,
              url: safeHttpUrl(item.url),
              canonicalUrl: canonicalizeUrl(
                item.canonicalUrl ?? item.url ?? "",
              ),
              title: item.title,
              author: item.author,
              contentHtml: item.contentHtml
                ? sanitizeArticleHtml(item.contentHtml)
                : null,
              fullContentHtml: item.fullContentHtml
                ? sanitizeArticleHtml(item.fullContentHtml)
                : null,
              audioUrl: safeHttpUrl(item.audioUrl),
              audioType: item.audioType,
              publishedAt: date(item.publishedAt),
              createdAt: new Date(item.createdAt),
            };
          }),
        )
        .onConflictDoNothing({ target: [items.feedId, items.guid] });
    }

    const itemIdByKey = new Map<string, number>();
    const guidsByFeed = new Map<string, string[]>();
    for (const item of backup.items) {
      const guids = guidsByFeed.get(item.feedUrl) ?? [];
      guids.push(item.guid);
      guidsByFeed.set(item.feedUrl, guids);
    }
    for (const [feedUrl, guids] of guidsByFeed) {
      const feedId = feedIdByUrl.get(feedUrl);
      if (!feedId) continue;
      for (const batch of chunks(guids)) {
        const restoredItems = await tx
          .select({ id: items.id, guid: items.guid })
          .from(items)
          .where(and(eq(items.feedId, feedId), inArray(items.guid, batch)));
        for (const item of restoredItems) {
          itemIdByKey.set(itemKey(feedUrl, item.guid), item.id);
        }
      }
    }

    if (backup.labels.length > 0) {
      await tx.insert(labels).values(
        backup.labels.map((label) => ({
          userId,
          name: label.name,
          createdAt: new Date(label.createdAt),
        })),
      );
    }
    const restoredLabels = await tx
      .select({ id: labels.id, name: labels.name })
      .from(labels)
      .where(eq(labels.userId, userId));
    const labelIdByName = new Map(
      restoredLabels.map((label) => [label.name.toLocaleLowerCase(), label.id]),
    );

    for (const batch of chunks(backup.itemStates)) {
      await tx
        .insert(itemStates)
        .values(
          batch.flatMap((state) => {
            const itemId = itemIdByKey.get(itemKey(state.feedUrl, state.guid));
            return itemId
              ? [
                  {
                    userId,
                    itemId,
                    read: state.read,
                    starred: state.starred,
                    readLater: state.readLater,
                    muted: state.muted,
                    readAt: date(state.readAt),
                    starredAt: date(state.starredAt),
                    readLaterAt: date(state.readLaterAt),
                    readingProgress: state.readingProgress,
                    readingProgressUpdatedAt: date(
                      state.readingProgressUpdatedAt,
                    ),
                  },
                ]
              : [];
          }),
        )
        .onConflictDoNothing();
    }

    const itemLabelValues = backup.itemLabels.flatMap((assignment) => {
      const labelId = labelIdByName.get(
        assignment.labelName.toLocaleLowerCase(),
      );
      const itemId = itemIdByKey.get(
        itemKey(assignment.feedUrl, assignment.guid),
      );
      return labelId && itemId ? [{ labelId, itemId }] : [];
    });
    for (const batch of chunks(itemLabelValues)) {
      if (batch.length > 0) {
        await tx.insert(itemLabels).values(batch).onConflictDoNothing();
      }
    }

    for (const batch of chunks(backup.savedPages)) {
      await tx
        .insert(savedPages)
        .values(
          batch.map((page) => ({
            userId,
            url: page.url,
            title: page.title,
            byline: page.byline,
            siteName: page.siteName,
            excerpt: page.excerpt,
            contentHtml: page.contentHtml
              ? sanitizeArticleHtml(page.contentHtml)
              : null,
            status: page.status,
            error: page.error,
            read: page.read,
            readAt: date(page.readAt),
            readingProgress: page.readingProgress,
            readingProgressUpdatedAt: date(page.readingProgressUpdatedAt),
            savedAt: new Date(page.savedAt),
          })),
        )
        .onConflictDoNothing({ target: [savedPages.userId, savedPages.url] });
    }
    const restoredPages = await tx
      .select({ id: savedPages.id, url: savedPages.url })
      .from(savedPages)
      .where(eq(savedPages.userId, userId));
    const pageIdByUrl = new Map(
      restoredPages.map((page) => [page.url, page.id]),
    );

    const savedPageLabelValues = backup.savedPageLabels.flatMap(
      (assignment) => {
        const labelId = labelIdByName.get(
          assignment.labelName.toLocaleLowerCase(),
        );
        const savedPageId = pageIdByUrl.get(assignment.pageUrl);
        return labelId && savedPageId ? [{ labelId, savedPageId }] : [];
      },
    );
    for (const batch of chunks(savedPageLabelValues)) {
      if (batch.length > 0) {
        await tx.insert(savedPageLabels).values(batch).onConflictDoNothing();
      }
    }

    for (const batch of chunks(backup.rules)) {
      await tx.insert(rules).values(
        batch.map((rule) => ({
          userId,
          feedId: rule.feedUrl ? (feedIdByUrl.get(rule.feedUrl) ?? null) : null,
          field: rule.field,
          matchType: rule.matchType,
          pattern: rule.pattern,
          action: rule.action,
          labelId: rule.labelName
            ? (labelIdByName.get(rule.labelName.toLocaleLowerCase()) ?? null)
            : null,
          enabled: rule.enabled,
          createdAt: new Date(rule.createdAt),
        })),
      );
    }

    const highlightValues = backup.highlights.flatMap((highlight) => {
      const target = highlight.target;
      const itemId =
        target.kind === "item"
          ? (itemIdByKey.get(itemKey(target.feedUrl, target.guid)) ?? null)
          : null;
      const savedPageId =
        target.kind === "savedPage"
          ? (pageIdByUrl.get(target.url) ?? null)
          : null;
      return itemId || savedPageId
        ? [
            {
              userId,
              itemId,
              savedPageId,
              quote: highlight.quote,
              startOffset: highlight.startOffset,
              endOffset: highlight.endOffset,
              note: highlight.note,
              createdAt: new Date(highlight.createdAt),
              updatedAt: new Date(highlight.updatedAt),
            },
          ]
        : [];
    });
    for (const batch of chunks(highlightValues)) {
      if (batch.length > 0) await tx.insert(highlights).values(batch);
    }

    await tx
      .update(users)
      .set({ settings: restoredUserSettings(backup) })
      .where(eq(users.id, userId));

    return previewBackupRestore(backup);
  });
}
