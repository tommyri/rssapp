import { mkdir, readdir, rename, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { and, asc, eq } from "drizzle-orm";
import { db } from "@/db";
import {
  feeds,
  folders,
  highlights,
  itemAudioProgress,
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
import { getBackupConfiguration } from "./backup-config";

const BACKUP_FORMAT_VERSION = 1;
const RETRY_DELAY_MS = 5 * 60_000;

function iso(date: Date | null): string | null {
  return date?.toISOString() ?? null;
}

function itemIdentity(feedUrl: string, guid: string): string {
  return `${feedUrl}\u0000${guid}`;
}

function backupTimestamp(date: Date): string {
  return date.toISOString().replace(/[:.]/g, "-");
}

/** A stable, portable name that contains no account details. */
export function backupFilename(userId: number, date: Date): string {
  return `rssapp-backup-user-${userId}-${backupTimestamp(date)}.json`;
}

/**
 * Build a user-owned backup. It intentionally omits password hashes, fetch logs,
 * feed polling state, and every other user's records. Feed articles are included
 * so saved, starred, labeled, and highlighted material remains recoverable even
 * if the original feed later removes it.
 */
export async function exportUserBackup(userId: number) {
  const [user] = await db
    .select({
      email: users.email,
      settings: users.settings,
      createdAt: users.createdAt,
    })
    .from(users)
    .where(eq(users.id, userId));
  if (!user) throw new Error("User not found.");

  const [
    folderRows,
    subscriptionRows,
    subscribedItemRows,
    stateRows,
    audioProgressRows,
    labelRows,
    itemLabelRows,
    ruleRows,
    savedPageRows,
    savedPageLabelRows,
    highlightRows,
  ] = await Promise.all([
    db
      .select({ name: folders.name, createdAt: folders.createdAt })
      .from(folders)
      .where(eq(folders.userId, userId))
      .orderBy(asc(folders.name)),
    db
      .select({
        feedUrl: feeds.url,
        feedTitle: feeds.title,
        feedSiteUrl: feeds.siteUrl,
        feedDescription: feeds.description,
        folderName: folders.name,
        customTitle: subscriptions.customTitle,
        settings: subscriptions.settings,
        createdAt: subscriptions.createdAt,
      })
      .from(subscriptions)
      .innerJoin(feeds, eq(feeds.id, subscriptions.feedId))
      .leftJoin(folders, eq(folders.id, subscriptions.folderId))
      .where(eq(subscriptions.userId, userId))
      .orderBy(asc(folders.name), asc(feeds.url)),
    db
      .select({
        feedUrl: feeds.url,
        guid: items.guid,
        url: items.url,
        canonicalUrl: items.canonicalUrl,
        title: items.title,
        author: items.author,
        contentHtml: items.contentHtml,
        fullContentHtml: items.fullContentHtml,
        audioUrl: items.audioUrl,
        audioType: items.audioType,
        publishedAt: items.publishedAt,
        createdAt: items.createdAt,
      })
      .from(subscriptions)
      .innerJoin(feeds, eq(feeds.id, subscriptions.feedId))
      .innerJoin(items, eq(items.feedId, feeds.id))
      .where(eq(subscriptions.userId, userId))
      .orderBy(asc(feeds.url), asc(items.publishedAt), asc(items.id)),
    db
      .select({
        feedUrl: feeds.url,
        guid: items.guid,
        url: items.url,
        canonicalUrl: items.canonicalUrl,
        title: items.title,
        author: items.author,
        contentHtml: items.contentHtml,
        fullContentHtml: items.fullContentHtml,
        audioUrl: items.audioUrl,
        audioType: items.audioType,
        publishedAt: items.publishedAt,
        createdAt: items.createdAt,
        read: itemStates.read,
        starred: itemStates.starred,
        readLater: itemStates.readLater,
        muted: itemStates.muted,
        readAt: itemStates.readAt,
        starredAt: itemStates.starredAt,
        readLaterAt: itemStates.readLaterAt,
        readingProgress: itemStates.readingProgress,
        readingProgressUpdatedAt: itemStates.readingProgressUpdatedAt,
      })
      .from(itemStates)
      .innerJoin(items, eq(items.id, itemStates.itemId))
      .innerJoin(feeds, eq(feeds.id, items.feedId))
      .where(eq(itemStates.userId, userId))
      .orderBy(asc(feeds.url), asc(items.publishedAt), asc(items.id)),
    db
      .select({
        feedUrl: feeds.url,
        guid: items.guid,
        audioUrl: itemAudioProgress.audioUrl,
        progressSeconds: itemAudioProgress.progressSeconds,
        updatedAt: itemAudioProgress.updatedAt,
      })
      .from(itemAudioProgress)
      .innerJoin(items, eq(items.id, itemAudioProgress.itemId))
      .innerJoin(feeds, eq(feeds.id, items.feedId))
      .where(eq(itemAudioProgress.userId, userId))
      .orderBy(
        asc(feeds.url),
        asc(items.guid),
        asc(itemAudioProgress.audioUrl),
      ),
    db
      .select({ name: labels.name, createdAt: labels.createdAt })
      .from(labels)
      .where(eq(labels.userId, userId))
      .orderBy(asc(labels.name)),
    db
      .select({
        labelName: labels.name,
        feedUrl: feeds.url,
        guid: items.guid,
        url: items.url,
        canonicalUrl: items.canonicalUrl,
        title: items.title,
        author: items.author,
        contentHtml: items.contentHtml,
        fullContentHtml: items.fullContentHtml,
        audioUrl: items.audioUrl,
        audioType: items.audioType,
        publishedAt: items.publishedAt,
        createdAt: items.createdAt,
      })
      .from(itemLabels)
      .innerJoin(labels, eq(labels.id, itemLabels.labelId))
      .innerJoin(items, eq(items.id, itemLabels.itemId))
      .innerJoin(feeds, eq(feeds.id, items.feedId))
      .where(eq(labels.userId, userId))
      .orderBy(asc(labels.name), asc(feeds.url), asc(items.guid)),
    db
      .select({
        feedUrl: feeds.url,
        field: rules.field,
        matchType: rules.matchType,
        pattern: rules.pattern,
        action: rules.action,
        labelName: labels.name,
        enabled: rules.enabled,
        createdAt: rules.createdAt,
      })
      .from(rules)
      .leftJoin(feeds, eq(feeds.id, rules.feedId))
      .leftJoin(labels, eq(labels.id, rules.labelId))
      .where(eq(rules.userId, userId))
      .orderBy(asc(rules.createdAt), asc(rules.id)),
    db
      .select({
        url: savedPages.url,
        title: savedPages.title,
        byline: savedPages.byline,
        siteName: savedPages.siteName,
        excerpt: savedPages.excerpt,
        contentHtml: savedPages.contentHtml,
        status: savedPages.status,
        error: savedPages.error,
        read: savedPages.read,
        readAt: savedPages.readAt,
        readingProgress: savedPages.readingProgress,
        readingProgressUpdatedAt: savedPages.readingProgressUpdatedAt,
        savedAt: savedPages.savedAt,
      })
      .from(savedPages)
      .where(eq(savedPages.userId, userId))
      .orderBy(asc(savedPages.savedAt), asc(savedPages.id)),
    db
      .select({ labelName: labels.name, pageUrl: savedPages.url })
      .from(savedPageLabels)
      .innerJoin(labels, eq(labels.id, savedPageLabels.labelId))
      .innerJoin(savedPages, eq(savedPages.id, savedPageLabels.savedPageId))
      .where(and(eq(labels.userId, userId), eq(savedPages.userId, userId)))
      .orderBy(asc(labels.name), asc(savedPages.url)),
    db
      .select({
        itemId: highlights.itemId,
        savedPageId: highlights.savedPageId,
        feedUrl: feeds.url,
        guid: items.guid,
        itemUrl: items.url,
        itemCanonicalUrl: items.canonicalUrl,
        itemTitle: items.title,
        itemAuthor: items.author,
        itemContentHtml: items.contentHtml,
        itemFullContentHtml: items.fullContentHtml,
        itemAudioUrl: items.audioUrl,
        itemAudioType: items.audioType,
        itemPublishedAt: items.publishedAt,
        itemCreatedAt: items.createdAt,
        pageUrl: savedPages.url,
        quote: highlights.quote,
        startOffset: highlights.startOffset,
        endOffset: highlights.endOffset,
        note: highlights.note,
        createdAt: highlights.createdAt,
        updatedAt: highlights.updatedAt,
      })
      .from(highlights)
      .leftJoin(items, eq(items.id, highlights.itemId))
      .leftJoin(feeds, eq(feeds.id, items.feedId))
      .leftJoin(savedPages, eq(savedPages.id, highlights.savedPageId))
      .where(eq(highlights.userId, userId))
      .orderBy(asc(highlights.createdAt), asc(highlights.id)),
  ]);

  const itemRecords = new Map(
    subscribedItemRows.map((item) => [
      itemIdentity(item.feedUrl, item.guid),
      {
        feedUrl: item.feedUrl,
        guid: item.guid,
        url: item.url,
        canonicalUrl: item.canonicalUrl,
        title: item.title,
        author: item.author,
        contentHtml: item.contentHtml,
        fullContentHtml: item.fullContentHtml,
        audioUrl: item.audioUrl,
        audioType: item.audioType,
        publishedAt: iso(item.publishedAt),
        createdAt: iso(item.createdAt),
      },
    ]),
  );
  for (const item of stateRows) {
    const key = itemIdentity(item.feedUrl, item.guid);
    if (itemRecords.has(key)) continue;
    itemRecords.set(key, {
      feedUrl: item.feedUrl,
      guid: item.guid,
      url: item.url,
      canonicalUrl: item.canonicalUrl,
      title: item.title,
      author: item.author,
      contentHtml: item.contentHtml,
      fullContentHtml: item.fullContentHtml,
      audioUrl: item.audioUrl,
      audioType: item.audioType,
      publishedAt: iso(item.publishedAt),
      createdAt: iso(item.createdAt),
    });
  }
  for (const item of itemLabelRows) {
    const key = itemIdentity(item.feedUrl, item.guid);
    if (itemRecords.has(key)) continue;
    itemRecords.set(key, {
      feedUrl: item.feedUrl,
      guid: item.guid,
      url: item.url,
      canonicalUrl: item.canonicalUrl,
      title: item.title,
      author: item.author,
      contentHtml: item.contentHtml,
      fullContentHtml: item.fullContentHtml,
      audioUrl: item.audioUrl,
      audioType: item.audioType,
      publishedAt: iso(item.publishedAt),
      createdAt: iso(item.createdAt),
    });
  }
  for (const highlight of highlightRows) {
    if (!highlight.feedUrl || !highlight.guid) continue;
    const key = itemIdentity(highlight.feedUrl, highlight.guid);
    if (itemRecords.has(key)) continue;
    itemRecords.set(key, {
      feedUrl: highlight.feedUrl,
      guid: highlight.guid,
      url: highlight.itemUrl,
      canonicalUrl: highlight.itemCanonicalUrl,
      title: highlight.itemTitle,
      author: highlight.itemAuthor,
      contentHtml: highlight.itemContentHtml,
      fullContentHtml: highlight.itemFullContentHtml,
      audioUrl: highlight.itemAudioUrl,
      audioType: highlight.itemAudioType,
      publishedAt: iso(highlight.itemPublishedAt),
      createdAt: iso(highlight.itemCreatedAt),
    });
  }

  return {
    format: "rssapp-backup",
    version: BACKUP_FORMAT_VERSION,
    exportedAt: new Date().toISOString(),
    user: {
      email: user.email,
      settings: user.settings,
      createdAt: iso(user.createdAt),
    },
    folders: folderRows.map((folder) => ({
      name: folder.name,
      createdAt: iso(folder.createdAt),
    })),
    subscriptions: subscriptionRows.map((subscription) => ({
      feed: {
        url: subscription.feedUrl,
        title: subscription.feedTitle,
        siteUrl: subscription.feedSiteUrl,
        description: subscription.feedDescription,
      },
      folderName: subscription.folderName,
      customTitle: subscription.customTitle,
      settings: subscription.settings,
      createdAt: iso(subscription.createdAt),
    })),
    items: [...itemRecords.values()],
    itemStates: stateRows.map((state) => ({
      feedUrl: state.feedUrl,
      guid: state.guid,
      read: state.read,
      starred: state.starred,
      readLater: state.readLater,
      muted: state.muted,
      readAt: iso(state.readAt),
      starredAt: iso(state.starredAt),
      readLaterAt: iso(state.readLaterAt),
      readingProgress: state.readingProgress,
      readingProgressUpdatedAt: iso(state.readingProgressUpdatedAt),
    })),
    audioProgress: audioProgressRows.map((progress) => ({
      feedUrl: progress.feedUrl,
      guid: progress.guid,
      audioUrl: progress.audioUrl,
      progressSeconds: progress.progressSeconds,
      updatedAt: iso(progress.updatedAt),
    })),
    labels: labelRows.map((label) => ({
      name: label.name,
      createdAt: iso(label.createdAt),
    })),
    itemLabels: itemLabelRows.map(({ labelName, feedUrl, guid }) => ({
      labelName,
      feedUrl,
      guid,
    })),
    rules: ruleRows.map((rule) => ({
      feedUrl: rule.feedUrl,
      field: rule.field,
      matchType: rule.matchType,
      pattern: rule.pattern,
      action: rule.action,
      labelName: rule.labelName,
      enabled: rule.enabled,
      createdAt: iso(rule.createdAt),
    })),
    savedPages: savedPageRows.map((page) => ({
      ...page,
      readAt: iso(page.readAt),
      readingProgressUpdatedAt: iso(page.readingProgressUpdatedAt),
      savedAt: iso(page.savedAt),
    })),
    savedPageLabels: savedPageLabelRows,
    highlights: highlightRows.flatMap((highlight) => {
      const target =
        highlight.itemId !== null && highlight.feedUrl && highlight.guid
          ? {
              kind: "item" as const,
              feedUrl: highlight.feedUrl,
              guid: highlight.guid,
            }
          : highlight.savedPageId !== null && highlight.pageUrl
            ? { kind: "savedPage" as const, url: highlight.pageUrl }
            : null;
      if (!target) return [];
      return [
        {
          target,
          quote: highlight.quote,
          startOffset: highlight.startOffset,
          endOffset: highlight.endOffset,
          note: highlight.note,
          createdAt: iso(highlight.createdAt),
          updatedAt: iso(highlight.updatedAt),
        },
      ];
    }),
  };
}

async function pruneOldBackups(
  directory: string,
  userId: number,
  retention: number,
): Promise<void> {
  const prefix = `rssapp-backup-user-${userId}-`;
  const backupFiles = (await readdir(directory))
    .filter((file) => file.startsWith(prefix) && file.endsWith(".json"))
    .sort()
    .reverse();
  await Promise.all(
    backupFiles.slice(retention).map((file) => rm(join(directory, file))),
  );
}

async function writeBackupSnapshot(
  userId: number,
  directory: string,
  retention: number,
): Promise<void> {
  const filename = backupFilename(userId, new Date());
  const target = join(directory, filename);
  const temporary = `${target}.tmp`;
  const backup = await exportUserBackup(userId);
  await writeFile(temporary, `${JSON.stringify(backup, null, 2)}\n`, {
    encoding: "utf8",
    mode: 0o600,
  });
  await rename(temporary, target);
  await pruneOldBackups(directory, userId, retention);
}

let nextScheduledBackupAt = 0;

/** Write one portable snapshot per account when server-side backups are enabled. */
export async function writeScheduledBackups(): Promise<{
  written: number;
  failed: number;
}> {
  const configuration = getBackupConfiguration();
  if (!configuration.enabled || configuration.directory === null) {
    return { written: 0, failed: 0 };
  }

  const now = Date.now();
  if (now < nextScheduledBackupAt) return { written: 0, failed: 0 };

  try {
    await mkdir(configuration.directory, { recursive: true });
  } catch (error) {
    nextScheduledBackupAt = now + RETRY_DELAY_MS;
    console.error("[backup] couldn't create backup directory:", error);
    return { written: 0, failed: 1 };
  }

  const accountRows = await db.select({ id: users.id }).from(users);
  let written = 0;
  let failed = 0;
  for (const account of accountRows) {
    try {
      await writeBackupSnapshot(
        account.id,
        configuration.directory,
        configuration.retention,
      );
      written += 1;
    } catch (error) {
      failed += 1;
      console.error(`[backup] couldn't write account ${account.id}:`, error);
    }
  }
  nextScheduledBackupAt = now + configuration.intervalHours * 3_600_000;
  return { written, failed };
}
