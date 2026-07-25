import { describe, expect, it } from "vitest";
import { SAVE_LINK_LIMITED_MESSAGE, saveLinkNotice } from "./save-link-notice";

const quiet = { ok: true, message: "" };

describe("Read later save notices", () => {
  it("says nothing before anything has happened", () => {
    expect(saveLinkNotice(quiet, false)).toEqual({ text: "", failure: false });
  });

  it("reports a bookmark save that ran out of budget as a failure", () => {
    expect(saveLinkNotice(quiet, true)).toEqual({
      text: SAVE_LINK_LIMITED_MESSAGE,
      failure: true,
    });
  });

  it("prefers what the reader just did over a redirect marker", () => {
    // The marker outlives its own truth: it stays in the URL after a later save
    // succeeds, so a stale "too many" must never reappear over a fresh result.
    expect(
      saveLinkNotice({ ok: true, message: "Saved to Read later." }, true),
    ).toEqual({ text: "Saved to Read later.", failure: false });
  });

  it("keeps the action's own refusal styled as a failure", () => {
    expect(
      saveLinkNotice(
        { ok: false, message: "Enter a valid web address." },
        false,
      ),
    ).toEqual({ text: "Enter a valid web address.", failure: true });
  });
});
