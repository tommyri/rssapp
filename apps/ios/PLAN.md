# Currentfold for iOS — productization plan

> **Working document.** Created 5 August 2026 from a full code + UX review of the app.
> Temporary by design: fold decisions into `docs/` (design-ux.md, features.md, ADRs) as
> they become real, and delete this file when the phases below have landed or moved to
> the roadmap. Not a release record.

## Thesis: design is the wedge

There are a lot of RSS apps. We don't win on feature count — Inoreader already won that
race and its UI shows the cost. We win on a **well-thought-out, deeply polished design**
that makes the everyday experience — triage, read, move on — feel effortless and calm.
This is the same wedge as the web app (*"Feedbin's restraint with Inoreader's power
underneath"*), expressed natively.

Practical consequence: **polish is a gate, not a phase.** A feature ships when it feels
inevitable on the phone, not when it functions. Every phase below carries its design
work inside it, and the cross-cutting design track applies to all of them.

## Where the app stands (August 2026)

The foundation is inverted relative to the product:

- **Excellent, done, stop investing:** authentication and transport. Rotating Keychain
  sessions, serialized refresh, Universal Links, native Apple/Google scaffolding,
  contract-fixture tests, Swift 6 strict concurrency. ~60% of the app code.
- **MVP, where all future work goes:** the reader. One flat Library list (all articles,
  newest first), read/unread toggle, WKWebView article view, read-only Sources list,
  minimal Settings.
- **The contract is the throttle:** `/api/v1` has exactly three reader endpoints
  (articles list, subscriptions list, read-state batch). Every feature below is an API
  slice first, a client second. Keep the discipline: extend `openapi.json` + fixtures,
  decode the fixture in `CurrentfoldTests`, then build UI.

Most jarring defects found in review:

- Sources rows show unread counts that invite a tap and are not tappable
  (`SourcesView.swift` — `SourceRow` is a plain `HStack`, a dead end).
- Library has no unread filter, no per-feed/folder views, no mark-all-read — it
  contradicts our own "inbox people" philosophy (design-ux.md).
- Article view: no share sheet, no star/read-later, link color hardcoded `#C24F36`
  (wrong in dark mode), envelope icons for read state (reads as email; web uses
  circles).

## Design principles (the bar for every screen)

1. **Native first.** SwiftUI idioms, system controls, standard gestures. The brand
   shows in typography (serif display), the accent, and tone of voice — never in
   fighting the platform. When we deviate from a system control, we write down why.
2. **Calm reading.** Quiet chrome, generous whitespace, no skeleton flashes (deliberate
   web choice — keep it), unread counts capped at "1k+", never an exact four-digit
   guilt number.
3. **Triage is sacred.** The NNW row recipe (dot · bold title · 1–2 line snippet · meta
   line), swipe verbs that match the web's deliberate-read model — scrolling never
   changes state, unread → read only by opening or an explicit bulk action.
4. **Both appearances are first-class.** Design in light and dark simultaneously; dark
   surfaces in the `#121212–#1E1E1E` band (halation), including inside article HTML.
5. **Accessibility is design, not compliance.** Dynamic Type everywhere including the
   article WebView, VoiceOver labels that read like sentences, honest contrast, hit
   targets. Audit before TestFlight, not after.
6. **Motion and haptics are punctuation.** Restrained, meaningful feedback on triage
   actions (mark read, star, save); no decorative animation.
7. **Design review gate per PR:** screenshots on a small and large iPhone, light + dark,
   and one Dynamic Type XL pass. A feature PR without screenshots isn't reviewable.

## Cross-cutting design track

Applies across all phases; items here are independently shippable polish.

- [x] **iOS design language note** — *(done 6 Aug)* `docs/design-ux-ios.md`. Dark
      decision: **halation band adopted app-wide** from brand tokens (canvas
      `paper`/`#181512`, raised `#FDFDFB`/`#201D1A`, band membership test-pinned;
      `.systemBackground` eliminated; article WebView made transparent onto the
      canvas). Verb tints ratified (star yellow, read later indigo, read/unread blue
      both directions — green dropped, coral reserved for unread). CTA treatment:
      `.primaryAction` style replaces `.borderedProminent` everywhere — 4.6:1 light /
      6.2:1 dark (was 2.9:1); accent-as-ink is now the app tint and AccentColor asset.
      Spacing scale honestly recorded as a gap, not invented.
- [x] **Welcome screen polish** — *(done 5 Aug)* masthead brand lockup is the title
      (no more double title), large full-width CTA, centered chevron-less footer links
      via programmatic navigation. Password-manager affordances kept.
- [x] **List row recipe** — *(done 5 Aug)* dot (Dynamic-Type-scaled) · title · 2-line
      preview · meta (feed · time · "N min read"; feed dropped in per-source lists) ·
      star/read-later markers in their verb tints. VoiceOver reads a sentence; snippet
      exposed via `accessibilityCustomContent`. No thumbnails.
- [x] **Article HTML styling** — *(done 5 Aug)* full `light-dark()` palette sourced
      from `CurrentfoldBrand` with an `@supports` fallback for iOS 17.0 WebKit; new
      `BrandAccentInk` token (accent-as-text, WCAG-checked per appearance, pinned by
      `ArticlePaletteTests`); code blocks, blockquotes, figures, tables styled for both
      appearances. JavaScript stays disabled.
- [x] **Context menus** — *(done 5 Aug)* Mark Read/Unread, Share, Open Original on
      long-press. Star/Read later join in Phase 1 with their mutations.
- [x] **Haptics** — *(done 5 Aug)* light impact on swipe commit and read-state toggles;
      deliberately not on auto-mark-read. Mark-all-read success feedback lands with
      Phase 1.
- [x] **Empty states with a next action** — *(done 5 Aug)* no-sources vs
      nothing-published states distinguished; "Add Sources on the Web" link until
      native add-feed lands; copy per brand voice.
- [ ] **Accessibility audit** — VoiceOver walkthrough of triage + reading, Dynamic Type
      XL on every screen, contrast check in both appearances. Blocking for TestFlight.
      ~~Known finding (5 Aug): prominent CTA contrast ~2.9:1~~ **fixed 6 Aug** by the
      design-language pass (`PrimaryActionButtonStyle`, contrast test-pinned).
      **Open audit items (6 Aug, recorded in design-ux-ios.md):** system red error text
      ~3.3:1 on light canvas (darker error ink vs accept platform value); `.secondary`
      labels ~3.3:1 in light (platform behavior); light-mode raised-card separation is
      subtle (1.03 luminance ratio) — check on a real device in bright light.
- [ ] **iPad decision** (open) — `TabView` on iPad is a stretched phone. Either commit
      to `NavigationSplitView` (sidebar → list → article maps perfectly) or ship
      TestFlight iPhone-only (`TARGETED_DEVICE_FAMILY = 1`) and design iPad properly
      later. Don't implicitly promise an iPad app we haven't designed.

## Phase 1 — a daily-drivable triage tool

Goal: the app you reach for instead of the mobile web reader. Each item is
contract-first.

- [ ] **Filtered article lists + navigable Sources**
  - [x] API *(done 5 Aug)*: `GET /articles` has `filter=all|unread|starred|readLater`
        (default `all`), `subscriptionId`, `folderId`; all compose with the cursor;
        unknown scope ids return an empty page. Fixtures + contract tests shipped;
        `unreadOnly` kept but deprecated.
  - [x] Library defaults to **unread** *(done 5 Aug)* — toolbar Menu titled with the
        active view (Unread / All / Starred / Read Later), per-filter honest empty
        states.
  - [x] Sources rows navigate *(done 5 Aug)* — every row pushes its source's list;
        folders get an "All in <folder>" row (Mail's "All Inboxes" shape — headers
        aren't tap targets); "Unfiled" sorts last; counts capped at "1k+".
  - [x] **Session-stable unread list** *(done 5 Aug)* — a list never drops a row whose
        state stops matching its filter; reload (pull-to-refresh, fresh visit, filter
        switch) clears them. Applies to Starred/Read Later the same way. Pinned by
        store tests incl. revision-guarded race coverage.
- [ ] **Complete the triage verbs**
  - [x] API *(done 5 Aug)*: `PATCH /articles/starred-state` and
        `PATCH /articles/read-later-state` (batched, whole-batch ownership validation,
        no partial updates), mirroring `read-state`.
  - [x] Swipe actions *(done 5 Aug)*: leading = read/unread; trailing = Read Later
        (full-swipe, matching mobile web) then Star. Context menu carries all verbs;
        article toolbar keeps the read toggle visible with the rest in an overflow
        Menu. Haptics on every commit.
  - [x] API *(done 5 Aug)*: `POST /articles/mark-all-read` — required `scope`
        discriminator (`all`/`subscription`/`folder`), optional `olderThan` ISO-8601
        cutoff, returns `markedCount`; `404 scope_not_found` for unowned scopes.
  - [x] UI: **mark-all-read** *(done 5 Aug)* — scoped toolbar menu (all / older than a
        day / a week) behind a confirmationDialog that says exactly what happens;
        non-optimistic (shows the server's real count in a fading capsule); success
        haptic; refreshes Sources counts.
- [ ] **Row recipe upgrade** (design track item; listed here because it needs the
      contract)
  - [x] API *(done 5 Aug)*: `preview` (plain-text, ≤221 chars, boilerplate-stripped,
        word-boundary cut, `null` when nothing worth previewing) and `readingTime`
        (whole minutes, 225 wpm, `null` under 30 words) — computed with the exact
        functions the web rows use. **Decision made:** list keeps `content.html`
        (removing it is breaking; slimming needs its own contract change later).

## Phase 2 — reading depth + the native differentiator

- [x] **Share extension → saved pages** — *(done 6 Aug)* `CurrentfoldShare` target;
      session shared via keychain access group with graceful ungrouped→shared migration
      (no sign-out; sign-out clears every group; unsigned test builds fall back to the
      ungrouped item). Saved / already-saved auto-dismiss; limit and signed-out states
      designed. Unified Read Later queue via `ReaderEntryMerge` (invariant: a row is
      emitted only once no unfetched row could sort above it; each stream ≤1 page
      ahead; plain lists are the degenerate case, so all lists share one pagination
      path). Saved-page rows (link marker, `saved <time>`, quiet pending copy,
      row-level Retry), detail view with bounded visibility-gated poll, Remove as
      session-stable red destructive verb. **TestFlight gate: keychain-group behavior
      must be re-verified on a signed device; `Retry-After` header still unread
      (transport discards headers; body message shown instead).**
  - [x] API *(done 6 Aug)*: `GET/POST /saved-pages` (POST answers before fetching via
        `after()` so a share sheet dismisses instantly; per-account save budget shared
        with web, `429 save_limit_reached` + `Retry-After`), `DELETE /saved-pages/{id}`,
        `POST /saved-pages/{id}/retry`, `PATCH /saved-pages/read-state` and
        `/saved-pages/reading-progress`. Extraction status `pending|ready|failed`;
        rows carry preview/readingTime/title/siteName fallbacks so they draw before
        extraction. **Composition decision:** two streams, client merges by date
        (`filter=readLater` articles + saved pages) — mirrors the web's own model;
        a unified endpoint stays an additive option.
- [x] **Article view polish**
  - [x] System share sheet — *(done 5 Aug, wave 2)* ShareLink in the toolbar overflow
        and row context menus.
  - [x] Star / read later in the toolbar — *(done 5 Aug, wave 2)* read toggle keeps
        the visible slot; the rest in the overflow Menu.
  - [x] Reading-progress sync — *(done 6 Aug)* throttled scroll tracking with
        restore-on-reopen (suppressed until the pending resume applies, so closing a
        fresh article can't zero a position), serialized flush on disappear/background,
        failed batches requeued minus rows the reader moved past; custom hairline
        progress bar (sanctioned as platform deviation #4 in design-ux-ios.md).
        Applies to articles and saved pages.
  - [x] API *(done 6 Aug)*: `PATCH /articles/reading-progress` (batched, distinct ids,
        overwrite semantics; server normalizes ≤0.05/≥0.95 to null via the web's own
        `storedReadingProgress` and echoes stored values).
  - [x] Typography controls — *(done 6 Aug)* serif/sans, size in `em` on top of
        Dynamic Type (never replacing it), column width with phone inset + `ch`
        ceiling; one `ReadingSettings` store surfaced as toolbar Aa and Settings →
        Reading; changing typography reloads but restores position. Default stays
        sans (deviation from web's serif, reason recorded in design-ux-ios.md).
- [x] **Add a feed natively** — *(done 6 Aug)* Sources toolbar + empty states open a
      focused sheet; four outcomes as designed states (candidate picker POSTs the
      chosen URL back; 409 resolves to "open that source" only on an unambiguous
      host match; 422 shows the server's reason verbatim); landing differs by entry
      point; success haptic. **"First session must not require a second device" is
      closed.**
  - [x] API *(done 6 Aug)*: `POST /subscriptions` with any URL through the guarded
        discovery path — `201 subscribed` (full Subscription shape) / `200 candidates`
        (picker list, nothing subscribed) / `409 already_subscribed` /
        `422 feed_not_found`.
- [x] **Settings grows honestly** — *(done 6 Aug)* Reading section (device-scoped,
      labeled with the web's This-device scope clarity) sharing the Aa control's
      storage. Account section unchanged (name/email/sign-out — sufficient for now).

## Phase 3 — platform bets

Ordered by leverage; none blocks the phases above.

- [ ] **Push notifications for rule alerts (APNs).** Server already has durable
      notification records and multi-channel delivery; needs a device-registration
      endpoint. Native push is a real advantage over web push on iOS.
- [ ] **Offline + queued mutations** — already scoped in the roadmap's productization
      item; the closure-based API client makes the queue layer testable.
- [ ] **Widgets** — unread count / latest articles; **background refresh** so the app
      opens warm.
- [ ] **Audio player** — `APIArticle.Audio` is decoded and completely unused today;
      inline player with lock-screen/AirPlay controls and cross-device resume
      (`/api/audio-progress` exists on web).

**Deliberately behind all of the above:** highlights/notes (large API slice; the
anchor model is the web's most intricate feature — sync bugs would be visible and
embarrassing) and Sign in with Apple (membership-blocked; tracked in
`docs/sign-in-with-apple.md`).

## Engineering hygiene (small, do opportunistically)

- [x] Cache the `ISO8601DateFormatter` in `APIArticle.displayDate` — *(done 5 Aug,
      behavior pinned by tests incl. a concurrent-read test)*.
- [ ] `MARKETING_VERSION` is stuck at 2026.7.3 (product is at 2026.7.6) — stamp it from
      the release pipeline like the web's build identity.
- [ ] Decide the list-payload shape (see Phase 1) before offline work multiplies it.

## Sequencing realities

- **TestFlight waits for the rebrand/domain migration** — `CURRENTFOLD_SERVER_URL` and
  the associated domain are baked into the build; external testers must never install
  a build pointed at `rssapp.badask.no`.
- ~~**Apple Developer membership** gates Sign in with Apple and TestFlight
  distribution~~ **Enrolled 6 Aug 2026, approval pending** (signing against the paid
  team waits for Apple's confirmation email). Once active, unblocked: TestFlight distribution, APNs
  push (Phase 3), signed-device testing with full entitlements, and starting the
  Sign in with Apple checklist — which is more than flipping env vars; the
  source-of-truth list (portal setup, `APPLE_TEAM_ID`, code exchange, deletion-time
  revocation, Private Email Relay) is docs/sign-in-with-apple.md. Universal Links
  additionally need `APPLE_TEAM_ID` deployed so the server's
  apple-app-site-association carries the team.
- **Contract discipline holds throughout:** OpenAPI + fixtures first, fixture-decoding
  tests, then UI. No Drizzle types, no GReader adapter reuse in the first-party app.

## Open decisions

1. iPad: split-view investment now vs iPhone-only TestFlight (recommendation:
   iPhone-only first; design iPad deliberately later).
2. ~~List payload~~ **Decided 5 Aug:** list keeps full `content.html`; `preview` +
   `readingTime` added so rows never need to parse it. Slimming would be a separate,
   explicitly breaking contract change.
3. Article-list density setting (web has comfortable/compact) — iOS v1 could ship
   comfortable-only and add compact when the row recipe settles.
4. Whether Phase 1 ships as an internal milestone or waits to bundle with Phase 2's
   add-a-feed for the first TestFlight.
