import SwiftUI
import WebKit

/// The article stylesheet's palette, in CSS notation, sourced from `CurrentfoldBrand`:
///
/// - `link` is ``BrandAccentInk`` — the same appearance-specific accent the app uses for
///   link text, so a link reads identically inside and outside the web view. It replaces a
///   hardcoded `#C24F36` that measured 4.46:1 on paper (a hair under WCAG AA) and was used
///   in *both* appearances, where it fell to 3.6:1 against our dark band.
/// - `body` is brand `ink` in light, and brand `paper` mixed 10% with `deepInk` in dark
///   (14.0:1 on the dark canvas) so long-form text is not the pure white that halates.
/// - `muted` is brand `stone` (4.6:1 on paper), lightened 30% toward white for dark
///   (6.7:1 on the dark canvas).
/// - `surface` and `hairline` are ink/paper at low alpha, so they composite over whatever
///   background the app hands the transparent web view.
///
/// The web view is deliberately transparent and paints no canvas of its own: the article sits
/// on ``BrandSurface/canvas`` like every other screen, which is what keeps the reading surface
/// inside design-ux.md's dark band instead of on WebKit's pure black.
/// `ArticlePaletteTests` measures every color here against the surface it actually lands on.
enum ArticlePalette {
    static let bodyLight = "#1C1917"
    static let bodyDark = "#E3E2DE"
    static let linkLight = BrandAccentInk.onLight.css
    static let linkDark = BrandAccentInk.onDark.css
    static let mutedLight = "#78716C"
    static let mutedDark = "#A09C98"
    static let surfaceLight = "rgba(28, 25, 23, 0.05)"
    static let surfaceDark = "rgba(250, 249, 245, 0.08)"
    static let hairlineLight = "rgba(28, 25, 23, 0.12)"
    static let hairlineDark = "rgba(250, 249, 245, 0.14)"
}

/// The reading surface, shared by an article and a saved page.
///
/// Beyond rendering it does two things a plain web view does not:
///
/// - **It reports where the reader is**, as a fraction of the scrollable body, so the caller
///   can draw the progress line and queue the position. Reporting is suppressed until a
///   pending resume has been applied — a fresh document is momentarily at offset zero, and a
///   reader who closed it in that instant would otherwise have their saved position erased by
///   a position they never scrolled to.
/// - **It puts the reader back.** WebKit's content height is not final when the document
///   finishes loading (images are still arriving), so the restore is attempted repeatedly over
///   a short window and abandoned the moment the reader touches the page — a scroll under a
///   finger is the one thing worse than not restoring at all.
struct ArticleHTMLView: UIViewRepresentable {
    let html: String
    let baseURL: URL?
    var typography: ReadingTypography = .default
    /// Where to put the reader back on first load. Consumed once; later changes are ignored,
    /// because by then the reader's own scrolling is the truth.
    var resumeAt: Double?
    var onProgress: (@MainActor (Double) -> Void)?

    func makeUIView(context: Context) -> WKWebView {
        let configuration = WKWebViewConfiguration()
        configuration.defaultWebpagePreferences.allowsContentJavaScript = false
        let webView = WKWebView(frame: .zero, configuration: configuration)
        webView.isOpaque = false
        webView.backgroundColor = .clear
        webView.scrollView.backgroundColor = .clear
        webView.scrollView.delegate = context.coordinator
        webView.navigationDelegate = context.coordinator
        return webView
    }

    func updateUIView(_ webView: WKWebView, context: Context) {
        let coordinator = context.coordinator
        coordinator.onProgress = onProgress
        let document = ArticleDocument.html(body: html, typography: typography)
        guard coordinator.loadedDocument != document else { return }
        // A reload caused by the reader changing text size, font, or column width must not
        // throw them back to the top of the article: the position to restore is the one they
        // are already at. Only a genuinely new document uses the stored resume point.
        let isFirstLoad = coordinator.loadedDocument == nil
        coordinator.loadedDocument = document
        coordinator.beginRestore(to: isFirstLoad ? resumeAt : coordinator.lastProgress)
        webView.loadHTMLString(document, baseURL: baseURL)
    }

    func makeCoordinator() -> Coordinator {
        Coordinator()
    }

