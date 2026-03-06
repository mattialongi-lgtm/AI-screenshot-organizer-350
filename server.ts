import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import multer from "multer";
import Database from "better-sqlite3";
import fs from "fs";
import { GoogleGenAI, Type } from "@google/genai";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Ensure uploads directory exists
const UPLOADS_DIR = path.join(__dirname, "uploads");
if (!fs.existsSync(UPLOADS_DIR)) {
  fs.mkdirSync(UPLOADS_DIR);
}

// Database Setup
const db = new Database("screenshots.db");
db.exec(`
  CREATE TABLE IF NOT EXISTS screenshots (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    filename TEXT NOT NULL,
    original_name TEXT NOT NULL,
    upload_date DATETIME DEFAULT CURRENT_TIMESTAMP,
    category TEXT,
    summary TEXT,
    ocr_text TEXT,
    tags TEXT,
    entities TEXT,
    language TEXT,
    embedding TEXT,
    is_sensitive INTEGER DEFAULT 0,
    source_id TEXT,
    external_id TEXT UNIQUE
  );

  CREATE TABLE IF NOT EXISTS cloud_sources (
    id TEXT PRIMARY KEY,
    type TEXT NOT NULL,
    email TEXT,
    access_token TEXT,
    refresh_token TEXT,
    last_sync DATETIME
  );
`);

const app = express();
const PORT = 3000;

app.use(express.json());
app.use("/uploads", express.static(UPLOADS_DIR));

// Google OAuth Setup
import { google } from "googleapis";

const oauth2Client = new google.auth.OAuth2(
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET,
  `${process.env.APP_URL}/api/auth/google/callback`
);

// Multer Setup
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOADS_DIR),
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
    cb(null, uniqueSuffix + path.extname(file.originalname));
  },
});
const upload = multer({ storage });

// AI Service Logic
async function analyzeScreenshot(filePath: string) {
  const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! });
  const imageData = fs.readFileSync(filePath).toString("base64");

  const response = await ai.models.generateContent({
    model: "gemini-3.1-flash-preview",
    contents: [
      {
        parts: [
          {
            inlineData: {
              mimeType: "image/png",
              data: imageData,
            },
          },
          {
            text: `Analyze this screenshot and return a JSON object with the following fields:
            - category: One of [Chat, Receipt, Social Media, Email, Document, Meme, Banking, E-commerce, Booking, Other]
            - summary: A concise 1-2 sentence summary of the content.
            - ocr_text: Full extracted text from the image.
            - tags: An array of descriptive tags.
            - entities: An object containing detected entities like dates, prices, URLs, names, order numbers.
            - language: The detected language (e.g., English, Spanish).
            - is_sensitive: Boolean, true if it contains passwords, bank details, or highly personal info.`,
          },
        ],
      },
    ],
    config: {
      responseMimeType: "application/json",
    },
  });

  return JSON.parse(response.text || "{}");
}

async function generateEmbedding(text: string) {
  const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! });
  const result = await ai.models.embedContent({
    model: "text-embedding-004",
    contents: [{ parts: [{ text }] }],
  });
  return result.embeddings[0].values;
}

// Auth Routes
app.get("/api/auth/google/url", (req, res) => {
  const url = oauth2Client.generateAuthUrl({
    access_type: "offline",
    scope: ["https://www.googleapis.com/auth/drive.readonly", "https://www.googleapis.com/auth/userinfo.email"],
    prompt: "consent",
  });
  res.json({ url });
});

app.get("/api/auth/google/callback", async (req, res) => {
  const { code } = req.query;
  try {
    const { tokens } = await oauth2Client.getToken(code as string);
    oauth2Client.setCredentials(tokens);

    const oauth2 = google.oauth2({ version: "v2", auth: oauth2Client });
    const userInfo = await oauth2.userinfo.get();

    db.prepare(`
      INSERT OR REPLACE INTO cloud_sources (id, type, email, access_token, refresh_token)
      VALUES (?, ?, ?, ?, ?)
    `).run(userInfo.data.id, "google_drive", userInfo.data.email, tokens.access_token, tokens.refresh_token);

    res.send(`
      <html>
        <body>
          <script>
            window.opener.postMessage({ type: 'AUTH_SUCCESS', source: 'google_drive' }, '*');
            window.close();
          </script>
          <p>Connected! You can close this window.</p>
        </body>
      </html>
    `);
  } catch (error) {
    console.error("Auth error:", error);
    res.status(500).send("Authentication failed");
  }
});

app.get("/api/sources", (req, res) => {
  const sources = db.prepare("SELECT id, type, email, last_sync FROM cloud_sources").all();
  res.json(sources);
});

