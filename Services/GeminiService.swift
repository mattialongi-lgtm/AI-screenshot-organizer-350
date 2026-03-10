import Foundation

class GeminiService {
    static let shared = GeminiService()
    
    private var apiKey: String? {
        // In a real app, fetch from Keychain
        UserDefaults.standard.string(forKey: "GEMINI_API_KEY")
    }
    
    var isEnabled: Bool {
        apiKey != nil && UserDefaults.standard.bool(forKey: "cloudAIEnabled")
    }
    
    func analyze(text: String, imageData: Data?) async throws -> AnalysisResult {
        guard let key = apiKey else { throw NSError(domain: "Gemini", code: 401, userInfo: nil) }
        
        let prompt = """
        Analyze this screenshot content. 
        OCR Text: \(text)
        
        Return a JSON object with:
        - summary: 1-2 lines
        - category: One of [Chat, Receipt, Social Media, Email, Document, Meme, Banking, E-commerce, Booking, Other]
        - tags: array of 5-10 strings
        - entities: object with { dates: [], amounts: [], merchant: string, urls: [], emails: [], phones: [], orderIds: [] }
        - isSensitive: boolean (true if contains credentials, bank details, or private info)
        """
        
        // Simplified API call logic
        let url = URL(string: "https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=\(key)")!
        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.addValue("application/json", forHTTPHeaderField: "Content-Type")
        
        let payload: [String: Any] = [
            "contents": [
                ["parts": [["text": prompt]]]
            ],
            "generationConfig": [
                "responseMimeType": "application/json"
            ]
        ]
        
        request.httpBody = try JSONSerialization.data(withJSONObject: payload)
        
        let (data, _) = try await URLSession.shared.data(for: request)
        let response = try JSONDecoder().decode(GeminiResponse.self, from: data)
        
        guard let jsonString = response.candidates.first?.content.parts.first?.text else {
            throw NSError(domain: "Gemini", code: 500, userInfo: nil)
        }
        
        return try JSONDecoder().decode(AnalysisResult.self, from: jsonString.data(using: .utf8)!)
    }
    
    func generateEmbedding(text: String) async throws -> [Float] {
        guard let key = apiKey else { throw NSError(domain: "Gemini", code: 401, userInfo: nil) }
        
        let url = URL(string: "https://generativelanguage.googleapis.com/v1beta/models/text-embedding-004:embedContent?key=\(key)")!
        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.addValue("application/json", forHTTPHeaderField: "Content-Type")
        
        let payload: [String: Any] = [
            "model": "models/text-embedding-004",
            "content": ["parts": [["text": text]]]
        ]
        
        request.httpBody = try JSONSerialization.data(withJSONObject: payload)
        
        let (data, _) = try await URLSession.shared.data(for: request)
        let response = try JSONDecoder().decode(EmbeddingResponse.self, from: data)
        return response.embedding.values
    }
}

struct AnalysisResult: Codable {
    var summary: String
    var category: String
    var tags: [String]
    var entities: ScreenshotEntities
    var isSensitive: Bool
}

struct GeminiResponse: Codable {
    struct Candidate: Codable {
        struct Content: Codable {
            struct Part: Codable {
                var text: String
            }
            var parts: [Part]
        }
        var content: Content
    }
    var candidates: [Candidate]
}

struct EmbeddingResponse: Codable {
    struct Embedding: Codable {
        var values: [Float]
    }
    var embedding: Embedding
}
