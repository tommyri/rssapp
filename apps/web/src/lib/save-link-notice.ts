// Client-safe half of link saving: the strings and the one display rule, with
// no database or crypto behind them. The budget itself lives in
// save-link-limit.ts, which the reader must never pull into the browser.

export const SAVE_LINK_LIMITED_MESSAGE =
  "That's a lot of links at once — try again in a few minutes.";

/** The Read later view shows the notice when the bookmark redirect adds this. */
export const SAVE_LINK_LIMITED_PARAM = "saved";
export const SAVE_LINK_LIMITED_VALUE = "limited";

export interface SaveLinkNotice {
  text: string;
  failure: boolean;
}

/**
 * The Read later view has one message slot and two things that write to it: the
 * paste-a-URL action, which reports directly, and the bookmark endpoint, which
 * can only leave a marker in the URL on its way past. What the reader just did
 * wins — a fresh result is always more current than a redirect marker.
 */
export function saveLinkNotice(
  action: { ok: boolean; message: string },
  bookmarkLimited: boolean,
): SaveLinkNotice {
  if (action.message) return { text: action.message, failure: !action.ok };
  if (bookmarkLimited) {
    return { text: SAVE_LINK_LIMITED_MESSAGE, failure: true };
  }
  return { text: "", failure: false };
}
