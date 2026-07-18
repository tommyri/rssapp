// The settings page's categories (docs/design-ux.md): one list drives the
// page's rail/pills and the ⌘K palette's targets, so they can't drift. The
// rail is a selector, not a scroll shortcut — one category shows at a time,
// driven by /settings?section=<id>.
export const SETTINGS_SECTIONS = [
  { id: "reading", label: "Reading" },
  { id: "appearance", label: "Appearance" },
  { id: "notifications", label: "Notifications" },
  { id: "data", label: "Subscriptions & data" },
  { id: "account", label: "Account" },
] as const;

export type SettingsSectionId = (typeof SETTINGS_SECTIONS)[number]["id"];

/** The section a ?section= value selects; unknown/absent falls back to the first. */
export function parseSettingsSection(
  value: string | undefined,
): SettingsSectionId {
  return SETTINGS_SECTIONS.some((s) => s.id === value)
    ? (value as SettingsSectionId)
    : SETTINGS_SECTIONS[0].id;
}

/** Href selecting a section — always explicit, so no two targets share a URL. */
export function settingsSectionHref(id: SettingsSectionId): string {
  return `/settings?section=${id}`;
}
