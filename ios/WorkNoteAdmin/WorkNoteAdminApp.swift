import SwiftUI

/// ワークノート管理（iPad・Mac）。管理者アプリ（Web）を画面いっぱいに表示する。
@main
struct WorkNoteAdminApp: App {
    var body: some Scene {
        WindowGroup {
            ContentView()
        }
        .commands {
            CommandGroup(after: .toolbar) {
                Button("再読み込み") { NotificationCenter.default.post(name: .reloadWebView, object: nil) }
                    .keyboardShortcut("r")
            }
        }
    }
}

extension Notification.Name {
    static let reloadWebView = Notification.Name("reloadWebView")
}
