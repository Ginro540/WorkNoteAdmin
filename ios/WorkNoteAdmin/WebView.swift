import SwiftUI
import WebKit

/// 表示する管理者アプリ（Web）の URL。Info.plist の WorkNoteAdminURL。
/// 開発中は環境変数 WORKNOTE_ADMIN_URL（例: http://localhost:5173）で差し替えられる。
enum AppConfig {
    static var startURL: URL {
        if let env = ProcessInfo.processInfo.environment["WORKNOTE_ADMIN_URL"], let url = URL(string: env) { return url }
        let raw = Bundle.main.object(forInfoDictionaryKey: "WorkNoteAdminURL") as? String ?? "https://worknote-6dc51.web.app"
        return URL(string: raw)!
    }
}

@Observable @MainActor
final class WebViewModel {
    var errorMessage: String?
    var isFirstLoading = true
    @ObservationIgnored weak var webView: WKWebView?

    func reload() {
        errorMessage = nil
        if let webView, webView.url != nil {
            webView.reload()
        } else {
            webView?.load(URLRequest(url: AppConfig.startURL))
        }
    }
}

struct WebView: UIViewRepresentable {
    let model: WebViewModel

    func makeCoordinator() -> Coordinator { Coordinator(model: model) }

    func makeUIView(context: Context) -> WKWebView {
        let config = WKWebViewConfiguration()
        // ログイン状態と Firestore のオフライン保存（IndexedDB）を端末に残す
        config.websiteDataStore = .default()
        config.userContentController.add(context.coordinator, name: "printPDF")
        // Web 側で専用アプリの中かを判断できるようにする
        config.applicationNameForUserAgent = "WorkNoteAdminApp/1.0"

        let webView = WKWebView(frame: .zero, configuration: config)
        webView.navigationDelegate = context.coordinator
        webView.uiDelegate = context.coordinator
        webView.allowsBackForwardNavigationGestures = true
        #if DEBUG
        webView.isInspectable = true
        #endif
        let refresh = UIRefreshControl()
        refresh.addTarget(context.coordinator, action: #selector(Coordinator.pullToRefresh(_:)), for: .valueChanged)
        webView.scrollView.refreshControl = refresh

        model.webView = webView
        context.coordinator.webView = webView
        webView.load(URLRequest(url: AppConfig.startURL))
        return webView
    }

    func updateUIView(_ uiView: WKWebView, context: Context) {}

    final class Coordinator: NSObject, WKNavigationDelegate, WKUIDelegate, WKScriptMessageHandler {
        let model: WebViewModel
        weak var webView: WKWebView?

        init(model: WebViewModel) {
            self.model = model
        }

        @objc func pullToRefresh(_ sender: UIRefreshControl) {
            webView?.reload()
            sender.endRefreshing()
        }

        // MARK: 読み込み

        func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
            Task { @MainActor in
                model.isFirstLoading = false
                model.errorMessage = nil
            }
        }

        func webView(_ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!, withError error: Error) {
            showError(error)
        }

        func webView(_ webView: WKWebView, didFail navigation: WKNavigation!, withError error: Error) {
            showError(error)
        }

        private func showError(_ error: Error) {
            let nsError = error as NSError
            if nsError.domain == NSURLErrorDomain && nsError.code == NSURLErrorCancelled { return }
            Task { @MainActor in
                model.isFirstLoading = false
                model.errorMessage = nsError.domain == NSURLErrorDomain
                    ? "通信できません。電波の良いところでもう一度お試しください。"
                    : error.localizedDescription
            }
        }

        func webViewWebContentProcessDidTerminate(_ webView: WKWebView) {
            webView.reload()
        }

        /// 管理者アプリの中の移動はここで表示し、外のページ（地図の著作権表示・画像など）は Safari で開く
        func webView(_ webView: WKWebView, decidePolicyFor navigationAction: WKNavigationAction) async -> WKNavigationActionPolicy {
            guard let url = navigationAction.request.url else { return .cancel }
            if url.scheme == "about" || url.scheme == "blob" || url.scheme == "data" { return .allow }
            let appHost = AppConfig.startURL.host
            let allowedHosts = [appHost, "worknote-6dc51.firebaseapp.com"]
            if navigationAction.targetFrame?.isMainFrame == false || allowedHosts.contains(url.host) {
                return .allow
            }
            await UIApplication.shared.open(url)
            return .cancel
        }

        /// target="_blank" や window.open は Safari で開く
        func webView(_ webView: WKWebView, createWebViewWith configuration: WKWebViewConfiguration, for navigationAction: WKNavigationAction, windowFeatures: WKWindowFeatures) -> WKWebView? {
            if let url = navigationAction.request.url {
                UIApplication.shared.open(url)
            }
            return nil
        }

        // MARK: JavaScript の alert / confirm

        func webView(_ webView: WKWebView, runJavaScriptAlertPanelWithMessage message: String, initiatedByFrame frame: WKFrameInfo) async {
            await present { done in
                let alert = UIAlertController(title: nil, message: message, preferredStyle: .alert)
                alert.addAction(UIAlertAction(title: "OK", style: .default) { _ in done(()) })
                return alert
            }
        }

        func webView(_ webView: WKWebView, runJavaScriptConfirmPanelWithMessage message: String, initiatedByFrame frame: WKFrameInfo) async -> Bool {
            await present { done in
                let alert = UIAlertController(title: nil, message: message, preferredStyle: .alert)
                alert.addAction(UIAlertAction(title: "キャンセル", style: .cancel) { _ in done(false) })
                alert.addAction(UIAlertAction(title: "OK", style: .default) { _ in done(true) })
                return alert
            }
        }

        @MainActor
        private func present<T>(_ make: (@escaping (T) -> Void) -> UIAlertController) async -> T {
            await withCheckedContinuation { continuation in
                let alert = make { continuation.resume(returning: $0) }
                webView?.window?.rootViewController?.topMost.present(alert, animated: true)
            }
        }

        // MARK: PDF（見積書の「印刷・PDF」）

        func userContentController(_ userContentController: WKUserContentController, didReceive message: WKScriptMessage) {
            guard message.name == "printPDF", let webView else { return }
            let body = message.body as? [String: Any]
            let fileName = (body?["fileName"] as? String).flatMap { $0.isEmpty ? nil : $0 } ?? "見積書.pdf"
            Task { @MainActor in
                do {
                    let url = try PDFExporter.export(webView: webView, fileName: fileName)
                    share(url, from: webView)
                } catch {
                    let alert = UIAlertController(title: "PDF を作れませんでした", message: error.localizedDescription, preferredStyle: .alert)
                    alert.addAction(UIAlertAction(title: "OK", style: .default))
                    webView.window?.rootViewController?.topMost.present(alert, animated: true)
                }
            }
        }

        @MainActor
        private func share(_ url: URL, from webView: WKWebView) {
            let activity = UIActivityViewController(activityItems: [url], applicationActivities: nil)
            if let popover = activity.popoverPresentationController {
                popover.sourceView = webView
                popover.sourceRect = CGRect(x: webView.bounds.maxX - 80, y: webView.safeAreaInsets.top + 24, width: 1, height: 1)
                popover.permittedArrowDirections = [.up]
            }
            webView.window?.rootViewController?.topMost.present(activity, animated: true)
        }
    }
}

extension UIViewController {
    var topMost: UIViewController {
        presentedViewController?.topMost ?? self
    }
}
