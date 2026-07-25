/**
 * App-wide default: auto-mark articles read after this many days when neither
 * the per-feed override nor the user's own setting specifies a value.
 */
export const DEFAULT_AUTO_READ_DAYS = 30;

/**
 * The largest auto-read window a reader may configure. Settings validation and
 * the unread-count horizon below both derive from this, so raising one without
 * the other is not possible.
 */
export const MAX_AUTO_READ_DAYS = 365;

/**
 * How far back a sidebar unread count looks.
 *
 * Auto-read cannot be switched off — every subscription resolves to a window
 * between 1 and MAX_AUTO_READ_DAYS — so nothing older than that window can still
 * be unread once the scheduler has swept. Counting the whole archive instead
 * would make every page load scan every article a reader has ever subscribed to,
 * which grows without bound; this keeps it a fixed range.
 *
 * The margin covers a deployment whose scheduler has been down, and an article
 * someone marks unread by hand before the next sweep re-reads it.
 */
export const UNREAD_COUNT_HORIZON_DAYS = MAX_AUTO_READ_DAYS + 30;
