import { describe, expect, it } from "vitest";
import {
  DEFAULT_TYPOGRAPHY,
  parseTypography,
  type ReaderTypography,
  typographyVars,
} from "./reader-typography";

describe("typographyVars", () => {
  it("maps the default choice to the previous fixed styling", () => {
    expect(typographyVars(DEFAULT_TYPOGRAPHY)).toEqual({
      "--reader-font-size": "1.0625rem",
      "--reader-font-family": "var(--font-serif), Georgia, serif",
      "--reader-measure": "65ch",
    });
  });

  it("maps each axis independently", () => {
    const vars = typographyVars({
      size: "large",
      family: "sans",
      width: "narrow",
    });
    expect(vars["--reader-font-size"]).toBe("1.25rem");
    expect(vars["--reader-font-family"]).toBe(
      "var(--font-sans), system-ui, sans-serif",
    );
    expect(vars["--reader-measure"]).toBe("52ch");
  });
});

describe("parseTypography", () => {
  it("returns defaults for null (never set)", () => {
    expect(parseTypography(null)).toEqual(DEFAULT_TYPOGRAPHY);
  });

  it("round-trips a stored value", () => {
    const value: ReaderTypography = {
      size: "large",
      family: "sans",
      width: "wide",
    };
    expect(parseTypography(JSON.stringify(value))).toEqual(value);
  });

  it("falls back per-field on partial data, keeping valid fields", () => {
    expect(parseTypography(JSON.stringify({ size: "large" }))).toEqual({
      size: "large",
      family: "serif",
      width: "normal",
    });
  });

  it("ignores unknown values per field", () => {
    expect(
      parseTypography(JSON.stringify({ size: "huge", family: "comic" })),
    ).toEqual(DEFAULT_TYPOGRAPHY);
  });

  it("survives malformed JSON", () => {
    expect(parseTypography("{not json")).toEqual(DEFAULT_TYPOGRAPHY);
  });
});
