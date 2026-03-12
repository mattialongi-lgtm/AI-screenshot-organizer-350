import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import multer from "multer";
import pg from "pg";
const { Pool } = pg;
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
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false
  }
});

async function initDb() {
  const client = await pool.connect();
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS screenshots (
        id SERIAL PRIMARY KEY,
        filename TEXT NOT NULL,
        original_name TEXT NOT NULL,
        upload_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        category TEXT,
        summary TEXT,
        ocr_text TEXT,
        tags TEXT,
        entities TEXT,
        language TEXT,
        embedding TEXT,
        is_sensitive INTEGER DEFAULT 0,
        source_id TEXT,
        external_id TEXT UNIQUE,
        userId TEXT
      );

      CREATE TABLE IF NOT EXISTS cloud_sources (
        id TEXT PRIMARY KEY,
        type TEXT NOT NULL,
        email TEXT,
        local_path TEXT,
        access_token TEXT,
        refresh_token TEXT,
        status TEXT DEFAULT 'connected',
        connected_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        last_sync TIMESTAMP,
        settings TEXT -- JSON string
      );
    `);
  } finally {
    client.release();
  }
}

initDb().catch(console.error);

import { google } from "googleapis";
import { WebSocketServer, WebSocket } from "ws";
import http from "http";

const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ server });
const PORT = 3000;

// WebSocket connection handling
const clients = new Set<WebSocket>();
wss.on("connection", (ws) => {
  clients.add(ws);
  ws.on("close", () => clients.delete(ws));
});

function broadcast(data: any) {
  const message = JSON.stringify(data);
  clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(message);
    }
  });
}

app.use(express.json({ limit: '50mb' }));
app.use("/uploads", express.static(UPLOADS_DIR));

// Multer Setup
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOADS_DIR),
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
    cb(null, uniqueSuffix + path.extname(file.originalname));
  },
});
const upload = multer({ storage });

// iCloud Import Endpoint (called by local agent)
app.post("/api/icloud/import", upload.single("file"), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: "No file uploaded" });
    const { localPath, modifiedTime } = req.body;

    // Check if already exists
    const existingRes = await pool.query("SELECT id FROM screenshots WHERE external_id = $1", [localPath]);
    if (existingRes.rows.length > 0) {
      fs.unlinkSync(req.file.path);
      return res.json({ success: true, skipped: true });
    }

    const analysis = await analyzeScreenshot(req.file.path);
    const embedding = await generateEmbedding(analysis.summary + " " + analysis.ocr_text);

    const result = await pool.query(`
      INSERT INTO screenshots (filename, original_name, category, summary, ocr_text, tags, entities, language, embedding, is_sensitive, source_id, external_id)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
      RETURNING id
    `, [
      req.file.filename,
      req.file.originalname,
      analysis.category,
      analysis.summary,
      analysis.ocr_text,
      JSON.stringify(analysis.tags),
      JSON.stringify(analysis.entities),
      analysis.language,
      JSON.stringify(embedding),
      analysis.is_sensitive ? 1 : 0,
      'icloud_folder',
      localPath
    ]);

    const newScreenshot = {
      id: result.rows[0].id,
      ...analysis,
      filename: req.file.filename,
      original_name: req.file.originalname,
      upload_date: new Date().toISOString(),
      source: 'icloudFolder'
    };

    broadcast({ type: 'icloud:newFile', data: newScreenshot });
    res.json({ success: true, id: result.lastInsertRowid });
  } catch (error) {
    console.error("iCloud import error:", error);
    res.status(500).json({ error: "Failed to process iCloud screenshot" });
  }
});

const oauth2Client = new google.auth.OAuth2(
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET,
  `${process.env.APP_URL}/api/auth/google/callback`
);

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

    await pool.query(`
      INSERT INTO cloud_sources (id, type, email, access_token, refresh_token)
      VALUES ($1, $2, $3, $4, $5)
      ON CONFLICT (id) DO UPDATE SET
        access_token = EXCLUDED.access_token,
        refresh_token = EXCLUDED.refresh_token,
        email = EXCLUDED.email
    `, [userInfo.data.id, "google_drive", userInfo.data.email, tokens.access_token, tokens.refresh_token]);

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

app.get("/api/sources", async (req, res) => {
  const result = await pool.query("SELECT id, type as provider, email, local_path, last_sync, status, connected_at, settings FROM cloud_sources");
  const sources = result.rows;
  res.json(sources.map((s: any) => ({
    ...s,
    provider: s.provider === 'google_drive' ? 'googleDrive' : s.provider,
    settings: s.settings ? JSON.parse(s.settings) : {
      keywords: ["screenshot", "screen shot", "screenshots", "IMG_"],
      dateRangeDays: 30,
      maxFiles: 200,
      autoSyncEnabled: false,
      intervalMinutes: 15
    }
  })));
});

app.post("/api/sources/:id/settings", async (req, res) => {
  const { id } = req.params;
  const { settings } = req.body;
  await pool.query("UPDATE cloud_sources SET settings = $1 WHERE id = $2", [JSON.stringify(settings), id]);
  res.json({ success: true });
});

app.post("/api/sources/:id/disconnect", async (req, res) => {
  const { id } = req.params;
  const result = await pool.query("SELECT * FROM cloud_sources WHERE id = $1", [id]);
  const source = result.rows[0];
  if (source && source.type === 'google_drive') {
    try {
      const auth = new google.auth.OAuth2(
        process.env.GOOGLE_CLIENT_ID,
        process.env.GOOGLE_CLIENT_SECRET
      );
      auth.setCredentials({ access_token: source.access_token });
      await auth.revokeToken(source.access_token);
    } catch (e) {
      console.error("Token revocation failed:", e);
    }
  }
  await pool.query("DELETE FROM cloud_sources WHERE id = $1", [id]);
  res.json({ success: true });
});

// Sync Logic
app.post("/api/sync", async (req, res) => {
  const sourcesRes = await pool.query("SELECT * FROM cloud_sources");
  const sources = sourcesRes.rows;
  let totalSynced = 0;
  let results: any[] = [];

  for (const source of sources as any) {
    const settings = source.settings ? JSON.parse(source.settings) : {
      keywords: ["screenshot", "screen shot", "screenshots", "IMG_"],
      dateRangeDays: 30,
      maxFiles: 200
    };

    if (source.type === "google_drive") {
      try {
        const auth = new google.auth.OAuth2(
          process.env.GOOGLE_CLIENT_ID,
          process.env.GOOGLE_CLIENT_SECRET
        );
        auth.setCredentials({
          access_token: source.access_token,
          refresh_token: source.refresh_token,
        });

        const drive = google.drive({ version: "v3", auth });

        // Build query to restrict to screenshots
        const dateLimit = new Date();
        dateLimit.setDate(dateLimit.getDate() - settings.dateRangeDays);
        const rfc3339Date = dateLimit.toISOString();

        // Query for folders named "Screenshots"
        let folderQuery = "mimeType = 'application/vnd.google-apps.folder' and name contains 'screenshot'";
        let folderResponse;
        try {
          folderResponse = await drive.files.list({
            q: folderQuery,
            fields: "files(id, name)",
            pageSize: 10
          });
        } catch (e) {
          console.error("Failed to fetch folders:", e);
        }

        const folders = folderResponse?.data?.files || [];

        let q = `mimeType contains 'image/' and modifiedTime > '${rfc3339Date}'`;

        if (folders.length > 0) {
          // If screenshot folders exist, restrict to those folders
          const parentQueries = folders.map(f => `'${f.id}' in parents`).join(" or ");
          q += ` and (${parentQueries})`;
        } else {
          // Fallback: require the word screenshot in the file name
          q += ` and name contains 'screenshot'`;
        }

        const files = response.data.files || [];
        let sourceSynced = 0;
        let sourceSkipped = 0;
        let sourceErrors = 0;

        for (const file of files) {
          // Check if already synced
          const existingRes = await pool.query("SELECT id FROM screenshots WHERE external_id = $1", [file.id]);
          if (existingRes.rows.length > 0) {
            sourceSkipped++;
            continue;
          }

          try {
            const fileRes = await drive.files.get({ fileId: file.id!, alt: "media" }, { responseType: "arraybuffer" });
            const buffer = Buffer.from(fileRes.data as ArrayBuffer);
            const filename = `${Date.now()}-${file.name}`;
            const filePath = path.join(UPLOADS_DIR, filename);
            fs.writeFileSync(filePath, buffer);

            const analysis = await analyzeScreenshot(filePath);
            const embedding = await generateEmbedding(analysis.summary + " " + analysis.ocr_text);

            await pool.query(`
              INSERT INTO screenshots (filename, original_name, category, summary, ocr_text, tags, entities, language, embedding, is_sensitive, source_id, external_id)
              VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
            `, [
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
            ]);
            sourceSynced++;
            totalSynced++;

            // Broadcast new file
            broadcast({
              type: 'google:newFile',
              data: {
                id: file.id,
                filename,
                original_name: file.name,
                upload_date: new Date().toISOString(),
                source: 'googleDrive'
              }
            });
          } catch (err) {
            console.error(`Failed to sync file ${file.id}:`, err);
            sourceErrors++;
          }
        }
        await pool.query("UPDATE cloud_sources SET last_sync = CURRENT_TIMESTAMP WHERE id = $1", [source.id]);
        results.push({ provider: 'googleDrive', synced: sourceSynced, skipped: sourceSkipped, errors: sourceErrors });
      } catch (err) {
        console.error("Google Drive sync failed:", err);
        results.push({ provider: 'googleDrive', error: "Sync failed" });
      }
    }
  }

  res.json({ success: true, syncedCount: totalSynced, results });
});

// API Routes
app.post("/api/upload", upload.single("screenshot"), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: "No file uploaded" });

    const analysis = await analyzeScreenshot(req.file.path);
    const embedding = await generateEmbedding(analysis.summary + " " + analysis.ocr_text);

    const result = await pool.query(`
      INSERT INTO screenshots (filename, original_name, category, summary, ocr_text, tags, entities, language, embedding, is_sensitive)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
      RETURNING id
    `, [
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
    ]);

    res.json({ id: result.rows[0].id, ...analysis });
  } catch (error) {
    console.error("Upload error:", error);
    res.status(500).json({ error: "Failed to process screenshot" });
  }
});

app.get("/api/screenshots", async (req, res) => {
  const result = await pool.query("SELECT * FROM screenshots ORDER BY upload_date DESC");
  res.json(result.rows);
});

app.post("/api/search", async (req, res) => {
  try {
    const { query } = req.body;
    const queryEmbedding = await generateEmbedding(query);

    // Simple cosine similarity in JS (for production use a vector DB like Pinecone or pgvector)
    const result = await pool.query("SELECT * FROM screenshots");
    const screenshots = result.rows;

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
    const placeholders = contextIds.map((_: any, i: number) => `$${i + 1}`).join(",");
    const result = await pool.query(`SELECT summary, ocr_text, category FROM screenshots WHERE id IN (${placeholders})`, contextIds);
    const contextScreenshots = result.rows;

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

  server.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
