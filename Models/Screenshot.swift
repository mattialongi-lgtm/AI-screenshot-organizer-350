import Foundation
import SwiftData
import SwiftUI

@Model
final class Screenshot {
    @Attribute(.unique) var id: UUID
    var createdAt: Date
    var source: String // "Photos" or "iCloudDrive"
    var sourceId: String // localIdentifier for Photos, URL for iCloud
    
    @Attribute(.externalStorage) var thumbnailData: Data?
    var ocrText: String
    var summary: String
    var category: String
    var tags: [String]
    
    // Entities stored as JSON string for simplicity in SwiftData
    var entitiesJSON: String
    
    var embedding: [Float]?
    var lastAnalyzedAt: Date?
    var isSensitive: Bool
    var safetyReason: String?
    
    init(
        id: UUID = UUID(),
        createdAt: Date = Date(),
        source: String,
        sourceId: String,
        thumbnailData: Data? = nil,
        ocrText: String = "",
        summary: String = "",
        category: String = "Other",
        tags: [String] = [],
        entitiesJSON: String = "{}",
        isSensitive: Bool = false
    ) {
        self.id = id
        self.createdAt = createdAt
        self.source = source
        self.sourceId = sourceId
        self.thumbnailData = thumbnailData
        self.ocrText = ocrText
        self.summary = summary
        self.category = category
        self.tags = tags
        self.entitiesJSON = entitiesJSON
        self.isSensitive = isSensitive
    }
    
    var entities: ScreenshotEntities {
        get {
            guard let data = entitiesJSON.data(using: .utf8) else { return ScreenshotEntities() }
            return (try? JSONDecoder().decode(ScreenshotEntities.self, from: data)) ?? ScreenshotEntities()
        }
        set {
            if let data = try? JSONEncoder().encode(newValue) {
                entitiesJSON = String(data: data, encoding: .utf8) ?? "{}"
            }
        }
    }
}

struct ScreenshotEntities: Codable {
    var dates: [String] = []
    var amounts: [String] = []
    var merchant: String?
    var urls: [String] = []
    var emails: [String] = []
    var phones: [String] = []
    var orderIds: [String] = []
}

enum ScreenshotCategory: String, CaseIterable, Codable {
    case chat = "Chat"
    case receipt = "Receipt"
    case social = "Social Media"
    case email = "Email"
    case document = "Document"
    case meme = "Meme"
    case banking = "Banking"
    case ecommerce = "E-commerce"
    case booking = "Booking"
    case other = "Other"
}
