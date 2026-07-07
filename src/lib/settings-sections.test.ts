import { describe, expect, it } from "vitest";
import {
  parseSettingsSection,
  SETTINGS_SECTIONS,
  settingsSectionHref,
} from "./settings-sections";

describe("parseSettingsSection", () => {
  it("accepts every known section id", () => {
    for (const s of SETTINGS_SECTIONS) {
      expect(parseSettingsSection(s.id)).toBe(s.id);
    }
  });

  it("falls back to the first section for unknown or absent values", () => {
    expect(parseSettingsSection("bogus")).toBe("reading");
    expect(parseSettingsSection(undefined)).toBe("reading");
    expect(parseSettingsSection("")).toBe("reading");
  });
});

describe("settingsSectionHref", () => {
  it("is always explicit, so no two palette targets share a URL", () => {
    expect(settingsSectionHref("reading")).toBe("/settings?section=reading");
    expect(settingsSectionHref("account")).toBe("/settings?section=account");
  });
});
