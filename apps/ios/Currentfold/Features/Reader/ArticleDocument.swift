import Foundation

/// The HTML document the reading web view loads: the sanitized copy the server sent, wrapped
/// in the app's stylesheet.
///
/// A type of its own rather than a private constant inside the view, because the stylesheet is
/// now a *function* of the reader's typography choice, and because it is the one part of the
/// reading surface that can be measured without a screen.
///
/// Two rules hold the whole sheet together:
///
/// 1. **Dynamic Type is the base size, always.** `html` is set with `font: -apple-system-body`,
///    so the document's root size is whatever the reader's system setting says. The typography
///    control then multiplies it, in `em`, on `body` — an adjustment layered on top of Dynamic
///    Type rather than a replacement for it. Nothing anywhere is sized in pixels except the
///    side inset, which is a margin, not type.
/// 2. **The app owns the canvas.** The web view is transparent and the article sits on
///    ``BrandSurface/canvas`` like every other screen; `color-scheme` still tells WebKit which
///    form controls to draw. See `ArticleHTMLView` and design-ux-ios.md.
enum ArticleDocument {
    static func html(body: String, typography: ReadingTypography) -> String {
        """
        <!doctype html>
        <html>
        <head>
          <meta name="viewport" content="width=device-width, initial-scale=1">
          <style>
        \(stylesheet(typography))
          </style>
        </head>
        <body>\(body)</body>
        </html>
        """
    }

    static func stylesheet(_ typography: ReadingTypography) -> String {
        palette + layout(typography) + elements
    }

    /// The article palette, sourced from `CurrentfoldBrand` — see ``ArticlePalette``.
    private static let palette = """
        :root {
          color-scheme: light dark;
          --article-body: light-dark(\(ArticlePalette.bodyLight), \(ArticlePalette.bodyDark));
          --article-link: light-dark(\(ArticlePalette.linkLight), \(ArticlePalette.linkDark));
          --article-muted: light-dark(\(ArticlePalette.mutedLight), \(ArticlePalette.mutedDark));
          --article-surface: light-dark(\(ArticlePalette.surfaceLight), \(ArticlePalette.surfaceDark));
          --article-hairline: light-dark(\(ArticlePalette.hairlineLight), \(ArticlePalette.hairlineDark));
        }

        /* light-dark() reached WebKit after our iOS 17.0 floor, so the earliest supported
           devices get the same two values through prefers-color-scheme. */
        @supports not (color: light-dark(#000, #fff)) {
          :root {
            --article-body: \(ArticlePalette.bodyLight);
            --article-link: \(ArticlePalette.linkLight);
            --article-muted: \(ArticlePalette.mutedLight);
            --article-surface: \(ArticlePalette.surfaceLight);
            --article-hairline: \(ArticlePalette.hairlineLight);
          }

          @media (prefers-color-scheme: dark) {
            :root {
              --article-body: \(ArticlePalette.bodyDark);
              --article-link: \(ArticlePalette.linkDark);
              --article-muted: \(ArticlePalette.mutedDark);
              --article-surface: \(ArticlePalette.surfaceDark);
              --article-hairline: \(ArticlePalette.hairlineDark);
            }
          }
        }

        """

    /// Everything the reader chose. `--reader-scale` and `--reader-measure` are named after the
    /// web's own custom properties so the two clients can be read side by side.
    private static func layout(_ typography: ReadingTypography) -> String {
        """
        :root {
          --reader-scale: \(scale(typography.size));
          --reader-measure: \(typography.width.measure)ch;
          --reader-inset: \(typography.width.sideInset)px;
        }

        /* The root size is Dynamic Type's, so the reader's system setting is the baseline and
           WebKit keeps it live when that setting changes. */
        html { font: -apple-system-body; }

        /* `color-scheme` above tells WebKit which form controls and scrollbars to draw, but it
           would also have it paint a white or black canvas. The app owns the canvas. */
        html, body { background: transparent; }

        body {
          font-family: \(typography.font.cssFamily);
          font-size: calc(1em * var(--reader-scale));
          color: var(--article-body);
          line-height: 1.58;
          margin: 0 auto;
          max-width: var(--reader-measure);
          padding: 20px var(--reader-inset) 48px;
          overflow-wrap: anywhere;
        }

        """
    }

    /// Trailing zeroes would make the sheet churn between builds for no reason.
    private static func scale(_ size: ReadingTextSize) -> String {
        String(format: "%g", size.scale)
    }

    private static let elements = """
        a { color: var(--article-link); }

        img, video, iframe { max-width: 100%; height: auto; }
        img { display: block; margin: 1.25em auto; }
        figure { margin: 1.4em 0; }
        figcaption {
          color: var(--article-muted);
          font-size: 0.88em;
          line-height: 1.45;
        }

        blockquote {
          margin: 1.2em 0;
          padding: 0.1em 0 0.1em 1em;
          border-left: 3px solid var(--article-hairline);
          color: var(--article-muted);
        }

        pre, code, kbd, samp {
          font-family: ui-monospace, "SF Mono", Menlo, monospace;
          font-size: 0.9em;
        }
        code {
          background: var(--article-surface);
          border-radius: 4px;
          padding: 0.15em 0.35em;
        }
        pre {
          background: var(--article-surface);
          border-radius: 8px;
          padding: 12px 14px;
          overflow-x: auto;
        }
        pre code {
          background: none;
          padding: 0;
        }

        hr {
          border: 0;
          border-top: 1px solid var(--article-hairline);
          margin: 1.8em 0;
        }

        /* Wide tables scroll themselves instead of pushing the reading column sideways. */
        table {
          display: block;
          max-width: 100%;
          overflow-x: auto;
        }
        """
}