// Sync Logic
app.post("/api/sync", async (req, res) => {
  const sources = db.prepare("SELECT * FROM cloud_sources").all();
  let totalSynced = 0;

  for (const source of sources as any) {
    if (source.type === "google_drive") {
      const auth = new google.auth.OAuth2(
        process.env.GOOGLE_CLIENT_ID,
        process.env.GOOGLE_CLIENT_SECRET
      );
      auth.setCredentials({
        access_token: source.access_token,
        refresh_token: source.refresh_token,
      });

      const drive = google.drive({ version: "v3", auth });
      const response = await drive.files.list({
        q: "mimeType contains 'image/' and name contains 'Screenshot'",
        fields: "files(id, name, mimeType)",
        pageSize: 10, // Limit for demo
      });

      const files = response.data.files || [];
      for (const file of files) {
        // Check if already synced
        const existing = db.prepare("SELECT id FROM screenshots WHERE external_id = ?").get(file.id);
        if (existing) continue;

        try {
          const fileRes = await drive.files.get({ fileId: file.id!, alt: "media" }, { responseType: "arraybuffer" });
          const buffer = Buffer.from(fileRes.data as ArrayBuffer);
          const filename = `${Date.now()}-${file.name}`;
          const filePath = path.join(UPLOADS_DIR, filename);
          fs.writeFileSync(filePath, buffer);

          const analysis = await analyzeScreenshot(filePath);
          const embedding = await generateEmbedding(analysis.summary + " " + analysis.ocr_text);

          db.prepare(`
            INSERT INTO screenshots (filename, original_name, category, summary, ocr_text, tags, entities, language, embedding, is_sensitive, source_id, external_id)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          `).run(
            filename,
            file.name,
            analysis.category,
            analysis.summary,
            analysis.ocr_text,
            JSON.stringify(analysis.tags),
            JSON.stringify(analysis.entities),
            analysis.language,
            JSON.stringify(embedding),
            analysis.is_sensitive ? 1 : 0,
            source.id,
            file.id
          );
          totalSynced++;
        } catch (err) {
          console.error(`Failed to sync file ${file.id}:`, err);
        }
      }
      db.prepare("UPDATE cloud_sources SET last_sync = CURRENT_TIMESTAMP WHERE id = ?").run(source.id);
    }
  }

  res.json({ success: true, syncedCount: totalSynced });
});

// API Routes
app.post("/api/upload", upload.single("screenshot"), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: "No file uploaded" });

    const analysis = await analyzeScreenshot(req.file.path);
    const embedding = await generateEmbedding(analysis.summary + " " + analysis.ocr_text);

    const stmt = db.prepare(`
      INSERT INTO screenshots (filename, original_name, category, summary, ocr_text, tags, entities, language, embedding, is_sensitive)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const result = stmt.run(
      req.file.filename,
      req.file.originalname,
      analysis.category,
      analysis.summary,
      analysis.ocr_text,
      JSON.stringify(analysis.tags),
      JSON.stringify(analysis.entities),
      analysis.language,
      JSON.stringify(embedding),
      analysis.is_sensitive ? 1 : 0
    );

    res.json({ id: result.lastInsertRowid, ...analysis });
  } catch (error) {
    console.error("Upload error:", error);
    res.status(500).json({ error: "Failed to process screenshot" });
  }
});

app.get("/api/screenshots", (req, res) => {
  const screenshots = db.prepare("SELECT * FROM screenshots ORDER BY upload_date DESC").all();
  res.json(screenshots);
});

app.post("/api/search", async (req, res) => {
  try {
    const { query } = req.body;
    const queryEmbedding = await generateEmbedding(query);

    // Simple cosine similarity in JS (for production use a vector DB like Pinecone or pgvector)
    const screenshots = db.prepare("SELECT * FROM screenshots").all();
    
    const results = screenshots.map((s: any) => {
      const emb = JSON.parse(s.embedding);
      const similarity = dotProduct(queryEmbedding, emb) / (magnitude(queryEmbedding) * magnitude(emb));
      return { ...s, similarity };
    });

    results.sort((a, b) => b.similarity - a.similarity);
    res.json(results.slice(0, 10));
  } catch (error) {
    res.status(500).json({ error: "Search failed" });
  }
});

app.post("/api/chat", async (req, res) => {
  try {
    const { message, contextIds } = req.body;
    const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! });

    // Fetch context from DB
    const placeholders = contextIds.map(() => "?").join(",");
    const contextScreenshots = db.prepare(`SELECT summary, ocr_text, category FROM screenshots WHERE id IN (${placeholders})`).all(contextIds);

    const contextText = contextScreenshots.map((s: any) => 
      `[Category: ${s.category}] Summary: ${s.summary}\nText: ${s.ocr_text}`
    ).join("\n---\n");

    const response = await ai.models.generateContent({
      model: "gemini-3.1-flash-preview",
      contents: [
        {
          parts: [
            {
              text: `You are an AI assistant helping a user with their screenshots. 
              Here is the context from relevant screenshots:
              ${contextText}
              
              User Question: ${message}`,
            },
          ],
        },
      ],
    });

    res.json({ text: response.text });
  } catch (error) {
    res.status(500).json({ error: "Chat failed" });
  }
});

// Helper functions for vector math
function dotProduct(a: number[], b: number[]) {
  return a.reduce((sum, val, i) => sum + val * b[i], 0);
}
function magnitude(a: number[]) {
  return Math.sqrt(a.reduce((sum, val) => sum + val * val, 0));
}

async function startServer() {
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
