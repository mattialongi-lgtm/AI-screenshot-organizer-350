import SwiftUI
import SwiftData

struct LibraryView: View {
    @Environment(\.modelContext) private var modelContext
    @Query(sort: \Screenshot.createdAt, order: .reverse) private var screenshots: [Screenshot]
    
    @State private var searchText = ""
    @State private var selectedCategory: String? = nil
    @State private var isShowingSources = false
    @State private var isShowingChat = false
    
    var filteredScreenshots: [Screenshot] {
        var result = screenshots
        if let category = selectedCategory {
            result = result.filter { $0.category == category }
        }
        if !searchText.isEmpty {
            result = SearchService.shared.search(query: searchText, in: result)
        }
        return result
    }
    
    let columns = [
        GridItem(.adaptive(minimum: 160), spacing: 16)
    ]
    
    var body: some View {
        NavigationStack {
            ZStack {
                Color(.systemGroupedBackground).ignoresSafeArea()
                
                ScrollView {
                    VStack(spacing: 20) {
                        // Category Pills
                        ScrollView(.horizontal, showsIndicators: false) {
                            HStack(spacing: 10) {
                                CategoryPill(title: "All", isSelected: selectedCategory == nil) {
                                    selectedCategory = nil
                                }
                                
                                ForEach(ScreenshotCategory.allCases, id: \.self) { category in
                                    CategoryPill(title: category.rawValue, isSelected: selectedCategory == category.rawValue) {
                                        selectedCategory = category.rawValue
                                    }
                                }
                            }
                            .padding(.horizontal)
                        }
                        
                        // Grid
                        LazyVGrid(columns: columns, spacing: 16) {
                            ForEach(filteredScreenshots) { screenshot in
                                NavigationLink(destination: DetailView(screenshot: screenshot)) {
                                    ScreenshotCard(screenshot: screenshot)
                                }
                            }
                        }
                        .padding(.horizontal)
                    }
                    .padding(.vertical)
                }
            }
            .navigationTitle("Screenshots")
            .searchable(text: $searchText, prompt: "Search by meaning or content...")
            .toolbar {
                ToolbarItem(placement: .navigationBarLeading) {
                    Button { isShowingSources = true } label: {
                        Image(systemName: "icloud")
                    }
                }
                ToolbarItem(placement: .navigationBarTrailing) {
                    Button { isShowingChat = true } label: {
                        Image(systemName: "sparkles")
                            .font(.headline)
                            .foregroundStyle(.blue)
                    }
                }
            }
            .sheet(isPresented: $isShowingSources) {
                SourcesView()
            }
            .sheet(isPresented: $isShowingChat) {
                ChatView(screenshots: screenshots)
            }
        }
    }
}

struct CategoryPill: View {
    let title: String
    let isSelected: Bool
    let action: () -> Void
    
    var body: some View {
        Button(action: action) {
            Text(title)
                .font(.subheadline)
                .fontWeight(.medium)
                .padding(.horizontal, 16)
                .padding(.vertical, 8)
                .background(isSelected ? Color.blue : Color(.secondarySystemGroupedBackground))
                .foregroundStyle(isSelected ? .white : .primary)
                .clipShape(Capsule())
                .shadow(color: .black.opacity(0.05), radius: 2, y: 1)
        }
    }
}

struct ScreenshotCard: View {
    let screenshot: Screenshot
    
    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            ZStack(alignment: .topTrailing) {
                if let data = screenshot.thumbnailData, let uiImage = UIImage(data: data) {
                    Image(uiImage: uiImage)
                        .resizable()
                        .aspectRatio(contentMode: .fill)
                        .frame(height: 180)
                        .clipShape(RoundedRectangle(cornerRadius: 16))
                } else {
                    Rectangle()
                        .fill(Color(.secondarySystemFill))
                        .frame(height: 180)
                        .clipShape(RoundedRectangle(cornerRadius: 16))
                        .overlay(Image(systemName: "photo").foregroundStyle(.secondary))
                }
                
                if screenshot.isSensitive {
                    Image(systemName: "shield.fill")
                        .foregroundStyle(.orange)
                        .padding(8)
                        .background(.ultraThinMaterial)
                        .clipShape(Circle())
                        .padding(8)
                }
            }
            
            VStack(alignment: .leading, spacing: 4) {
                Text(screenshot.category)
                    .font(.caption2)
                    .fontWeight(.bold)
                    .foregroundStyle(.blue)
                    .textCase(.uppercase)
                
                Text(screenshot.summary.isEmpty ? "Analyzing..." : screenshot.summary)
                    .font(.caption)
                    .fontWeight(.medium)
                    .lineLimit(2)
                    .foregroundStyle(.primary)
            }
            .padding(.horizontal, 4)
        }
        .padding(8)
        .background(Color(.secondarySystemGroupedBackground))
        .clipShape(RoundedRectangle(cornerRadius: 20))
        .shadow(color: .black.opacity(0.05), radius: 5, y: 2)
    }
}
