import Foundation
import Photos
import SwiftData

class AnalysisPipeline {
    static let shared = AnalysisPipeline()
    
    func process(_ screenshot: Screenshot) async {
        do {
            // 1. Get Image Data
            guard let imageData = await fetchImageData(for: screenshot.sourceId) else { return }
            
            // 2. OCR (Always on-device)
            let text = try await OCRService.shared.recognizeText(from: imageData)
            screenshot.ocrText = text
            
            // 3. AI Analysis (Hybrid)
            if GeminiService.shared.isEnabled {
                let result = try await GeminiService.shared.analyze(text: text, imageData: imageData)
                screenshot.summary = result.summary
                screenshot.category = result.category
                screenshot.tags = result.tags
                screenshot.entities = result.entities
                screenshot.isSensitive = result.isSensitive
                
                // 4. Embedding
                let embedding = try await GeminiService.shared.generateEmbedding(text: "\(result.summary) \(text)")
                screenshot.embedding = embedding
            } else {
                // Fallback: Local heuristics
                screenshot.summary = "Screenshot from \(screenshot.createdAt.formatted())"
                screenshot.category = detectCategoryLocally(text)
                screenshot.tags = ["Imported"]
            }
            
            screenshot.lastAnalyzedAt = Date()
            
        } catch {
            print("Analysis failed for \(screenshot.id): \(error)")
        }
    }
    
    private func fetchImageData(for localId: String) async -> Data? {
        return await withCheckedContinuation { continuation in
            let assets = PHAsset.fetchAssets(withLocalIdentifiers: [localId], options: nil)
            guard let asset = assets.firstObject else {
                continuation.resume(returning: nil)
                return
            }
            
            let options = PHImageRequestOptions()
            options.isNetworkAccessAllowed = true
            options.deliveryMode = .highQualityFormat
            
            PHImageManager.default().requestImageDataAndOrientation(for: asset, options: options) { data, _, _, _ in
                continuation.resume(returning: data)
            }
        }
    }
    
    private func detectCategoryLocally(_ text: String) -> String {
        let lower = text.lowercased()
        if lower.contains("total") || lower.contains("tax") || lower.contains("$") {
            return "Receipt"
        }
        if lower.contains("http") || lower.contains("www") {
            return "Social Media"
        }
        return "Other"
    }
}
