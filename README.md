# AI Screenshot Organizer (School Project)

A production-ready web application that intelligently organizes your screenshots using Google's Gemini AI.

## 🚀 Features

- **AI Analysis**: Automatically extracts text (OCR), classifies content, identifies entities (dates, amounts, URLs), and generates summaries/tags.
- **Local Persistence**: Uses **IndexedDB** to store all your data (images + metadata) directly in your browser. No backend required.
- **Semantic Search**: Search your screenshots "by meaning" using vector embeddings.
- **AI Chat (RAG)**: Ask questions about your screenshots in natural language.
- **Premium UI**: Modern dark-themed interface with smooth animations and micro-interactions.
- **Mock Mode**: Works even without an API key by simulating AI responses.

## 🛠️ Tech Stack

- **Vite + React + TypeScript**
- **Tailwind CSS** (v4)
- **IndexedDB** (via `idb`)
- **Gemini AI** (via `@google/genai`)
- **Motion** (for animations)
- **Lucide React** (for icons)

## 📦 Setup Instructions

1. **Install Dependencies**:
   ```bash
   npm install
   ```

2. **Configure Environment Variables**:
   Create a `.env` file in the root directory and add your Gemini API key:
   ```env
   VITE_GEMINI_API_KEY=your_api_key_here
   ```
   *Note: If you don't provide a key, the app will automatically enter **Mock Mode**.*

3. **Run Development Server**:
   ```bash
   npm run dev
   ```

4. **Open the App**:
   Navigate to `http://localhost:3000` in your browser.

## 💡 How to Use

1. **Upload**: Drag and drop screenshots into the sidebar or use the file picker.
2. **Analyze**: The AI will automatically process the images. You'll see "AI is analyzing..." during this phase.
3. **Explore**: Use the category filters or search bar to find specific screenshots.
4. **Chat**: Click the floating Sparkles button in the bottom right to ask questions like "What was the total of my last receipt?" or "Find the screenshot with the flight booking."
5. **Re-analyze**: If an analysis fails or you want to refresh it, hover over a card and click the refresh icon.

## 🔒 Privacy & Security

- **Local Storage**: Your images and OCR text are stored locally on your device.
- **API Safety**: The app uses Gemini's safety filters to detect sensitive information (passwords, bank details) and flags them with a shield icon.

---
*Built for a school project demonstration.*
