// swift-tools-version: 6.0
// 従業員アプリの WorkNoteCore（Swift）で計算した結果を JSON に書き出す。
// Web 版の移植（web/src/core）が同じ結果を返すかを web/src/core/golden.test.ts で確かめる。
// 使い方（WorkNote リポジトリを隣に置く）:
//   swift run core-golden ../../web/src/core/golden.json
import PackageDescription

let package = Package(
    name: "core-golden",
    platforms: [.macOS(.v14)],
    dependencies: [.package(path: "../../../WorkNote/WorkNoteCore")],
    targets: [
        .executableTarget(name: "core-golden", dependencies: [.product(name: "WorkNoteCore", package: "WorkNoteCore")]),
    ]
)
