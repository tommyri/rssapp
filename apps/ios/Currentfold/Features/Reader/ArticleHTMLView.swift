import SwiftUI
import WebKit

struct ArticleHTMLView: UIViewRepresentable {
    let html: String
    let baseURL: URL?

    func makeUIView(context: Context) -> WKWebView {
        let configuration = WKWebViewConfiguration()
        configuration.defaultWebpagePreferences.allowsContentJavaScript = false
        let webView = WKWebView(frame: .zero, configuration: configuration)
        webView.isOpaque = false
        webView.backgroundColor = .clear
        webView.scrollView.backgroundColor = .clear
        return webView
    }

    func updateUIView(_ webView: WKWebView, context: Context) {
        guard context.coordinator.loadedHTML != html else { return }
        context.coordinator.loadedHTML = html
        webView.loadHTMLString(document, baseURL: baseURL)
    }

    func makeCoordinator() -> Coordinator {
        Coordinator()
    }

    private var document: String {
        """
        <!doctype html>
        <html>
        <head>
          <meta name="viewport" content="width=device-width, initial-scale=1">
          <style>
            :root { color-scheme: light dark; }
            body {
              font: -apple-system-body;
              line-height: 1.58;
              margin: 0;
              padding: 20px 18px 48px;
              overflow-wrap: anywhere;
            }
            img, video, iframe { max-width: 100%; height: auto; }
            pre { overflow-x: auto; }
            a { color: #C24F36; }
          </style>
        </head>
        <body>\(html)</body>
        </html>
        """
    }

    final class Coordinator {
        var loadedHTML: String?
    }
}
