import SwiftUI
import SwiftData

struct SourcesView: View {
    @Environment(\.dismiss) private var dismiss
    @Environment(\.modelContext) private var modelContext
    
    @State private var photoService = PhotoImportService()
    @AppStorage("cloudAIEnabled") private var cloudAIEnabled = false
    @State private var apiKey = UserDefaults.standard.string(forKey: "GEMINI_API_KEY") ?? ""
    @State private var isSavingKey = false
    
    var body: some View {
        NavigationStack {
            List {
                Section("Photos Library") {
                    HStack {
                        VStack(alignment: .leading) {
                            Text("Auto-Import Screenshots")
                                .font(.headline)
                            Text("Automatically process new screenshots as they are added to your Photos library.")
                                .font(.caption)
                                .foregroundStyle(.secondary)
                        }
                        Spacer()
                        Toggle("", isOn: $photoService.isAutoImportEnabled)
                            .labelsHidden()
                    }
                    
                    Button {
                        photoService.requestPermission { granted in
                            if granted {
                                photoService.setContext(modelContext)
                                photoService.scanForScreenshots()
                            }
                        }
                    } label: {
                        HStack {
                            Text("Scan Photos Library Now")
                            Spacer()
                            if photoService.isScanning {
                                ProgressView()
                            } else {
                                Image(systemName: "magnifyingglass")
                            }
                        }
                    }
                    .disabled(photoService.isScanning)
                }
                
                Section("AI Settings") {
                    Toggle("Enable Cloud-Enhanced AI", isOn: $cloudAIEnabled)
                    
                    if cloudAIEnabled {
                        VStack(alignment: .leading, spacing: 8) {
                            Text("Gemini API Key")
                                .font(.caption)
                                .fontWeight(.bold)
                                .foregroundStyle(.secondary)
                            
                            SecureField("Enter API Key", text: $apiKey)
                                .textFieldStyle(.roundedBorder)
                            
                            Button("Save API Key") {
                                UserDefaults.standard.set(apiKey, forKey: "GEMINI_API_KEY")
                                isSavingKey = true
                                DispatchQueue.main.asyncAfter(deadline: .now() + 1) {
                                    isSavingKey = false
                                }
                            }
                            .buttonStyle(.borderedProminent)
                            .disabled(apiKey.isEmpty)
                            
                            if isSavingKey {
                                Text("Key saved successfully!")
                                    .font(.caption)
                                    .foregroundStyle(.green)
                            }
                        }
                        .padding(.vertical, 4)
                    }
                    
                    Text("Privacy Note: OCR is always performed on-device. Cloud AI is only used for summarization and entity extraction if enabled.")
                        .font(.caption2)
                        .foregroundStyle(.secondary)
                }
                
                Section("iCloud Drive") {
                    Button {
                        // Document picker implementation would go here
                    } label: {
                        Label("Import from iCloud Drive", systemImage: "folder.badge.plus")
                    }
                }
            }
            .navigationTitle("Sources & AI")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .navigationBarTrailing) {
                    Button("Done") { dismiss() }
                }
            }
            .onAppear {
                photoService.setContext(modelContext)
            }
        }
    }
}
