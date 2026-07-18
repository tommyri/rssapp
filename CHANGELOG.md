# Changelog

All notable, user-facing changes are recorded here. GitHub Releases publish the matching
version section verbatim, so this file is the release record rather than an afterthought.

## [Unreleased]

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
