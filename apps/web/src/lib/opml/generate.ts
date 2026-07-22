export interface ExportEntry {
  xmlUrl: string;
  title: string | null;
  htmlUrl: string | null;
  folderName: string | null;
}

function escapeAttr(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function feedOutline(entry: ExportEntry, indent: string): string {
  const title = escapeAttr(entry.title ?? entry.xmlUrl);
  const attrs = [
    'type="rss"',
    `text="${title}"`,
    `title="${title}"`,
    `xmlUrl="${escapeAttr(entry.xmlUrl)}"`,
  ];
  if (entry.htmlUrl) attrs.push(`htmlUrl="${escapeAttr(entry.htmlUrl)}"`);
  return `${indent}<outline ${attrs.join(" ")}/>`;
}

/** Build an OPML 2.0 document, grouping feeds under their folders. */
export function generateOpml(title: string, entries: ExportEntry[]): string {
  const rootFeeds: ExportEntry[] = [];
  const byFolder = new Map<string, ExportEntry[]>();
  for (const entry of entries) {
    if (entry.folderName) {
      const list = byFolder.get(entry.folderName) ?? [];
      list.push(entry);
      byFolder.set(entry.folderName, list);
    } else {
      rootFeeds.push(entry);
    }
  }

  const lines: string[] = [];
  for (const [folder, feeds] of byFolder) {
    const label = escapeAttr(folder);
    lines.push(`    <outline text="${label}" title="${label}">`);
    for (const feed of feeds) lines.push(feedOutline(feed, "      "));
    lines.push("    </outline>");
  }
  for (const feed of rootFeeds) lines.push(feedOutline(feed, "    "));

  return `<?xml version="1.0" encoding="UTF-8"?>
<opml version="2.0">
  <head>
    <title>${escapeAttr(title)}</title>
  </head>
  <body>
${lines.join("\n")}
  </body>
</opml>
`;
}
