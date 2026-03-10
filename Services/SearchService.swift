import Foundation
import SwiftData

class SearchService {
    static let shared = SearchService()
    
    func search(query: String, in screenshots: [Screenshot]) -> [Screenshot] {
        guard !query.isEmpty else { return screenshots }
        
        let lowerQuery = query.lowercased()
        
        // Hybrid scoring
        var scored = screenshots.map { screenshot -> (Screenshot, Double) in
            var score: Double = 0
            
            // Keyword matches
            if screenshot.ocrText.lowercased().contains(lowerQuery) { score += 10 }
            if screenshot.summary.lowercased().contains(lowerQuery) { score += 15 }
            if screenshot.tags.contains(where: { $0.lowercased().contains(lowerQuery) }) { score += 12 }
            if screenshot.category.lowercased().contains(lowerQuery) { score += 8 }
            
            // Recency bonus
            let daysOld = Date().timeIntervalSince(screenshot.createdAt) / 86400
            score += max(0, 5 - (daysOld / 30)) // Up to 5 points for recent items
            
            return (screenshot, score)
        }
        
        // Filter out zero scores
        scored = scored.filter { $0.1 > 0 }
        
        // Sort by score
        return scored.sorted { $0.1 > $1.1 }.map { $0.0 }
    }
    
    func semanticSearch(query: String, in screenshots: [Screenshot]) async -> [Screenshot] {
        guard GeminiService.shared.isEnabled else { return search(query: query, in: screenshots) }
        
        do {
            let queryEmbedding = try await GeminiService.shared.generateEmbedding(text: query)
            
            var scored = screenshots.compactMap { screenshot -> (Screenshot, Float)? in
                guard let itemEmbedding = screenshot.embedding else { return nil }
                let similarity = cosineSimilarity(queryEmbedding, itemEmbedding)
                return (screenshot, similarity)
            }
            
            return scored.sorted { $0.1 > $1.1 }.map { $0.0 }
        } catch {
            return search(query: query, in: screenshots)
        }
    }
    
    private func cosineSimilarity(_ a: [Float], _ b: [Float]) -> Float {
        guard a.count == b.count else { return 0 }
        var dotProduct: Float = 0
        var normA: Float = 0
        var normB: Float = 0
        for i in 0..<a.count {
            dotProduct += a[i] * b[i]
            normA += a[i] * a[i]
            normB += b[i] * b[i]
        }
        return dotProduct / (sqrt(normA) * sqrt(normB))
    }
}
