// The settings page's categories (docs/design-ux.md): one list drives the
// page's rail/pills/sections and the ⌘K palette's jump targets, so they can't
// drift. Sections are designed to lift into /settings/<id> sub-pages if the
// page ever doubles again.
export const SETTINGS_SECTIONS = [
  { id: "reading", label: "Reading" },
  { id: "appearance", label: "Appearance" },
  { id: "data", label: "Subscriptions & data" },
  { id: "account", label: "Account" },
] as const;
