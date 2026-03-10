import SwiftUI
import SwiftData

struct ChatView: View {
    @Environment(\.dismiss) private var dismiss
    let screenshots: [Screenshot]
    
    @State private var messages: [ChatMessage] = [
        ChatMessage(role: .assistant, content: "Hi! I can help you find information in your screenshots. What are you looking for?")
    ]
    @State private var input = ""
    @State private var isThinking = false
    
    var body: some View {
        NavigationStack {
            VStack {
                ScrollViewReader { proxy in
                    ScrollView {
                        VStack(spacing: 16) {
                            ForEach(messages) { message in
                                ChatBubble(message: message)
                            }
                            
                            if isThinking {
                                HStack {
                                    ProgressView()
                                        .padding()
                                    Spacer()
                                }
                            }
                        }
                        .padding()
                    }
                    .onChange(of: messages.count) { _ in
                        withAnimation {
                            proxy.scrollTo(messages.last?.id, anchor: .bottom)
                        }
                    }
                }
                
                // Input area
                VStack(spacing: 0) {
                    Divider()
                    HStack(spacing: 12) {
                        TextField("Ask about your screenshots...", text: $input, axis: .vertical)
                            .padding(12)
                            .background(Color(.secondarySystemBackground))
                            .clipShape(RoundedRectangle(cornerRadius: 20))
                            .lineLimit(1...5)
                        
                        Button {
                            sendMessage()
                        } label: {
                            Image(systemName: "arrow.up.circle.fill")
                                .font(.system(size: 32))
                                .foregroundStyle(input.isEmpty ? .secondary : .blue)
                        }
                        .disabled(input.isEmpty || isThinking)
                    }
                    .padding()
                }
            }
            .navigationTitle("Ask AI")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .navigationBarTrailing) {
                    Button("Close") { dismiss() }
                }
            }
        }
    }
    
    private func sendMessage() {
        let userMessage = ChatMessage(role: .user, content: input)
        messages.append(userMessage)
        let query = input
        input = ""
        isThinking = true
        
        Task {
            // 1. RAG: Retrieve relevant screenshots
            let relevant = await SearchService.shared.semanticSearch(query: query, in: screenshots)
            let context = relevant.prefix(5)
            
            // 2. Generate Answer
            var assistantContent = ""
            if context.isEmpty {
                assistantContent = "I couldn't find any screenshots related to your question."
            } else {
                // In a real app, we'd send the context to Gemini
                // For this demo, we'll simulate a response based on the context
                assistantContent = generateSimulatedResponse(query: query, context: Array(context))
            }
            
            await MainActor.run {
                messages.append(ChatMessage(role: .assistant, content: assistantContent, references: Array(context)))
                isThinking = false
            }
        }
    }
    
    private func generateSimulatedResponse(query: String, context: [Screenshot]) -> String {
        let count = context.count
        let categories = Set(context.map { $0.category }).joined(separator: ", ")
        
        return "Based on \(count) relevant screenshots (mostly \(categories)), I found that your request relates to \(context.first?.summary ?? "your data")."
    }
}

struct ChatMessage: Identifiable {
    let id = UUID()
    enum Role { case user, assistant }
    let role: Role
    let content: String
    var references: [Screenshot] = []
}

struct ChatBubble: View {
    let message: ChatMessage
    
    var body: some View {
        VStack(alignment: message.role == .user ? .trailing : .leading, spacing: 8) {
            Text(message.content)
                .padding(12)
                .background(message.role == .user ? Color.blue : Color(.secondarySystemBackground))
                .foregroundStyle(message.role == .user ? .white : .primary)
                .clipShape(RoundedRectangle(cornerRadius: 18))
            
            if !message.references.isEmpty {
                VStack(alignment: .leading, spacing: 4) {
                    Text("References:")
                        .font(.caption2)
                        .fontWeight(.bold)
                        .foregroundStyle(.secondary)
                    
                    ScrollView(.horizontal, showsIndicators: false) {
                        HStack(spacing: 8) {
                            ForEach(message.references) { screenshot in
                                if let data = screenshot.thumbnailData, let uiImage = UIImage(data: data) {
                                    Image(uiImage: uiImage)
                                        .resizable()
                                        .aspectRatio(contentMode: .fill)
                                        .frame(width: 40, height: 40)
                                        .clipShape(RoundedRectangle(cornerRadius: 8))
                                }
                            }
                        }
                    }
                }
            }
        }
        .frame(maxWidth: .infinity, alignment: message.role == .user ? .trailing : .leading)
    }
}
