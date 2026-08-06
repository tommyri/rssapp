# Currentfold first-party API

The versioned JSON API at `/api/v1` is the product boundary for Currentfold-owned
clients. It is separate from `/api/greader`: the Google Reader adapter exists for
third-party compatibility, while this API can grow with Currentfold features without
inventing legacy tags for them.

## Initial stable slice

| Method | Path | Purpose |
| --- | --- | --- |
| `GET` | `/api/v1` | Discover the product/API version, capabilities, and contract URL. |
| `GET` | `/api/v1/openapi.json` | Download the OpenAPI 3.1 contract. |
| `POST` | `/api/v1/auth/session` | Authenticate an account and create a native device session. |
| `DELETE` | `/api/v1/auth/session` | Revoke the current native device session. |
| `POST` | `/api/v1/auth/session/refresh` | Rotate a native refresh token and access token. |
| `GET` | `/api/v1/auth/providers` | Discover Apple/Google availability for this installation. |
| `POST` | `/api/v1/auth/providers/apple/challenge` | Create a rate-limited, one-time Apple nonce. |
| `POST` | `/api/v1/auth/provider-session` | Verify native Apple/Google proof and create a device session. |
| `POST` | `/api/v1/auth/registration` | Register and send an address-verification link. |
| `POST`, `PATCH` | `/api/v1/auth/verification` | Resend or consume an address-verification token. |
| `POST`, `PATCH` | `/api/v1/auth/recovery` | Request or complete a password reset. |
| `GET` | `/api/v1/me` | Resolve the authenticated account. |
| `GET` | `/api/v1/subscriptions` | List followed sources, folders, unread counts, and paused state. |
| `POST` | `/api/v1/subscriptions` | Follow a source from any site or feed URL, or discover the candidates to choose between. |
| `GET` | `/api/v1/articles` | Read a newest-first, keyset-paginated article stream. |
| `PATCH` | `/api/v1/articles/read-state` | Idempotently mark up to 100 owned articles read or unread. |
| `PATCH` | `/api/v1/articles/starred-state` | Idempotently star or unstar up to 100 owned articles. |
| `PATCH` | `/api/v1/articles/read-later-state` | Idempotently add up to 100 owned articles to Read later, or remove them. |
| `POST` | `/api/v1/articles/mark-all-read` | Mark a whole scope read, optionally only its older part. |
| `PATCH` | `/api/v1/articles/reading-progress` | Store where reading stopped in up to 100 owned articles. |
| `GET` | `/api/v1/saved-pages` | Read a newest-saved-first, keyset-paginated saved-page stream. |
| `POST` | `/api/v1/saved-pages` | Save any URL to Read later; extraction runs in the background. |
| `DELETE` | `/api/v1/saved-pages/{id}` | Remove a saved page from Read later. |
| `POST` | `/api/v1/saved-pages/{id}/retry` | Fetch a failed saved page's readable copy again. |
| `PATCH` | `/api/v1/saved-pages/read-state` | Idempotently mark up to 100 owned saved pages read or unread. |
| `PATCH` | `/api/v1/saved-pages/reading-progress` | Store where reading stopped in up to 100 owned saved pages. |

Resource IDs are decimal strings on the wire. They are opaque client identifiers, not a
promise that storage will always use an integer. Cursors are also opaque: clients store
and return `nextCursor` unchanged rather than constructing or interpreting it.

The source contract and stable response fixtures live in `packages/api-contract`. Run
`npm run contract:check` after changing it. The route implementation lives in
`apps/web/src/app/api/v1`, with parsing, authentication, response, and reader-query
boundaries in `apps/web/src/lib/api-v1*`.

## Article lists

`GET /api/v1/articles` returns one keyset page of the account's non-muted articles,
ordered by publication date falling back to ingest date. Four optional parameters narrow
it, and they compose with each other and with `cursor`:

