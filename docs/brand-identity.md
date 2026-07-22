# Currentfold brand identity

**Status:** approved design direction and implementation-ready source assets. The
product/domain availability check and the full application rebrand are still separate
decision and delivery steps.

## Brand idea

Currentfold is a calm place to follow, save, and read the open web. The name combines a
living current of new material with the deliberate act of folding something aside to
return to it.

The product should feel editorial without feeling precious, and capable without feeling
busy. Its identity supports the reader rather than competing with what they came to
read.

### Positioning line

> A focused reader for following, saving, and returning to the open web.

### Product line

> Read the open web on your terms.

Use the positioning line when the product needs an explanation. Use the shorter product
line in onboarding, marketing headers, and other places where the surrounding context
already makes the product category clear.

## Name

- Write **Currentfold** with one capital C.
- Do not write `CurrentFold`, `Current Fold`, or `currentfold` in public prose.
- Use `currentfold` for technical identifiers such as package, repository, image,
  database, and filesystem names during the full-stack rebrand.
- Prefer concrete labels such as **Save to Currentfold** and **Your Currentfold digest**
  over possessive or conversational brand language.

## Logo system

The symbol is a geometric C made from one continuous, open form. Its circular back is the
current; its compact angled terminals suggest a folded edge. The upper coral and lower
ink layers make that idea visible without adding a second pictogram.

The shape is deliberately simple enough to remain recognizable at favicon size. Do not
add page lines, arrows, waves, an RSS glyph, or another fold to explain it.

### Approved source assets

| Asset | Purpose |
| --- | --- |
| [`currentfold-mark.svg`](../public/brand/currentfold-mark.svg) | Primary symbol on paper or other light surfaces. |
| [`currentfold-mark-reversed.svg`](../public/brand/currentfold-mark-reversed.svg) | Symbol on deep ink/dark surfaces. |
| [`currentfold-mark-mono.svg`](../public/brand/currentfold-mark-mono.svg) | One-colour printing, embossing, or constrained contexts. |
| [`currentfold-lockup.svg`](../public/brand/currentfold-lockup.svg) | Portable primary horizontal lockup with the wordmark converted to paths. |
| [`currentfold-lockup-reversed.svg`](../public/brand/currentfold-lockup-reversed.svg) | Portable horizontal lockup for deep ink/dark surfaces. |
| [`currentfold-app-icon.svg`](../public/brand/currentfold-app-icon.svg) | Rounded source for previews and conventional application icons. |
| [`currentfold-app-icon-maskable.svg`](../public/brand/currentfold-app-icon-maskable.svg) | Full-bleed PWA source with the symbol inside the mask-safe area. |

The SVGs are the editable masters. Generate raster favicon and PWA sizes from them during
the branded-release implementation; do not hand-edit independent PNG variants.

### Responsive use

1. **Full lockup:** use the symbol and wordmark when at least 160 CSS pixels are
   available. Preserve their supplied proportions.
2. **Compact product header:** assemble the 20–24 pixel symbol with live **Currentfold**
   text set in Newsreader SemiBold. This keeps the wordmark crisp and theme-aware in the
   application while matching the outlined master.
3. **Symbol only:** below 160 pixels of available width, or in square surfaces, use the
   mark without squeezing or abbreviating the name.
4. **Favicon:** use the symbol alone. Its minimum supported display size is 16 × 16
   pixels.

Use the light-surface mark on paper. Use the reversed mark on deep ink. The monochrome
mark may use ink on light material or paper on dark material. Never place the ink lower
half on a dark surface where it disappears.

### Space and size

- Keep clear space on every side equal to at least one quarter of the symbol's displayed
  height.
- Do not render the full lockup below 160 pixels wide.
- Do not render the standalone symbol below 16 pixels.
- Do not rotate, outline, shadow, stretch, recolour, or separate the two halves.
- Do not use the symbol as a repeating decorative pattern.

## Typography

### Editorial and brand face — Newsreader

Newsreader is the wordmark, headline, and reading face. Use SemiBold (600) for live brand
text, Medium/SemiBold for product headings, and Regular (400) for reading content. The
outlined lockup uses Newsreader SemiBold at optical size 48.

This is a deliberate continuation of the existing product typography: Newsreader is
already loaded through `next/font` and used for the reading canvas. It was designed by
Production Type for continuous on-screen reading in content-rich environments and is
available under the SIL Open Font License 1.1.

### Interface face — Geist

Use Geist for navigation, controls, metadata, settings, forms, and operational email
details. It should remain quiet beside Newsreader rather than imitate editorial display
type.

Do not introduce another serif or sans family without revisiting the system as a whole.

## Colour

| Role | Value | Use |
| --- | --- | --- |
| Paper | `#FAF9F5` | Light canvas and reversed mark layer. |
| Ink | `#1C1917` | Primary wordmark, light-mode symbol, and text. |
| Current coral | `#EA7558` | The upper fold and restrained brand emphasis. |
| Stone | `#78716C` | Secondary brand material and muted metadata. |
| Deep ink | `#181512` | Dark canvas and application-icon background. |

Coral is an identifying accent, not a default body-text colour. Do not set small coral
text on paper, or white text on coral, without checking the rendered contrast. Product
controls may continue to use theme-specific darker/lighter interaction tokens where
accessibility requires them; the logo colours must not silently redefine button colours.

## Voice

Currentfold sounds calm, direct, and informed.

- Describe the reader's outcome before implementation details.
- Prefer **articles**, **sources**, and **reading** in general product copy; reserve feed,
  OPML, and sync terminology for places where it is genuinely useful.
- Avoid productivity guilt, inbox-zero language, breathless automation claims, and
  artificial urgency.
- Do not market ordinary extraction or rules as “AI.”
- Keep success messages factual: **Saved to Currentfold**, not celebratory or chatty.

## Accessibility and production checks

- Every rendered logo image needs useful alternative text when it identifies the product;
  use empty alternative text when adjacent visible text already says Currentfold.
- The symbol must remain legible at 16, 20, 24, 32, and 48 pixels in both themes.
- Maskable-icon review must include circle, squircle, and rounded-square crops.
- Favicons and installed icons must be checked on a real light and dark browser/OS shell.
- Email clients should use the outlined SVG only where supported; exported PNG is the
  dependable fallback.
- The full rebrand must replace the current generated letter icons rather than layering
  the new symbol beside them.

## Source and licence record

- Symbol geometry: original Currentfold identity work, July 2026.
- Wordmark outlines: **Newsreader SemiBold**, weight 600, optical size 48.
- Newsreader authors: The Newsreader Project Authors / Production Type.
- Font source: <https://github.com/google/fonts/tree/main/ofl/newsreader>
- Font licence: SIL Open Font License 1.1,
  <https://github.com/google/fonts/blob/main/ofl/newsreader/OFL.txt>

The repository does not redistribute a font binary as part of this identity package.
The outlined wordmark is a generated graphic, while the application continues to load
Newsreader through Next.js.