    @MainActor
    final class Coordinator: NSObject, UIScrollViewDelegate, WKNavigationDelegate {
        /// Attempts spread over the window in which WebKit is still settling the page's
        /// height. Short, because a restore that lands a second later reads as a glitch.
        private static let restoreDelays: [Double] = [0, 0.2, 0.6, 1.4]

        var loadedDocument: String?
        var onProgress: (@MainActor (Double) -> Void)?
        private(set) var lastProgress: Double = 0

        private var pendingResume: Double?
        private var readerHasScrolled = false
        /// Bounded and self-cancelling, so it is not tied to this object's lifetime: it holds
        /// only a weak `self` and stops on the first check after the view goes away.
        private var restore: Task<Void, Never>?

        /// Arms a restore for the document that is about to load.
        func beginRestore(to progress: Double?) {
            restore?.cancel()
            restore = nil
            readerHasScrolled = false
            pendingResume = (progress ?? 0) > 0 ? progress : nil
        }

        // MARK: - WKNavigationDelegate

        func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
            scheduleRestore(in: webView.scrollView)
        }

        /// A tapped link leaves the reader instead of replacing the article inside it. Without
        /// this the web view would navigate in place, and everything on this screen — the
        /// title, the verbs, the progress being measured — would then belong to an article
        /// that is no longer on it.
        func webView(
            _ webView: WKWebView,
            decidePolicyFor navigationAction: WKNavigationAction,
            decisionHandler: @escaping @MainActor @Sendable (WKNavigationActionPolicy) -> Void
        ) {
            guard navigationAction.navigationType == .linkActivated,
                  let url = navigationAction.request.url
            else {
                decisionHandler(.allow)
                return
            }
            decisionHandler(.cancel)
            UIApplication.shared.open(url)
        }

        // MARK: - UIScrollViewDelegate

        func scrollViewWillBeginDragging(_ scrollView: UIScrollView) {
            readerHasScrolled = true
            pendingResume = nil
            restore?.cancel()
        }

        func scrollViewDidScroll(_ scrollView: UIScrollView) {
            let progress = Self.progress(in: scrollView)
            lastProgress = progress
            guard pendingResume == nil else { return }
            onProgress?(progress)
        }

        // MARK: - Restoring

        private func scheduleRestore(in scrollView: UIScrollView) {
            guard pendingResume != nil else { return }
            restore?.cancel()
            restore = Task { @MainActor [weak self] in
                for delay in Self.restoreDelays {
                    if delay > 0 {
                        try? await Task.sleep(for: .seconds(delay))
                    }
                    guard let self, !Task.isCancelled, let target = self.pendingResume else {
                        return
                    }
                    Self.scroll(scrollView, to: target)
                }
                // The window is over: whatever height the page settled at is the one the
                // reader has. Reporting resumes, so their next scroll is recorded.
                guard let self, !Task.isCancelled else { return }
                self.pendingResume = nil
                self.lastProgress = Self.progress(in: scrollView)
            }
        }

        private static func scroll(_ scrollView: UIScrollView, to progress: Double) {
            let distance = scrollableDistance(in: scrollView)
            guard distance > 1 else { return }
            let top = -scrollView.adjustedContentInset.top
            scrollView.setContentOffset(
                CGPoint(x: 0, y: top + distance * ReadingProgressRule.clamp(progress)),
                animated: false
            )
        }

        /// A fraction of the *scrollable* body, which is what the server's number means: 0 is
        /// the first line on screen and 1 is the last line on screen, not the last pixel of
        /// content sitting under the bottom edge.
        private static func progress(in scrollView: UIScrollView) -> Double {
            let distance = scrollableDistance(in: scrollView)
            guard distance > 1 else { return 0 }
            let offset = scrollView.contentOffset.y + scrollView.adjustedContentInset.top
            return ReadingProgressRule.clamp(offset / distance)
        }

        private static func scrollableDistance(in scrollView: UIScrollView) -> Double {
            let visible = scrollView.bounds.height
                - scrollView.adjustedContentInset.top
                - scrollView.adjustedContentInset.bottom
            return max(0, scrollView.contentSize.height - visible)
        }
    }
}
