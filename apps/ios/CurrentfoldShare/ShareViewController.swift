import SwiftUI
import UIKit
import UniformTypeIdentifiers

/// The share extension's entry point: pull the URL out of the share sheet's payload, hand it
/// to ``SaveToCurrentfoldModel``, and host one SwiftUI card while it answers.
///
/// A principal class rather than a storyboard, so the extension has the same shape as the rest
/// of the app: one view, described in code, on the app's own canvas.
@objc(ShareViewController)
final class ShareViewController: UIViewController {
    private var model: SaveToCurrentfoldModel?

    override func viewDidLoad() {
        super.viewDidLoad()

        let model = SaveToCurrentfoldModel(
            apiClient: ShareExtensionEnvironment.apiClient,
            credentialStore: ShareExtensionEnvironment.credentialStore,
            connection: ShareExtensionEnvironment.connection
        )
        self.model = model
        present(SaveToCurrentfoldView(model: model, close: { [weak self] in self?.finish() }))

        Task { [weak self] in
            guard let self else { return }
            await model.save(await sharedURL())
            guard model.isFinished else { return }
            // Success is the only ending that closes itself; the rest are waiting to be read.
            switch model.outcome {
            case .saved, .alreadySaved:
                try? await Task.sleep(for: SaveToCurrentfoldModel.successLinger)
                finish()
            default:
                break
            }
        }
    }

    private func present(_ root: SaveToCurrentfoldView) {
        let host = UIHostingController(rootView: root)
        addChild(host)
        host.view.translatesAutoresizingMaskIntoConstraints = false
        view.addSubview(host.view)
        NSLayoutConstraint.activate([
            host.view.topAnchor.constraint(equalTo: view.topAnchor),
            host.view.bottomAnchor.constraint(equalTo: view.bottomAnchor),
            host.view.leadingAnchor.constraint(equalTo: view.leadingAnchor),
            host.view.trailingAnchor.constraint(equalTo: view.trailingAnchor),
        ])
        host.didMove(toParent: self)
    }

    private func finish() {
        extensionContext?.completeRequest(returningItems: nil)
    }

    /// The first web address in the payload. Safari hands the page's URL over as one of these,
    /// which is the case the whole extension exists for; the activation rule in `Info.plist`
    /// means nothing else ever reaches us.
    private func sharedURL() async -> URL? {
        let items = (extensionContext?.inputItems as? [NSExtensionItem]) ?? []
        for item in items {
            for provider in item.attachments ?? []
                where provider.hasItemConformingToTypeIdentifier(UTType.url.identifier) {
                if let url = await provider.loadURL() {
                    return url
                }
            }
        }
        return nil
    }
}

@MainActor
private extension NSItemProvider {
    /// `loadObject` rather than `loadItem`, because it hands back a typed `URL` instead of an
    /// `NSSecureCoding` the caller has to guess the class of.
    ///
    /// Pinned to the main actor because an `NSItemProvider` is not `Sendable`: only the `URL`
    /// the completion produces crosses back, and that is.
    func loadURL() async -> URL? {
        await withCheckedContinuation { continuation in
            _ = loadObject(ofClass: URL.self) { url, _ in
                continuation.resume(returning: url)
            }
        }
    }
}
