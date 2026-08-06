# Design & UX — iOS

A companion to [design-ux.md](design-ux.md), which is the product's design system. This one
records what the iPhone app does with it: the decisions that are already in the code, the two
places we deviate from the platform, and the floors a change has to clear. It documents what
*is*, not what we hope for — anything aspirational belongs in `apps/ios/PLAN.md` until it ships.

**Native first.** SwiftUI idioms, system controls, standard gestures. The brand shows in three
places only: the serif display face, the accent, and the tone of voice. Where we leave the
platform, it is written down here with its reason.

## Type

| Where | Face |
| --- | --- |
| Brand wordmark (`App/BrandHeader.swift`) | `.system(.largeTitle, design: .serif, weight: .semibold)` |
| Article title (`Features/Reader/ArticleDetailView.swift`) | `.system(.title, design: .serif, weight: .semibold)` |
| Everything else | the system text face, at semantic sizes |

Serif is the editorial signal and it is spent on exactly those two things — the product's name
and the thing you came to read. Row titles are `.headline`, previews and meta lines
`.subheadline`, row markers `.caption2`, and the article body is `-apple-system-body` inside the
web view so it stays on Dynamic Type. Newsreader (brand-identity.md's editorial face) is not
bundled; the system serif stands in for it on device, which is why the wordmark is live text
rather than the outlined lockup.

No fixed point sizes anywhere. Anything sized in points next to type scales with it — the unread
dot is `@ScaledMetric(relativeTo: .headline)`, not a constant.

**Spacing is not a scale yet.** Screens use SwiftUI's defaults plus a handful of local values.
That is a real gap, not a decision; do not invent a scale in a feature PR.

## Reading typography

Three device-scoped choices, mirroring the web's Settings → Reading: body font serif/sans, text
size, column width. One stored value (`ReadingSettings`), two surfaces — **Aa** in the reading
toolbar and Settings → Reading — so they cannot offer different options or disagree.

**Text size is an adjustment, never a replacement.** The document's root is
`html { font: -apple-system-body }`, so Dynamic Type still decides what normal means and WebKit
keeps it live when the system setting changes; the choice multiplies it in `em` on `body`
(−12% / 0 / +18%, the web's own steps). A control that set a pixel size would silently opt the
article out of the one accessibility floor this document names for the web view.
`ReadingTypographyTests` fails if the root rule or the `em` multiplier goes away.

**Column width on a phone is a margin, not a measure.** The web caps the column at 52/65/78 `ch`.
At an iPhone's width none of them bind — 52ch is already wider than the screen — so each option
carries a side inset as well, which is what the reader actually sees; the `ch` ceiling takes over
on iPad and in landscape. Shipping only the ceiling would have been a control that visibly did
nothing.

**The body defaults to sans, where the web defaults to serif.** Serif here is spent on exactly two
things (above), and the article title is one of them; a serif body would spend it everywhere and
remove the contrast that makes the title read as the title. The reader can still choose serif, and
gets `ui-serif` — New York, the same face as the title — so choosing it yields one typeface down
the screen rather than two.

## Reading progress

A resume position is a convenience, so its failures are quiet and its affordance is small.

- **The divider is the progress line.** A rule already separated the header from the body on both
  reading screens; it now fills left-to-right in the accent instead. The screen gains an indicator
  without gaining a line, at the top edge of the thing it measures, still visible once the copy has
  scrolled the title away. Only where there is a scrollable body — a "fetching a copy" state has
  nothing to measure and keeps the plain divider.
- **A write may fail silently; it may not be silently lost.** Nothing about a scroll offset is
  worth an alert in front of a reader, which is exactly why a refused batch goes back into
  `ReadingProgressQueue` and rides the next flush — the next quiet moment, the next screen closing,
  the next backgrounding.
- **The server's echo is the truth.** Both endpoints answer with the position they *stored*, not
  the one they were sent, and the store keeps the echo. A client that remembered its own number
  would re-send it forever.

## Adding a source

Four outcomes, four things to say, and only one of them is an error.

- **Subscribed** confirms by name — what the reader pasted was often a site and what they got was
  its feed — and the prominent action lands them on it.
- **Candidates is a question, not a failure.** Nothing was subscribed, and the sheet says so above
  the picker; the web's form silently takes the first feed, and asking is the one thing the native
  path does that a form submission could not.
- **Already following is not an error either.** The account has it, so the useful offer is the way
  to it. The refusal does not name the source, so it is matched locally by host — and only when
  exactly one source matches, because offering the wrong one is worse than offering nothing.
- **No feed found shows the server's own message.** "Could not fetch page: HTTP 403" and "no feed
  advertised" are different problems for the reader, and a generic line would throw that away.

## Surfaces

Two, and the app paints both itself. `.systemBackground` appears nowhere.

| Role | Light | Dark | Where |
| --- | --- | --- | --- |
| `canvas` | brand `paper` `#FAF9F5` | brand `deepInk` `#181512` | plain lists, the article, launch, and the backdrop of a grouped list |
| `raised` | `#FDFDFB` | `#201D1A` | cells of a grouped or inset list |

**The dark decision (6 Aug).** design-ux.md puts dark surfaces in the `#121212–#1E1E1E` band
because a wall of body text on pure black halates, and brand-identity.md names `paper` and
`deepInk` as the two canvases. iOS's `.systemBackground` is neither: pure white and pure black.
We adopt the band, on every screen, rather than deviating to the platform default — this is a
reading app whose largest surface is running text, the web app already ships the same warm
charcoal, and a canvas that changes between our two clients is a product inconsistency a user
notices in one glance. The cost is real and accepted: system chrome (bars, sheets, menus,
materials) is tuned for the platform's canvas. In practice the bars pick up a blur of ours and
match; anything the system presents on top of us — share sheet, keyboard, alerts — stays its own
color, and that is correct, because those are the system's surfaces, not the app's.

Both dark values sit inside the band by measurement, not by eye: the canvas is at its floor and
the one raised surface at its ceiling (`#201D1A` has the luminance of `#1E1E1E`). Nothing goes
above it. `BrandSurfaceTests` fails if either drifts out.

The article web view is transparent and paints no canvas of its own, so the reading surface *is*
`canvas` — that is what keeps the article inside the band instead of on WebKit's black, and it is
why `ArticleHTMLView` sets `html, body { background: transparent }` against `color-scheme`.

Applied by three modifiers in `Currentfold/App/BrandControls.swift`: `.currentfoldCanvas()` on
every screen, `.currentfoldRaisedRows()` on grouped sections, `.currentfoldCanvasRows()` on plain
list rows. A screen that forgets them falls back to the platform's black, which is exactly the
failure the one-pass adoption exists to prevent.

The line between "the system's surface" and "ours" is *whose content is on it*, not how it was
presented. A sheet we fill (Add a Source) and a popover we fill (the **Aa** controls) are our
screens and get the canvas; the share sheet, the keyboard, alerts, and menus are the system's and
keep their own.

## The accent

One accent, in two forms. Both live in `Currentfold/App/CurrentfoldTheme.swift`.

**Accent as ink** — `BrandAccentInk`, light `#B05842`, dark `#EE9179`. Link text, bar buttons,
tab-bar selection, footer links, and the unread dot. The app-level `.tint` and the `AccentColor`
asset are this value, so anything that inherits a tint clears AA without asking. Full-chroma
`current` (`#EA7558`) measures 2.8:1 on paper — too weak for text *and* for a 7pt dot, which
WCAG treats as a graphical object needing 3:1. The web app made the same call: its `--primary` is
a darkened vermilion in light, a lifted coral in dark, and it paints the unread dot with it.

**Accent as fill** — `BrandCTA`, the one prominent control:

| | Fill | Label | Label on fill |
| --- | --- | --- | --- |
| Light | `#B05842` (`current` darkened 25%) | brand `paper` | **4.6:1** |
| Dark | `#EA7558` (`current`, full chroma) | brand `deepInk` | **6.2:1** |

This replaced `.borderedProminent` tinted with coral, which rendered a white label at **2.9:1** —
the worst contrast in the app, and it was on Sign In, Create Account, Send Reset Link, Try Again,
and every empty-state action. A lighter or heavier label on the same fill does not fix it; fill
and label have to be chosen together, per appearance. Light darkens the fill (also what iOS's own
prominent buttons look like); dark keeps the fill bright, because darkening it would sink the
button into a near-black canvas.

**Use `.buttonStyle(.primaryAction)` and nothing else for a prominent control.**
`.borderedProminent` is not used in this app. The style is hand-rolled precisely because the
system one picks its own label color; see `PrimaryActionButtonStyle` in `App/BrandControls.swift`.
`PrimaryActionContrastTests` pins both ratios and both derivations.

Full-chroma `current` appears in the interface in exactly one place — the dark CTA fill. Elsewhere
it is identity only: the mark and the app icon.

## Verb tints

Color is the whole cue at swipe speed, so the palette is short and every hue is borrowed from a
convention the reader already has.

| Verb | Tint | Why |
| --- | --- | --- |
| Star | system yellow | The one triage verb with a universal symbol *and* color. |
| Read later | system indigo | Separates from the star's warm yellow at a glance. |
| Read / unread | system blue, **both directions** | Mail's swipe-to-toggle-read is blue whichever way it is going; the icon and the label carry the direction. |
| Unread state | the accent | Coral is reserved for the state the product is about. It is never a verb tint. |
| Errors, destructive roles | system red | The platform's role. Coral must not double as an alarm color. |
| Sign in with Apple | Apple's black/white button | Their HIG owns that control. |

*Ratified 6 Aug.* Green-for-mark-read was dropped: a second hue for the reverse of a single verb
made a fourth color in the swipe palette, and "green means done" collides with the success haptic
the sweep already uses.

## Icons

Circles, never envelopes — this is a reader, not a mailbox, and a mail icon implies a sender and
a reply. The web marks unread with a filled dot; iOS uses the SF Symbols circle family for the
same metaphor. A control that *changes* state shows the state the tap will produce.

| | Is | Becomes (on a toggle control) |
| --- | --- | --- |
| Unread | `largecircle.fill.circle` | `circle` |
| Read | `circle` | `largecircle.fill.circle` |
| Starred | `star.fill` | `star.slash` |
| Not starred | `star` | `star.fill` |
| Saved | `bookmark.fill` | `bookmark.slash` |
| Not saved | `bookmark` | `bookmark.fill` |

Titles come from the same enums (`ReadStateIcon`, `StarIcon`, `ReadLaterIcon`), so a swipe, a
context menu, and a toolbar cannot describe the same verb differently. Read later says **Remove**,
matching the web's verb.

## Haptics

Punctuation, not decoration.

- **Light impact** on a deliberate triage commit — a swipe, a context-menu verb, an article
  toolbar verb. Fired on the gesture, not on the network round trip.
- **Success** on the two actions with a result worth confirming: a mark-all-read sweep, and a
  source added. Both answer a question the reader asked — how many, and which feed — and both are
  the end of a deliberate flow rather than a step inside one.
- **Nothing** on an automatic state change. Opening an article marks it read and stays silent;
  the reader did not ask for that, so it does not get a tap back. Reading progress is silent for
  the same reason, in both directions: scrolling is not a triage action.

## Counts

Capped at `1k+` past three digits (`UnreadCountFormat`), and VoiceOver hears the same imprecision
("More than a thousand unread") rather than the real figure. The cap is the message — an exact
four-digit unread count is design-ux.md's first documented anti-pattern.

## Empty states

Every empty list says what is empty *here* and offers one next action, and that action is the
prominent CTA. The four states are distinct on purpose: caught up is an achievement, an empty
Starred view is an unused feature that needs explaining, nothing-published is a waiting state, and
an account with no sources cannot be fixed by refreshing. Copy follows brand-identity.md's voice:
factual, no productivity guilt, no celebration. Scope names the place — "in Design", not "in
Library", because "in Library" reads as boilerplate.

No empty state sends the reader to the web app any more. "Add Sources on the Web" was a promissory
note against a missing feature; now that the source can be added here, the no-sources states open
the sheet instead, and a first session needs one device.

## Accessibility floors

Not aspirations; three test classes measure them.

- Every ink token clears **4.5:1** against every surface it can land on, in the appearance it
  belongs to (`ArticlePaletteTests`, `BrandSurfaceTests`).
- Every fill clears **3:1** against its canvas, and its label clears 4.5:1 against the fill
  (`PrimaryActionContrastTests`).
- The prominent control is **44pt** minimum, above the system's 34.
- Dynamic Type everywhere, including inside the article web view.
- VoiceOver labels read as sentences; a row's snippet rides along as
  `accessibilityCustomContent` so scanning stays fast.

**Open, for the accessibility audit:** system red as error text measures ~3.3:1 on the light
canvas. That is the platform's own value on the platform's own surface, and we have not decided
whether to hold the floor with a darker error ink or accept the system's.

## The design gate

A feature PR carries screenshots: **a small and a large iPhone, light and dark, and one Dynamic
Type XL pass.** A PR without them is not reviewable. Polish is a gate, not a phase.

## Where we leave the platform, and why

1. **The canvas** is ours in both appearances, not `.systemBackground` — see the dark decision
   above. Cross-client consistency and halation beat the OLED default.
2. **The prominent button** is ours, not `.borderedProminent` — the system style chooses its own
   label color and that choice fails WCAG against our accent.
3. **Prominent controls are 44pt tall**, not the system's 34, so the app's primary actions clear
   the recommended hit target.
4. **The reading progress bar is ours**, not `ProgressView(.linear)` — the system control is a
   floating capsule with its own inset and cap radius, and this one has to *be* the rule between
   the header and the body. A progress indicator that read as an added control instead of a
   filled divider would be the loudest thing on a reading screen.

Nothing else. When the next deviation shows up, it goes in this list with its reason, or it does
not ship.
