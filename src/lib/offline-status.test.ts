import { describe, expect, it } from "vitest";
import { offlineStatusClassName } from "./offline-status";

describe("offlineStatusClassName", () => {
  it("keeps successful offline downloads out of the error color", () => {
    expect(offlineStatusClassName("success")).toBe("text-muted-foreground");
    expect(offlineStatusClassName("error")).toBe("text-destructive");
  });
});
