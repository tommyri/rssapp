# Durable saved copies

**Status:** parked product proposal; no release assignment or delivery promise
**Recorded:** 20 July 2026

## Summary

Currentfold should consider preserving a private, durable copy of content that a reader
explicitly wants to keep. The main outcome is protection from link rot: an article
remains readable if its source is deleted, changed, moved, or temporarily unavailable.

The recommended canonical format is a sanitized, immutable readable-HTML snapshot with
selected assets stored locally. A generated PDF is useful as an optional export, but it
should not be the primary archive: PDFs are less responsive, less suitable for the
existing reading and highlighting experience, and often preserve article structure less
usefully than HTML.

This proposal is deliberately parked until its product scope, storage model, commercial
boundary, and legal implications are refined.

## What the app preserves today

The existing **Save to RSS app** path already provides a partial saved copy:

- `extractSavedPage` fetches the source, extracts readable content, sanitizes it, and
  stores the HTML, title, byline, site name, and excerpt in `saved_pages`.
- Full-content extraction similarly stores sanitized readable HTML for feed items.
- User backup export currently includes saved-page content and the item content needed
  by retained user state.

This usually protects the article text from source deletion. It is not yet a complete
archival promise: image and media URLs can still point to the source, the original page
layout is not retained, there is no visible capture metadata, and there is no explicit
distinction between a readable extraction and a durable copy.

## Product recommendation

Treat this as **Preserve a copy** or **Saved copy**, not as a general-purpose web
crawler. When the reader expresses durable intent, RSS App can capture a private,
immutable version containing:

- sanitized readable HTML;
- title, author, publication date, original URL, and final fetched URL;
- capture time, extraction version, and content hash;
- a manifest of preserved assets and their sizes;
- locally stored article images and original PDF files where permitted;
- an explicit ready, partial, or failed preservation state.

If the original source later becomes unavailable, the saved copy should continue to
open normally. The source status may be shown as secondary information, but losing the
source should not turn a successfully preserved document into an error.

### Format roles

| Format | Recommended role |
| --- | --- |
| Sanitized HTML with preserved images | Canonical durable reading copy |
| Original PDF | Preserve directly when the source itself is a PDF |
| Generated PDF | Optional portable download or print export |
| Self-contained HTML or Markdown | Portable user export |
| WARC or MHTML | Specialist exact-page archive; defer unless a real need appears |

An exact webpage archive brings scripts, styling, dynamic rendering, unsafe content,
and much greater fidelity and storage complexity. It should not be confused with the
calm reader copy the product is designed around.

## Candidate capture policy

Do not permanently archive every article discovered in every feed. That would create
large and unpredictable storage costs and would make the service behave like a broad
web crawler.

Good signals of durable user intent include:

- saving a URL through **Save to RSS app**;
- adding a feed article to **Read later**;
- choosing an explicit **Keep a copy** action;
- optionally, creating a highlight or note.

A later design may offer **Automatically preserve Read later articles**, potentially as
a global or per-source preference. The default, any storage quota, and the relationship
between starring, highlighting, and preservation remain open decisions.

## UX direction

A preserved document could show quiet provenance such as:

> Saved copy · Captured 20 July 2026

Useful actions are:

- **Open original**
- **Download copy**
- **Refresh saved copy**
- **Delete saved copy**

Refreshing must not silently replace the document underneath existing highlights and
notes. It should either create a new snapshot version or clearly explain the effect on
annotations before replacement.

The already-recorded read-later live-refresh fix is a prerequisite: the open document
must transition automatically from **Fetching a readable copy…** to ready, partial, or
failed without a manual page reload.

## Architecture direction

Durable copies should be user-owned records rather than another promise attached only
to the shared `items` row. Feed items and their extracted content can be shared by
multiple subscribers, while retention, deletion, storage accounting, and access to a
personal archive belong to one user.

A likely model is a per-user archived-document record referencing either a feed item or
a saved page, with:

- immutable snapshot HTML and capture metadata;
- preservation status and a safe diagnostic;
- a content-addressed asset manifest;
- total stored bytes for quota and support visibility;
- optional snapshot versions when the reader deliberately refreshes a copy.

Binary assets should live in an S3-compatible object store or a protected self-hosted
volume rather than as large database values. Content hashing can deduplicate identical
assets without weakening per-user access controls. The self-hosted deployment needs a
clear storage adapter and backup story; a hosted deployment could later use Cloudflare
R2 or another S3-compatible provider.

Account JSON backup and archive export should remain distinct. Metadata and reading
state need a compact, portable backup; a potentially large archive can be exported as a
separate ZIP or object bundle.

## Safety and operating constraints

A production design needs:

- the existing SSRF and redirect protections on every asset request;
- strict content-type allowlists and decompression limits;
- per-document byte, asset-count, and processing-time limits;
- per-user storage quotas, rate limits, and abuse visibility;
- no stored or executed scripts, unsafe SVG, embedded pages, or arbitrary binaries;
- deterministic sanitization before display;
- deletion that covers metadata, snapshots, assets, backups, and account removal;
- retry behavior that distinguishes a partial archive from a failed one.

Video, audio, fonts, JavaScript bundles, and full page styling should not be mirrored by
default. Original PDFs and article images are the most defensible first asset classes.

## Product, business, and legal considerations

Durable archival has genuine paid-product value because it provides continuing utility
and consumes measurable storage. Basic extracted text does not necessarily need to be
paywalled; preserved assets, larger quotas, or long-term archival could later form part
of the hosted plan.

Copies should remain private by default. The product should not bypass authentication,
paywalls, DRM, or publisher access controls, and it should not automatically publish a
private reading list to a third-party public archive. Copyright, publisher terms,
takedown handling, and retention should receive legal review before this is marketed as
a hosted commercial feature.

## Evidence from adjacent products

- [Readwise Reader](https://docs.readwise.io/reader/docs/faqs/parsing) stores the parsed
  content as captured and avoids silently reparsing it, preserving highlight and note
  context if the source changes or disappears.
- [Raindrop.io](https://help.raindrop.io/broken-links) provides permanent web copies so
  paid users can still access bookmarks whose originals disappear.
- [Readwise Reader export](https://docs.readwise.io/reader/docs/faqs/sharing) treats PDF
  as a download or print format rather than the canonical form for ordinary web
  articles.

## Questions to answer before scheduling

1. Which actions automatically create a durable copy?
2. Should auto-preservation be configurable globally, per source, or both?
3. Which assets are preserved in the first complete release?
4. What storage limit is reasonable for hosted and self-hosted users?
5. Is archival included in the hosted plan or separately quota-limited?
6. How are refreshed versions and existing annotations reconciled?
7. Which portable download formats must be supported?
8. What retention, deletion, and takedown policies are required?