- `filter` — `all` (the default and the endpoint's original behaviour), `unread`,
  `starred`, or `readLater`.
- `subscriptionId` and `folderId` — one source, or every source filed in one folder.

`unreadOnly=true` predates `filter` and still means `filter=unread`. Sending both is
rejected when they contradict each other rather than resolved in favour of one. An
unknown `subscriptionId` or `folderId` returns an empty page: a stale sidebar should not
turn a read into an error.

Two fields exist so a list row can be drawn without parsing article HTML on the device,
and so a native row says what the web row says — both are computed by the same functions
the web list uses (`articleSnippet`, `readingTimeMinutes`):

- `preview` — a plain-text snippet with the boilerplate feeds repeat in their bodies
  (a publication date the row already shows, the title again) removed, cut on a word
  boundary, never mid-word. `null` when the body has nothing worth previewing.
- `readingTime` — whole minutes at 225 words per minute, rounded up. `null` for a stub
  entry under 30 words, where an estimate would be noise rather than information.

List responses still carry `content.html`. Slimming the list to metadata and letting the
detail view fetch the body would break existing clients, so it would need its own
decision and a new field rather than a quiet removal.

**Unread is the absence of a read state**, not a stored flag, so a `filter=unread` page
reflects reads from every device the moment they happen. A client that wants the web's
session-stable list — articles read during this visit staying in place until the view is
reopened — keeps that behaviour in its own loaded page rather than asking the server for
it.

## Triage mutations

The three batch endpoints take up to 100 `articleIds` and one boolean, and each sets
exactly one state: `read`, `starred`, or `readLater`. Sending the wrong flag for a path is
a `400`, not a silent no-op. Each validates the whole batch before writing, so an article
outside the account fails the request with `404 article_not_found` rather than
half-applying it. Read-later state is independent of read state, matching the web.

`POST /api/v1/articles/mark-all-read` is the overload valve. Its `scope` is required —
`all`, `subscription` with a `subscriptionId`, or `folder` with a `folderId` — since an
omitted scope would let an empty body sweep an entire account. An optional `olderThan`
instant marks only the articles sorted strictly before it, which is how a client offers
"mark everything below this one read" or an older-than-a-day/week variant. The response
echoes the scope and reports `markedCount`; a scope belonging to another account is
`404 scope_not_found` rather than a successful sweep of nothing.

## Reading progress

`PATCH /api/v1/articles/reading-progress` and `PATCH /api/v1/saved-pages/reading-progress`
persist the resume position already exposed as `state.readingProgress`. Both take
`positions`, a batch of up to 100 `{ id, readingProgress }` entries, because a client that
buffered positions while backgrounded should be able to flush them as one validated
request; a single entry is the ordinary case. Unlike the boolean batches, a repeated id is
rejected rather than deduplicated — two positions for one article contradict each other,
and picking the later one in the array would be a coin toss dressed as a rule.

The response reports what was **stored**, which is not always what was sent. A fraction
near either end goes in as `null`: resuming at the very top is the same as not resuming,
and resuming at the very end sends a reader back to a piece they finished. That threshold
is the web reader's own (`storedReadingProgress`), so a position written from a phone and
one written from a browser mean the same thing. The last write wins; progress is a
convenience, not a ledger, and a monotonic rule would make re-reading impossible.

## Saved pages and the unified Read later queue

Read later is deliberately one queue — flagged feed articles and saved web pages, newest
first (docs/design-ux.md) — but it is **two streams on the wire**: `GET /api/v1/articles?filter=readLater`
and `GET /api/v1/saved-pages`. A client fetches both and merges them by date, comparing a
saved page's `savedAt` against an article's `publishedAt` (falling back to `createdAt`).
That is the same merge the web performs in memory, and it keeps each stream homogeneous,
independently cursor-paginated, and stable: the two halves genuinely sort by different
columns, so a single union endpoint would need an invented ordering key and a cursor that
could not be a keyset over either table. Neither call is per-row — a saved-page row
arrives with its content, preview and reading time — so merging costs two requests per
page, not N.

`POST /api/v1/saved-pages` takes a `url` and answers immediately, because the caller is
usually a share sheet that must dismiss now. The saved page therefore comes back with
`extraction.status` of `pending` in the ordinary case, and the readable copy arrives
behind it. Saving is idempotent per account and canonicalized URL: a URL already in the
queue returns `200` with `alreadySaved: true` and the existing page, rather than `201`,
and nothing is re-fetched. Saves spend the same per-account budget as the web's bookmark
and paste field, since all three make the server fetch a URL a reader chose; an exhausted
budget is `429 save_limit_reached` with `Retry-After`.

Extraction status has three values and the mapping is not quite the stored one:

- `pending` — a copy is still being fetched. A retryable failure waiting out its backoff
  is also `pending`, and its stored error is deliberately withheld: reporting a problem
  the poller is about to undo is noise, not information.
- `ready` — `content.html` is a sanitized copy, safe to render exactly like feed content.
- `failed` — terminal, with `extraction.error` explaining why. `POST /api/v1/saved-pages/{id}/retry`
  is the way out: it clears the attempt budget and any backoff first, so a page that gave
  up hours ago genuinely tries again, and unlike saving it waits and returns the outcome.

A saved page's row carries `preview` and `readingTime` from the same functions the article
list uses, a `title` that falls back to the URL, and a `siteName` that falls back to the
URL's host — so a native row can be drawn before extraction finishes and says what the web
row says. Its `state` is `read` and `readingProgress` only: a saved page is in Read later
by existing, so there is no flag to clear and no star to set, and `DELETE /api/v1/saved-pages/{id}`
— **Remove** — is its only exit.

## Adding a source

`POST /api/v1/subscriptions` takes one `url`: a feed address, a site, or a YouTube
channel, handle, or playlist. It runs the web's own autodiscovery — `<link rel="alternate">`,
then the common paths (`/feed`, `/rss.xml`, `/atom.xml`, `/index.xml`, JSON Feed included)
— through the same guarded fetch that polls feeds, so the address policy and size ceiling
apply to a paste the way they apply to a poll.

Four outcomes, and two of them are successful:

- `201` with `data.status` of `subscribed` — the subscription, in the shape
  `GET /api/v1/subscriptions` returns, so a client decodes one type either way.
- `200` with `data.status` of `candidates` — the page advertised more than one feed and
  **nothing was subscribed**. Each candidate carries the `title` attribute the page gave
  it, which is how "Posts" is told from "Comments"; a null title means show the URL.
  Answering means POSTing the chosen candidate URL back to the same operation. Labelling
  the list costs no extra requests, so presenting a picker is free.
- `409 already_subscribed` — the resolved feed is one the account already follows. Checked
  after resolution, since a site URL and its feed URL are different strings.
- `422 feed_not_found` — nothing was found, or fetching failed; the message says which.

The web silently takes the first feed it finds. The picker is the one behaviour this
endpoint adds, because a native client can ask and a form submission could not.

## Authentication

Currentfold-owned native apps use a first-party device session:

- sign-in returns a 15-minute opaque access token and a rotating refresh token;
- refresh tokens expire after 30 days without use and cannot outlive the device
  session's one-year absolute bound;
- only SHA-256 token hashes are stored in Postgres;
- every rotation consumes the prior access/refresh generation in one transaction;
- a password reset, account suspension, account deletion, web revocation, or native
  sign-out invalidates authorization server-side;
- the iOS client stores the credential pair in this-device-only Keychain storage and
  serializes refreshes so concurrent API calls cannot race a one-time token;
- active Currentfold app sessions appear under **Settings → Account → Signed-in
  sessions**, alongside browser sessions, and can be revoked there.

Apple and Google use the platform/system authorization surfaces. The client sends the
resulting identity token to `/api/v1/auth/provider-session`; the server verifies its
signature and claims and then issues the normal Currentfold device session. Apple's
flow additionally binds the identity token to a short-lived one-time server nonce.
Provider tokens are never accepted as reader API bearer credentials. Provider subjects,
not matching email addresses, select linked accounts; an address collision requires an
explicit account link rather than an automatic merge.

Manually issued compatibility credentials are still useful for third-party clients and
command-line diagnostics:

1. Open **Settings → Account → Native reader apps**.
2. Create a credential and copy it when shown.
3. Send it in the bearer header:

```bash
curl \
  -H "Authorization: Bearer $CURRENTFOLD_API_TOKEN" \
  https://your-currentfold.example/api/v1/me
```

The Currentfold iOS app does not use or display this compatibility credential. Native
email verification and reset endpoints can consume the same one-time account tokens as
the web fallback. HTTPS links open the app when Universal Links are configured through
`APPLE_TEAM_ID`; otherwise the existing web pages remain usable.

## Contract rules

- New response fields may be added within v1; existing fields do not silently change
  meaning or type.
- Breaking resource changes require a new API version.
- Every authenticated query is scoped through the account's subscriptions; global feed
  storage is never exposed directly.
- Mutations validate the complete batch before writing, so a foreign or unavailable
  article cannot produce a partial update.
- API responses containing account data use `Cache-Control: no-store` and return JSON
  errors instead of redirects to the web sign-in page.
- Database and Drizzle schemas are implementation details and do not generate the public
  contract.

## Next slices

Add complete user workflows rather than isolated fields: article detail and
highlights/notes, audio progress, labels on saved pages and articles, notifications and
device registration, and settings. Saved pages carry no labels or highlights on the wire
yet even though both exist in storage, and unsubscribing and editing a subscription are
still web-only. Provider account-management work before App Store distribution includes
Apple authorization revocation during account deletion and native guidance for linking an
email-colliding provider identity.
