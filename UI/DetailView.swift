import SwiftUI
import Photos

struct DetailView: View {
    @Environment(\.modelContext) private var modelContext
    let screenshot: Screenshot
    
    @State private var fullImage: UIImage? = nil
    @State private var isEditingTags = false
    @State private var newTag = ""
    
    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 20) {
                // Image Preview
                if let image = fullImage {
                    Image(uiImage: image)
                        .resizable()
                        .aspectRatio(contentMode: .fit)
                        .clipShape(RoundedRectangle(cornerRadius: 20))
                        .shadow(radius: 10)
                } else {
                    Rectangle()
                        .fill(Color(.secondarySystemFill))
                        .aspectRatio(16/9, contentMode: .fit)
                        .clipShape(RoundedRectangle(cornerRadius: 20))
                        .overlay(ProgressView())
                }
                
                // Analysis Info
                VStack(alignment: .leading, spacing: 16) {
                    HStack {
                        VStack(alignment: .leading) {
                            Text(screenshot.category)
                                .font(.caption)
                                .fontWeight(.bold)
                                .foregroundStyle(.blue)
                                .textCase(.uppercase)
                            
                            Text(screenshot.createdAt.formatted(date: .long, time: .short))
                                .font(.subheadline)
                                .foregroundStyle(.secondary)
                        }
                        Spacer()
                        if screenshot.isSensitive {
                            Label("Sensitive Info", systemImage: "shield.fill")
                                .font(.caption)
                                .fontWeight(.bold)
                                .foregroundStyle(.orange)
                                .padding(8)
                                .background(Color.orange.opacity(0.1))
                                .clipShape(Capsule())
                        }
                    }
                    
                    Text(screenshot.summary)
                        .font(.title3)
                        .fontWeight(.semibold)
                    
                    Divider()
                    
                    // Tags
                    VStack(alignment: .leading, spacing: 10) {
                        Text("Tags")
                            .font(.headline)
                        
                        FlowLayout(spacing: 8) {
                            ForEach(screenshot.tags, id: \.self) { tag in
                                Text(tag)
                                    .font(.caption)
                                    .padding(.horizontal, 12)
                                    .padding(.vertical, 6)
                                    .background(Color.blue.opacity(0.1))
                                    .foregroundStyle(.blue)
                                    .clipShape(Capsule())
                            }
                            
                            Button { isEditingTags = true } label: {
                                Image(systemName: "plus.circle.fill")
                                    .foregroundStyle(.blue)
                            }
                        }
                    }
                    
                    Divider()
                    
                    // Entities
                    VStack(alignment: .leading, spacing: 12) {
                        Text("Extracted Entities")
                            .font(.headline)
                        
                        EntityRow(title: "Dates", values: screenshot.entities.dates)
                        EntityRow(title: "Amounts", values: screenshot.entities.amounts)
                        if let merchant = screenshot.entities.merchant {
                            EntityRow(title: "Merchant", values: [merchant])
                        }
                        EntityRow(title: "URLs", values: screenshot.entities.urls)
                        EntityRow(title: "Emails", values: screenshot.entities.emails)
                    }
                    
                    Divider()
                    
                    // OCR Text
                    VStack(alignment: .leading, spacing: 10) {
                        Text("Full Text")
                            .font(.headline)
                        
                        Text(screenshot.ocrText)
                            .font(.callout)
                            .foregroundStyle(.secondary)
                            .padding()
                            .frame(maxWidth: .infinity, alignment: .leading)
                            .background(Color(.secondarySystemBackground))
                            .clipShape(RoundedRectangle(cornerRadius: 12))
                    }
                }
                .padding()
            }
        }
        .navigationTitle("Details")
        .navigationBarTitleDisplayMode(.inline)
        .task {
            await loadFullImage()
        }
        .alert("Add Tag", isPresented: $isEditingTags) {
            TextField("Tag name", text: $newTag)
            Button("Cancel", role: .cancel) { newTag = "" }
            Button("Add") {
                if !newTag.isEmpty {
                    screenshot.tags.append(newTag)
                    newTag = ""
                }
            }
        }
    }
    
    private func loadFullImage() async {
        let assets = PHAsset.fetchAssets(withLocalIdentifiers: [screenshot.sourceId], options: nil)
        guard let asset = assets.firstObject else { return }
        
        let manager = PHImageManager.default()
        let options = PHImageRequestOptions()
        options.isNetworkAccessAllowed = true
        options.deliveryMode = .highQualityFormat
        
        manager.requestImage(for: asset, targetSize: PHImageManagerMaximumSize, contentMode: .aspectFit, options: options) { image, _ in
            self.fullImage = image
        }
    }
}

struct EntityRow: View {
    let title: String
    let values: [String]
    
    var body: some View {
        if !values.isEmpty {
            HStack(alignment: .top) {
                Text(title)
                    .font(.caption)
                    .fontWeight(.bold)
                    .foregroundStyle(.secondary)
                    .frame(width: 80, alignment: .leading)
                
                VStack(alignment: .leading, spacing: 4) {
                    ForEach(values, id: \.self) { value in
                        Text(value)
                            .font(.caption)
                            .foregroundStyle(.primary)
                    }
                }
            }
        }
    }
}

// Simple FlowLayout for tags
struct FlowLayout: Layout {
    var spacing: CGFloat
    
    func sizeThatFits(proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) -> CGSize {
        let result = layout(proposal: proposal, subviews: subviews)
        return result.size
    }
    
    func placeSubviews(in bounds: CGRect, proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) {
        _ = layout(proposal: proposal, subviews: subviews, bounds: bounds)
    }
    
    private func layout(proposal: ProposedViewSize, subviews: Subviews, bounds: CGRect? = nil) -> (size: CGSize, positions: [CGPoint]) {
        var size = CGSize.zero
        var positions = [CGPoint]()
        var x: CGFloat = bounds?.minX ?? 0
        var y: CGFloat = bounds?.minY ?? 0
        var lineHeight: CGFloat = 0
        
        for subview in subviews {
            let subviewSize = subview.sizeThatFits(.unspecified)
            if x + subviewSize.width > (proposal.width ?? .infinity) {
                x = bounds?.minX ?? 0
                y += lineHeight + spacing
                lineHeight = 0
            }
            positions.append(CGPoint(x: x, y: y))
            x += subviewSize.width + spacing
            lineHeight = max(lineHeight, subviewSize.height)
            size.width = max(size.width, x)
            size.height = max(size.height, y + lineHeight)
        }
        
        if let bounds = bounds {
            for (index, subview) in subviews.enumerated() {
                subview.place(at: positions[index], proposal: .unspecified)
            }
        }
        
        return (size, positions)
    }
}
