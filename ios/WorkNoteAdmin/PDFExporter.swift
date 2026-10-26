import UIKit
import WebKit

/// 表示中のページを A4 縦の PDF にする（Web 側の印刷用 CSS が使われる）
enum PDFExporter {
    /// A4（pt）
    static let paper = CGRect(x: 0, y: 0, width: 595.2, height: 841.8)
    /// 余白 14mm
    static let margin: CGFloat = 14 / 25.4 * 72

    @MainActor
    static func export(webView: WKWebView, fileName: String) throws -> URL {
        let renderer = UIPrintPageRenderer()
        renderer.addPrintFormatter(webView.viewPrintFormatter(), startingAtPageAt: 0)
        renderer.setValue(NSValue(cgRect: paper), forKey: "paperRect")
        renderer.setValue(NSValue(cgRect: paper.insetBy(dx: margin, dy: margin)), forKey: "printableRect")

        let data = NSMutableData()
        UIGraphicsBeginPDFContextToData(data, paper, nil)
        renderer.prepare(forDrawingPages: NSRange(location: 0, length: renderer.numberOfPages))
        for page in 0..<renderer.numberOfPages {
            UIGraphicsBeginPDFPage()
            renderer.drawPage(at: page, in: UIGraphicsGetPDFContextBounds())
        }
        UIGraphicsEndPDFContext()

        let safeName = fileName.replacingOccurrences(of: "/", with: "-")
        let url = FileManager.default.temporaryDirectory.appendingPathComponent(safeName)
        try data.write(to: url, options: .atomic)
        return url
    }
}
