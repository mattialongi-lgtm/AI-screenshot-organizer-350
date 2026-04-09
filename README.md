# AI Screenshot Organizer (Apple Native)

A production-quality SwiftUI application for iOS and macOS that intelligently organizes screenshots using Apple's Vision framework and OpenAI.

## 🚀 Features

### 1. Photos Auto-Import (PhotoKit)
- **Smart Detection**: Automatically identifies screenshots in your Photos library.
- **Auto-Import**: Observes library changes using `PHPhotoLibraryChangeObserver` to process new screenshots in the background.
- **Manual Scan**: Trigger a full library scan from the Sources view.

### 2. AI Analysis Pipeline
- **On-Device OCR**: Uses Apple's **Vision** framework (`VNRecognizeTextRequest`) for fast, private text extraction.
- **Hybrid AI (OpenAI)**: 
  - **Summarization**: Generates 1-2 line summaries of screenshot content.
  - **Classification**: Categorizes into Chat, Receipt, Social Media, etc.
  - **Entity Extraction**: Identifies dates, amounts, URLs, and emails.
  - **Sensitive Detection**: Flags screenshots containing credentials or financial info.
- **Privacy First**: OCR always happens on-device. Cloud AI is optional and requires a user-provided API key.

### 3. Advanced Search & Chat
- **Hybrid Search**: Combines keyword matching with semantic relevance.
- **Semantic Search**: Uses OpenAI embeddings for "search by meaning."
- **AI Chat (RAG)**: Ask questions about your screenshots. The app retrieves relevant context and provides answers with visual references.

### 4. Premium SwiftUI Design
- **Modern Grid**: Responsive layout with smooth animations and micro-interactions.
- **Detail View**: Full image preview with interactive tags and extracted metadata.
- **Sources View**: Centralized control for permissions, auto-import, and AI settings.

## 🛠️ Tech Stack
- **Language**: Swift 5.10+
- **Framework**: SwiftUI
- **Persistence**: SwiftData (Core Data successor)
- **AI**: Vision (OCR), OpenAI API (Analysis, Chat, and Embeddings)
- **Automation**: PhotoKit Change Observation, Background Tasks

## 📦 Project Structure
- `App/`: Main entry point and app configuration.
- `Models/`: SwiftData models and supporting structures.
- `Services/`: Core logic for Photos, OCR, AI, and Search.
- `UI/`: Modular SwiftUI views for the library, details, and chat.

## 🚦 How to Run
1. Open the project in **Xcode 15+**.
2. Ensure you are targeting **iOS 17+** or **macOS 14+**.
3. Run the app on a physical device for the best Photos library experience.
4. **Permissions**: Grant Photos access when prompted.
5. **AI Setup**: Go to **Sources** to connect Google Drive or upload screenshots manually, then add your OpenAI API key.

## 🔒 Privacy Notes
- All image processing for OCR is performed locally on your device.
- Images are never uploaded to the cloud unless Cloud-Enhanced AI is enabled.
- API keys are stored securely in the app's local storage (Keychain recommended for production).

---
*Built for a school project demonstration.*
