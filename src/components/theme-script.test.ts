import { describe, expect, it } from "vitest";
import { noFlashScriptType } from "./theme-script";

describe("noFlashScriptType", () => {
  it("executes on the server but stays inert during client rendering", () => {
    expect(noFlashScriptType(false)).toBe("text/javascript");
    expect(noFlashScriptType(true)).toBe("text/plain");
  });
});
