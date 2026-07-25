# Changelog

All notable, user-facing changes are recorded here. GitHub Releases publish the matching
version section verbatim, so this file is the release record rather than an afterthought.

## [Unreleased]

### Fixed

- A saved page whose publisher fails temporarily is now retried automatically with
  backoff instead of failing for good on the first stumble. A single timeout or “service
  unavailable” previously left the page permanently unreadable until someone noticed and
  pressed **Retry**; the page now keeps showing that a copy is on its way, and a
  publisher's own Retry-After is respected. Failures that cannot succeed on a retry —
  a page with no readable content, an address that does not resolve — still fail
  immediately rather than waiting out a pointless backoff.
- Saving a link no longer fetches it twice. The save and the scheduler's backstop sweep
  claim a page before extracting, so they can't both call the same publisher at once —
  most likely previously on exactly the slow publishers least able to absorb it.
- Outbound requests now identify the deployed release instead of a frozen `0.1`, and no
  longer point publishers at a repository address that does not exist.

### Security

- The private-address check is now enforced on the connection itself, not only on a
  separate lookup beforehand. A hostile feed or article host could previously answer the
  safety check with a public address and the connection with a private one, defeating the
  check; the address the socket connects to is now the address that was verified.

## [2026.7.4] - 2026-07-25

### Added

- A visible **Mark unread** / **Mark read** control in the native article toolbar,
  complementing the existing list swipe and making read-state reversal discoverable
  while reading.

### Changed

- An open web reader now picks up cross-client article and sidebar changes after
  returning to the app and at a restrained interval while visible. Fresh snapshots
  reconcile into the current list without discarding loaded pages, closing the article
  being read, or rewinding reading and audio progress.
- New rules now default to **Star**, with **Add to notifications** immediately after it
  in the action list.
- The sidebar source list now uses all available height above its fixed action area,
  showing as many sources as fit and scrolling only when the list is longer. Opening a
  source keeps its active row in view.

### Fixed

- Saved pages opened through the bookmark now replace **Fetching a readable copy…**
  with the extracted article or a clear failure automatically. Extraction is kept alive
  through the redirect, and status checks run only while that pending page is open and
  visible. When a copy takes longer than the reader waits for it, the page now says it is
  still being fetched and asks for a reload instead of waiting silently.
- Retrying a saved page that could not be fetched no longer flashes the previous failure
  back while the new attempt is still running, and a readable copy that has been stored
  is never replaced by a slower attempt that failed.

### Security

- Feed fetching now uses the same guarded fetcher as automatic article extraction:
  HTTP(S)-only URLs without credentials, private, loopback, link-local and
  cloud-metadata addresses rejected by DNS check, every redirect hop revalidated, and
  size-bounded responses. Previously only article extraction was checked, so adding a
  feed could make the server fetch an address on its own network and report what it
  found. Feed and article requests are now held to one policy with no way to relax it.

## [2026.7.3] - 2026-07-24

### Added

- Daily or weekly email digests for unread rule notifications, with timezone-aware
  scheduling, test delivery, retry-safe sending, and signed article and unsubscribe
  links.
- Quiet app version and source-revision metadata in Settings and the health endpoint,
  backed by the same identity stored in published container images.
- A shared Currentfold product workspace for the web service, generated brand assets,
  API contract, and native clients, with reproducible iOS project generation and
  dedicated CI verification.
- A stable first-party JSON API for service discovery, account identity, subscriptions,
  cursor-paginated article streams, and batched read-state changes.
- An internal native SwiftUI iOS foundation with email/password registration, sign-in,
  verification and recovery; Library, Sources, and Settings navigation; paginated
  article reading; and Universal Link handoff.
- Native Apple and Google sign-in foundations using their system authorization surfaces
  and server-side identity verification. Providers remain hidden when the deployment is
  not completely configured; Sign in with Apple remains disabled pending Apple Developer
  Program setup and production-readiness work.

### Security

- Native clients use short-lived access tokens and rotating, Keychain-protected refresh
  credentials backed by revocable device sessions. Provider sign-in verifies signed
  proofs and one-time challenges on the server instead of trusting client-supplied
  identity details.

## [2026.7.2] - 2026-07-19

### Fixed

- Removed passive mark-read-on-scroll behavior, its reader control, stored preference,
  intersection observer, and client batch endpoint. Scrolling and pagination no longer
  mutate unread articles; opening an article and explicit bulk actions remain the normal
  ways to mark it read.
- Prevented the collapsed-row swipe gesture from marking an unread article read. The
  right swipe now exists only on already-read rows as an intentional **Mark unread**
  reversal.

## [2026.7.1] - 2026-07-19

### Added

- A durable rule-notification inbox and optional browser push delivery for matching
  articles.
- Automatic full-article extraction for every linked feed item, backed by a restart-safe
  queue with bounded concurrency, retries, canonical-result reuse, and the original feed
  body as a permanent fallback.
- A **Continue with read history** transition at the end of an individual feed's unread
  queue, with separately paginated older read articles.
- Reproducible GitHub Container Registry images, a staging deployment path, and
  calendar-versioned GitHub Releases.

### Changed

- Removed the per-feed full-content setting and manual extraction shortcut now that full
  article text is prepared automatically.

### Security

- Hardened automatic article fetching with public HTTP(S)-only URL and redirect checks,
  DNS validation, timeouts, response-size limits, and publisher backoff handling.

## [0.1.0] - Historical development baseline

### Added

- The initial self-hosted RSS reader, its reading workflow, account lifecycle, PWA,
  backups, and Reader-compatible sync API.
