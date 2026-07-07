import {
  CommandPalette,
  type PaletteTarget,
} from "@/components/command-palette";
import { getOptionalUserId } from "@/lib/current-user";
import { listFeeds } from "@/lib/reader";
import {
  SETTINGS_SECTIONS,
  settingsSectionHref,
} from "@/lib/settings-sections";

/**
 * App-wide ⌘K palette, mounted from the root layout so it works on every page
 * (reader, Manage feeds, Rules, Settings) — not just the reader. Session-gated:
 * renders nothing on /login. listFeeds is React.cache'd, so the reader page's
 * sidebar and this palette share one query per request.
 */
export async function GlobalCommandPalette() {
  const userId = await getOptionalUserId();
  if (userId === null) return null;

  const feeds = await listFeeds(userId);

  // Unique folders, in the sidebar's alphabetical order.
  const folders = new Map<number, string>();
  for (const f of feeds) {
    if (f.folderId !== null && f.folderName !== null) {
      folders.set(f.folderId, f.folderName);
    }
  }
  const folderEntries = [...folders.entries()].sort((a, b) =>
    a[1].localeCompare(b[1]),
  );

  // Everything the palette can jump to, in its tie-break display order.
  const targets: PaletteTarget[] = [
    { kind: "view", label: "All articles", href: "/" },
    { kind: "view", label: "Starred", href: "/?view=starred" },
    { kind: "view", label: "Read later", href: "/?view=later" },
    { kind: "page", label: "Manage feeds", href: "/feeds" },
    { kind: "page", label: "Rules", href: "/rules" },
    { kind: "page", label: "Settings", href: "/settings" },
    ...SETTINGS_SECTIONS.map(
      (s): PaletteTarget => ({
        kind: "page",
        label: `Settings · ${s.label}`,
        href: settingsSectionHref(s.id),
      }),
    ),
    ...folderEntries.map(
      ([id, name]): PaletteTarget => ({
        kind: "folder",
        label: name,
        href: `/?folder=${id}`,
      }),
    ),
    ...feeds.map(
      (f): PaletteTarget => ({
        kind: "feed",
        label: f.title ?? f.url,
        href: `/?feed=${f.feedId}`,
        hint: f.folderName ?? undefined,
      }),
    ),
  ];

  return <CommandPalette targets={targets} />;
}
