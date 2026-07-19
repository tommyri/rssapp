import { describe, expect, it } from "vitest";
import {
  BackupRestoreError,
  parseBackupDocument,
  previewBackupRestore,
} from "./backup-restore";

const timestamp = "2026-07-14T10:00:00.000Z";

function validBackup() {
  return {
    format: "rssapp-backup",
    version: 1,
    exportedAt: timestamp,
    user: { email: "reader@example.com", settings: {}, createdAt: timestamp },
    folders: [{ name: "Reading", createdAt: timestamp }],
    subscriptions: [
      {
        feed: {
          url: "https://example.com/feed.xml",
          title: "Example",
          siteUrl: "https://example.com",
          description: null,
        },
        folderName: "Reading",
        customTitle: null,
        settings: {},
        createdAt: timestamp,
      },
    ],
    items: [
      {
        feedUrl: "https://example.com/feed.xml",
        guid: "article-1",
        url: "https://example.com/article-1",
        canonicalUrl: "https://example.com/article-1",
        title: "Article",
        author: null,
        contentHtml: "<p>Article</p>",
        fullContentHtml: null,
        publishedAt: timestamp,
        createdAt: timestamp,
      },
    ],
    itemStates: [
      {
        feedUrl: "https://example.com/feed.xml",
        guid: "article-1",
        read: true,
        starred: false,
        readLater: true,
        muted: false,
        readAt: timestamp,
        starredAt: null,
        readLaterAt: timestamp,
        readingProgress: 0.5,
        readingProgressUpdatedAt: timestamp,
      },
    ],
    labels: [{ name: "Reference", createdAt: timestamp }],
    itemLabels: [
      {
        labelName: "Reference",
        feedUrl: "https://example.com/feed.xml",
        guid: "article-1",
      },
    ],
    rules: [],
    savedPages: [],
    savedPageLabels: [],
    highlights: [
      {
        target: {
          kind: "item",
          feedUrl: "https://example.com/feed.xml",
          guid: "article-1",
        },
        quote: "Article",
        startOffset: 0,
        endOffset: 7,
        note: "Keep this.",
        createdAt: timestamp,
        updatedAt: timestamp,
      },
    ],
  };
}

describe("parseBackupDocument", () => {
  it("accepts an exported backup and provides a useful preview", () => {
    const backup = parseBackupDocument(validBackup());

    expect(previewBackupRestore(backup)).toMatchObject({
      sourceEmail: "reader@example.com",
      folders: 1,
      subscriptions: 1,
      articles: 1,
      labels: 1,
      highlights: 1,
    });
  });

  it("retains the in-app rule-alert preference", () => {
    const raw = validBackup();
    const backup = parseBackupDocument({
      ...raw,
      user: {
        ...raw.user,
        settings: { inAppRuleAlerts: false },
      },
    });

    expect(backup.user.settings.inAppRuleAlerts).toBe(false);
  });

  it("retains an email digest schedule while accepting older backups", () => {
    const raw = validBackup();
    const backup = parseBackupDocument({
      ...raw,
      notificationDigest: {
        enabled: true,
        cadence: "weekly",
        timezone: "Europe/Oslo",
        deliveryHour: 8,
        deliveryMinute: 30,
        weekday: 5,
      },
    });

    expect(backup.notificationDigest).toMatchObject({
      enabled: true,
      cadence: "weekly",
      timezone: "Europe/Oslo",
      weekday: 5,
    });
    expect(parseBackupDocument(raw).notificationDigest).toBeNull();
  });

  it("accepts notify rules from an exported backup", () => {
    const raw = validBackup();
    const backup = parseBackupDocument({
      ...raw,
      rules: [
        {
          feedUrl: null,
          field: "title",
          matchType: "contains",
          pattern: "release",
          action: "notify",
          labelName: null,
          enabled: true,
          createdAt: timestamp,
        },
      ],
    });

    expect(backup.rules[0]?.action).toBe("notify");
  });

  it("rejects references to articles that are not included in the backup", () => {
    const backup = validBackup();
    backup.itemStates[0].guid = "missing-article";

    expect(() => parseBackupDocument(backup)).toThrow(BackupRestoreError);
  });

  it("rejects duplicate label names without case-sensitive ambiguity", () => {
    const backup = validBackup();
    backup.labels.push({ name: "reference", createdAt: timestamp });

    expect(() => parseBackupDocument(backup)).toThrow(
      "The backup contains duplicate label names.",
    );
  });

  it("accepts legacy raw article links before the restore normalizes them", () => {
    const backup = validBackup();
    backup.items[0].url = "/article-1";
    backup.items[0].canonicalUrl = null;

    expect(() => parseBackupDocument(backup)).not.toThrow();
  });

  it("keeps per-source audio positions while accepting older backups without them", () => {
    const raw = validBackup();
    const backup = parseBackupDocument({
      ...raw,
      itemStates: [
        {
          ...raw.itemStates[0],
          audioProgressSeconds: 1_245.5,
          audioProgressUpdatedAt: timestamp,
        },
      ],
      audioProgress: [
        {
          feedUrl: raw.items[0].feedUrl,
          guid: raw.items[0].guid,
          audioUrl: "https://cdn.example.com/episode.m4a",
          progressSeconds: 1_245.5,
          updatedAt: timestamp,
        },
      ],
    });

    expect(backup.itemStates[0]).toMatchObject({
      audioProgressSeconds: 1_245.5,
      audioProgressUpdatedAt: timestamp,
    });
    expect(backup.audioProgress).toEqual([
      {
        feedUrl: raw.items[0].feedUrl,
        guid: raw.items[0].guid,
        audioUrl: "https://cdn.example.com/episode.m4a",
        progressSeconds: 1_245.5,
        updatedAt: timestamp,
      },
    ]);
    expect(parseBackupDocument(raw).itemStates[0]).toMatchObject({
      audioProgressSeconds: null,
      audioProgressUpdatedAt: null,
    });
    expect(parseBackupDocument(raw).audioProgress).toEqual([]);
  });
});
