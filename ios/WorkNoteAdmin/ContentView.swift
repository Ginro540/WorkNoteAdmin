import SwiftUI

struct ContentView: View {
    @State private var model = WebViewModel()

    var body: some View {
        ZStack {
            WebView(model: model)
                .ignoresSafeArea(.container, edges: .bottom)
            if let message = model.errorMessage {
                VStack(spacing: 16) {
                    Image(systemName: "wifi.exclamationmark")
                        .font(.system(size: 44))
                        .foregroundStyle(.secondary)
                    Text("ワークノート管理を開けません")
                        .font(.headline)
                    Text(message)
                        .font(.subheadline)
                        .foregroundStyle(.secondary)
                        .multilineTextAlignment(.center)
                    Button("もう一度読み込む") { model.reload() }
                        .buttonStyle(.borderedProminent)
                }
                .padding(32)
                .frame(maxWidth: .infinity, maxHeight: .infinity)
                .background(.background)
            }
            if model.isFirstLoading {
                ProgressView()
                    .controlSize(.large)
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
                    .background(.background)
            }
        }
        .onReceive(NotificationCenter.default.publisher(for: .reloadWebView)) { _ in model.reload() }
    }
}
