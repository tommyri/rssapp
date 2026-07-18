# Full article text by default

**Status:** shipped in `2026.7.1`. Production deployments should observe queue depth and
publisher failures after upgrading. This replaces the former opt-in, per-feed `Always
load full content` behaviour.

## Product decision

Every newly ingested feed item with a usable public article URL should be queued for
readable-page extraction automatically. A reader never needs to discover or enable a
per-feed setting just to receive the article they subscribed to read.

The product promise is **best available article text**, not that every publisher can be
successfully extracted. Feed-provided, sanitized content remains immediately readable
while the full page is being prepared and permanently remains the fallback when a source
is blocked, paywalled, non-HTML, removed, or not readable by Readability.

## Reader experience

1. A new item appears as soon as its feed is ingested; feed refresh is never held hostage
   by a slow article site.
2. Its expanded view renders the feed body immediately. While a richer copy is queued or
   running, it shows a quiet `Preparing full text…` state rather than a manual action.
3. When extraction succeeds, the reader renders the sanitized full article, search uses
   that richer text, and reading time updates naturally.
4. When extraction reaches a terminal failure, the feed body stays visible with an
   unobtrusive `Full text was unavailable` explanation and **Open original**. A reader may
   retry a transient failure manually.
5. There is no `Load full content` control, no `Always load full content` checkbox, and no
   `full content` feed-settings chip. The `c` shortcut is removed from the keyboard help
   rather than reassigned to an unrelated action.

This applies to feed articles, not arbitrary site crawling. Saved links already use a
similar readable-copy lifecycle and keep their explicit retry state.

## Required engineering model

### Durable extraction state on items

Add persistent extraction metadata to `items`, alongside the existing
`full_content_html` cache:

| Field | Purpose |
|---|---|
| `full_content_status` | `not_needed`, `pending`, `processing`, `ready`, `retrying`, or `unavailable` |
| `full_content_attempts` | Bounded retry accounting |
| `full_content_next_at` | When a retry may next run |
| `full_content_locked_at` | Recover work abandoned by a process restart |
| `full_content_last_error` | Operator-facing diagnosis; never replace the feed body with it |
| `full_content_extracted_at` | Success timestamp for monitoring and future refresh policy |

The state is global to an `items` row because feed articles and extracted content are
already shared across subscribers. A new item without an HTTP(S) URL is immediately
`not_needed`; a valid item is `pending` in the same transaction that inserts it.

When several feeds contain the same canonical article URL, a later queued duplicate
reuses an already extracted canonical copy instead of making another publisher request.

### Queue worker, not inline feed work

Replace `autoExtractForFeed` with a durable queue drain run by the existing long-lived
scheduler. The feed-ingestion transaction only inserts items and marks eligible work
pending. The same scheduler pass then drains a small batch, so ordinary new posts begin
processing promptly without delaying feed polling or a manual refresh response.

Workers claim rows with an atomic database operation (`FOR UPDATE SKIP LOCKED` or the
equivalent), recover stale `processing` locks after a bounded lease, and can therefore be
scaled beyond one process later without duplicate work. This is a queue boundary, not a
fire-and-forget Promise tied to a Next.js request.

Initial worker policy:

- bounded global concurrency and one in-flight article request per publisher host;
- newest unread, Read later, and starred articles first, then the remaining newest-first
  backlog;
- short retry backoff for network errors and 5xx responses; honour `Retry-After` for 429;
- terminal handling for absent/non-HTML/unreadable pages and a bounded retry limit for
  transient errors; and
- concise scheduler counters for queued, extracted, retried, unavailable, and failed
  work, without logging article bodies or URLs unnecessarily.

### Safe and polite outbound fetching

Automatic extraction dramatically expands the app's outbound-request surface. Before it
is enabled globally, extraction fetches must validate the initial URL **and every redirect**:

- accept only `http` and `https`, reject credentials and local/private/link-local/loopback
  destinations, and resolve DNS defensively to prevent server-side request forgery;
- retain an explicit timeout and a response-size ceiling before parsing;
- use the reader's identifiable User-Agent and honour publisher backoff signals;
- never authenticate to, bypass a paywall on, or execute scripts from an article site; and
- preserve sanitization before any extracted HTML is stored or rendered.

The full-text queue enforces host-level throttling, while the guarded article fetch adapter
is shared with saved links. Feed discovery and normal feed polling remain separately
bounded by their own refresh policies.

## Existing library backfill

At release, enqueue all retained current items with a usable article URL that do not
already have full content, subject to the same queue and host limits. This is a durable,
restart-safe migration rather than a deploy-time loop. The priority order above gives the
reader's active material the first chance to improve, while the archive completes safely
over time.

Legacy per-feed `settings.fullContent` values are accepted from older backups but discarded
on restore and on the next feed-settings save. No account or subscription migration is
required for readers to receive the new default.

## Scope and non-goals

- Keep the original feed content and **Open original** link for every article.
- Do not retry an already good full-text cache merely because a source page later changes.
- Do not download podcast media, third-party embeds, images, or paywalled/authenticated
  content as part of this work.
- Do not make a full-text failure a feed failure or show it as one in Feed health.
- Do not build a general web crawler; content extraction only follows links from stored
  feed items and saved pages.

## Delivery and verification

1. Add the migration, state model, queue claim/recovery logic, retry classification, and
   safe redirect-aware fetch adapter with unit and integration coverage.
2. Change ingest to enqueue all eligible new items; remove the old per-feed extraction
   decision and inline `autoExtractForFeed` work.
3. Run the bounded queue from the scheduler, then add the existing-library backfill as
   idempotent pending work.
4. Replace the article and feed-settings UI, keyboard help, backup/restore handling, and
   product documentation.
5. Deploy to production and observe queue depth, extraction success/error classes,
   scheduler duration, feed-refresh latency, and per-host behaviour before marking the
   release shipped.

Acceptance requires a new feed item to be readable immediately, become full text without
reader interaction when extraction succeeds, retain its original body when it fails, and
never cause a publisher failure to delay or fail the feed refresh itself.
