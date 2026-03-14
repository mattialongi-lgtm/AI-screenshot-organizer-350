import "dotenv/config";
import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import multer from "multer";
import { createClient } from "@supabase/supabase-js";
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

// Supabase Setup
const supabase = createClient(
  process.env.VITE_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

import { google } from "googleapis";
import { WebSocketServer, WebSocket } from "ws";
import http from "http";

const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ server });
const PORT = process.env.PORT || 3000;

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
app.use((req, res, next) => {
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Headers", "Content-Type, Authorization");
  res.header("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  if (req.method === "OPTIONS") return res.sendStatus(204);
  next();
});
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
    const { data: existingScreenshots } = await supabase
      .from('screenshots')
      .select('id')
      .eq('external_id', localPath);

    if (existingScreenshots && existingScreenshots.length > 0) {
      fs.unlinkSync(req.file.path);
      return res.json({ success: true, skipped: true });
    }

    const analysis = await analyzeScreenshot(req.file.path);
    const embedding = await generateEmbedding(analysis.summary + " " + analysis.ocr_text);

    const { data: dbData, error: dbError } = await supabase
      .from('screenshots')
      .insert([{
        filename: req.file.filename,
        original_name: req.file.originalname,
        category: analysis.category,
        summary: analysis.summary,
        ocr_text: analysis.ocr_text,
        tags: analysis.tags, // Supabase handles JSON arrays directly if column is jsonb/text[]
        entities: analysis.entities,
        language: analysis.language,
        embedding: embedding,
        is_sensitive: analysis.is_sensitive ? 1 : 0,
        is_analyzed: 1,
        source_id: 'icloud_folder',
        external_id: localPath
      }])
      .select()
      .single();

    if (dbError) {
      console.error("Supabase insert error (iCloud):", dbError);
      throw dbError;
    }
    console.log("Supabase insert success (iCloud):", dbData.id);

    const newScreenshot = {
      id: dbData.id,
      ...analysis,
      filename: req.file.filename,
      original_name: req.file.originalname,
      upload_date: new Date().toISOString(),
      source: 'icloudFolder'
    };

    broadcast({ type: 'icloud:newFile', data: newScreenshot });
    res.json({ success: true, id: dbData.id });
  } catch (error) {
    console.error("iCloud import error:", error);
    res.status(500).json({ error: "Failed to process iCloud screenshot" });
  }
});

// Use a single, explicit redirect URI for all OAuth operations to avoid mismatch
const redirectUri =
  process.env.APP_URL
    ? `${process.env.APP_URL}/api/auth/google/callback`
    : "https://ai-screenshot-organizer-350.onrender.com/api/auth/google/callback";

const oauth2Client = new google.auth.OAuth2(
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET,
  redirectUri
);

// AI Service Logic
async function analyzeScreenshot(filePath: string) {
  const ai = new GoogleGenAI({ apiKey: process.env.VITE_GEMINI_API_KEY! });
  const imageData = fs.readFileSync(filePath).toString("base64");

  const response = await ai.models.generateContent({
    model: "gemini-2.5-flash",
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
            text: `Analyze this screenshot and return a JSON object with the following schema:
            {
              "category": "Chat" | "Receipt" | "Social Media" | "Email" | "Document" | "Meme" | "Banking" | "E-commerce" | "Booking" | "Other",
              "summary": "1-2 line summary",
              "ocr_text": "full extracted text",
              "tags": ["tag1", "tag2", ...],
              "entities": {
                "dates": [],
                "amounts": [],
                "emails": [],
                "urls": [],
                "phones": [],
                "order_ids": [],
                "merchant": ""
              },
              "safety": { "contains_sensitive": true/false, "reason": "" }
            }`,
          },
        ],
      },
    ],
    config: {
      responseMimeType: "application/json",
    },
  });

  // Handle different SDK response formats
  let text = '';
  const res = response as any;
  if (typeof res.text === 'function') {
    text = await res.text();
  } else if (typeof res.text === 'string') {
    text = res.text;
  } else if (res.response && typeof res.response.text === 'function') {
    text = await res.response.text();
  } else if (res.response && typeof res.response.text === 'string') {
    text = res.response.text;
  }

  if (!text) throw new Error("Empty response from AI");

  try {
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    return JSON.parse(jsonMatch ? jsonMatch[0] : text);
  } catch (e) {
    console.error("JSON Parse Error in server.ts:", e, "Raw text:", text);
    throw new Error("Invalid format from AI");
  }
}

async function generateEmbedding(text: string) {
  const ai = new GoogleGenAI({ apiKey: process.env.VITE_GEMINI_API_KEY! });
  const result = await ai.models.embedContent({
    model: "gemini-embedding-2-preview",
    contents: [{ parts: [{ text }] }],
  });
  return (result as any).embeddings[0].values || (result as any).embedding.values;
}

// Frontend-facing AI proxy endpoints (used when frontend sets VITE_API_URL)
async function extractResponseText(response: any): Promise<string> {
  const r = response as any;
  if (typeof r.text === 'function') return await r.text();
  if (typeof r.text === 'string') return r.text;
  if (r.response && typeof r.response.text === 'function') return await r.response.text();
  if (r.response && typeof r.response.text === 'string') return r.response.text;
  return '';
}

function parseJsonResponse(text: string) {
  if (!text) throw new Error("Empty response from AI");
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  try {
    return JSON.parse(jsonMatch ? jsonMatch[0] : text);
  } catch (e) {
    throw new Error("Invalid JSON from AI: " + text.slice(0, 200));
  }
}

app.post("/api/analyze", async (req, res) => {
  try {
    const { image, mimeType } = req.body;
    if (!image) return res.status(400).json({ error: "No image data" });

    const ai = new GoogleGenAI({ apiKey: process.env.VITE_GEMINI_API_KEY! });
    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: [
        {
          parts: [
            { inlineData: { mimeType: mimeType || "image/png", data: image } },
            {
              text: `Analyze this screenshot and return a JSON object with the following schema:
              {
                "category": "Chat" | "Receipt" | "Social Media" | "Email" | "Document" | "Meme" | "Banking" | "E-commerce" | "Booking" | "Other",
                "summary": "1-2 line summary",
                "ocr_text": "full extracted text",
                "tags": ["tag1", "tag2", ...],
                "entities": {
                  "dates": [],
                  "amounts": [],
                  "emails": [],
                  "urls": [],
                  "phones": [],
                  "order_ids": [],
                  "merchant": ""
                },
                "safety": { "contains_sensitive": true/false, "reason": "" }
              }`,
            },
          ],
        },
      ],
      config: { responseMimeType: "application/json" },
    });

    const text = await extractResponseText(response);
    res.json(parseJsonResponse(text));
  } catch (error) {
    console.error("Analyze error:", error);
    res.status(500).json({ error: "Analysis failed" });
  }
});

app.post("/api/embed", async (req, res) => {
  try {
    const { text } = req.body;
    if (!text) return res.status(400).json({ error: "No text provided" });
    const embedding = await generateEmbedding(text);
    res.json({ embedding });
  } catch (error) {
    console.error("Embed error:", error);
    res.status(500).json({ error: "Embedding failed" });
  }
});

app.post("/api/ask", async (req, res) => {
  try {
    const { question, context } = req.body;
    if (!question) return res.status(400).json({ error: "No question provided" });

    const ai = new GoogleGenAI({ apiKey: process.env.VITE_GEMINI_API_KEY! });
    const contextText = (context || []).map((s: any) =>
      `ID: ${s.id}\nSummary: ${s.summary}\nOCR Text: ${s.ocrText}\nEntities: ${JSON.stringify(s.entities)}`
    ).join("\n---\n");

    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: [
        {
          parts: [
            {
              text: `You are an AI assistant helping a user with their screenshots.
              Answer the user's question using ONLY the provided context.
              If the answer is not in the context, say you don't know.
              Return a JSON object with the following schema:
              {
                "answer": "your answer here",
                "used_ids": [id1, id2, ...]
              }

              Context:
              ${contextText}

              Question: ${question}`,
            },
          ],
        },
      ],
      config: { responseMimeType: "application/json" },
    });

    const text = await extractResponseText(response);
    res.json(parseJsonResponse(text));
  } catch (error) {
    console.error("Ask error:", error);
    res.status(500).json({ error: "Ask failed" });
  }
});

// Auth Routes
app.get("/api/auth/google/url", (req, res) => {
  const url = oauth2Client.generateAuthUrl({
    access_type: "offline",
    scope: [
      "https://www.googleapis.com/auth/drive.readonly",
      "https://www.googleapis.com/auth/userinfo.email",
    ],
    prompt: "consent",
    redirect_uri: redirectUri,
  });
  res.json({ url });
});

app.get("/api/auth/google/callback", async (req, res) => {
  const { code } = req.query;
  try {
    const { tokens } = await oauth2Client.getToken({
      code: code as string,
      redirect_uri: redirectUri,
    });
    oauth2Client.setCredentials(tokens);

    const oauth2 = google.oauth2({ version: "v2", auth: oauth2Client });
    const userInfo = await oauth2.userinfo.get();

    const { error: upsertError } = await supabase
      .from('cloud_sources')
      .upsert({
        id: userInfo.data.id,
        type: "google_drive",
        email: userInfo.data.email,
        access_token: tokens.access_token,
        refresh_token: tokens.refresh_token
      });

    if (upsertError) throw upsertError;

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
  const { data: sources, error } = await supabase
    .from('cloud_sources')
    .select('id, type, email, local_path, last_sync, status, connected_at, settings');

  if (error) return res.status(500).json({ error: error.message });

  res.json(sources.map((s: any) => ({
    ...s,
    provider: s.type === 'google_drive' ? 'googleDrive' : s.type,
    settings: s.settings ? (typeof s.settings === 'string' ? JSON.parse(s.settings) : s.settings) : {
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
  await supabase
    .from('cloud_sources')
    .update({ settings })
    .eq('id', id);
  res.json({ success: true });
});

app.post("/api/sources/:id/disconnect", async (req, res) => {
  const { id } = req.params;
  const { data: source } = await supabase
    .from('cloud_sources')
    .select('*')
    .eq('id', id)
    .single();

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
  await supabase.from('cloud_sources').delete().eq('id', id);
  res.json({ success: true });
});

// Sync Logic
app.post("/api/sync", async (req, res) => {
  const { data: sources, error } = await supabase.from('cloud_sources').select('*');
  if (error) return res.status(500).json({ error: error.message });

  let totalSynced = 0;
  let results: any[] = [];

  for (const source of sources as any) {
    const settings = source.settings ? (typeof source.settings === 'string' ? JSON.parse(source.settings) : source.settings) : {
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

        // FIX: Missing list call
        const response = await drive.files.list({ q, fields: "files(id, name)" });
        const files = response.data.files || [];
        let sourceSynced = 0;
        let sourceSkipped = 0;
        let sourceErrors = 0;

        for (const file of files) {
          // Check if already synced
          const { data: existing } = await supabase
            .from('screenshots')
            .select('id')
            .eq('external_id', file.id);

          if (existing && existing.length > 0) {
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

            const { error: insError } = await supabase
              .from('screenshots')
              .insert([{
                filename,
                original_name: file.name,
                category: analysis.category,
                summary: analysis.summary,
                ocr_text: analysis.ocr_text,
                tags: analysis.tags,
                entities: analysis.entities,
                language: analysis.language,
                embedding: embedding,
                is_sensitive: analysis.is_sensitive ? 1 : 0,
                is_analyzed: 1,
                source_id: source.id,
                external_id: file.id
              }]);
            
            if (insError) console.error("Supabase insert error (Google Drive):", insError);
            else console.log("Supabase insert success (Google Drive):", file.id);

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
        await supabase
          .from('cloud_sources')
          .update({ last_sync: new Date().toISOString() })
          .eq('id', source.id);

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

    const { data, error } = await supabase
      .from('screenshots')
      .insert([{
        filename: req.file.filename,
        original_name: req.file.originalname,
        category: analysis.category,
        summary: analysis.summary,
        ocr_text: analysis.ocr_text,
        tags: analysis.tags,
        entities: analysis.entities,
        language: analysis.language,
        embedding: embedding,
        is_sensitive: analysis.is_sensitive ? 1 : 0,
        is_analyzed: 1
      }])
      .select()
      .single();

    if (error) {
      console.error("Supabase insert error (Upload):", error);
      throw error;
    }
    console.log("Supabase insert success (Upload):", data.id);
    res.json({ id: data.id, ...analysis });
  } catch (error) {
    console.error("Upload error:", error);
    res.status(500).json({ error: "Failed to process screenshot" });
  }
});

app.get("/api/screenshots", async (req, res) => {
  const { data, error } = await supabase
    .from('screenshots')
    .select('*')
    .order('upload_date', { ascending: false });

  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

app.post("/api/search", async (req, res) => {
  try {
    const { query } = req.body;
    const queryEmbedding = await generateEmbedding(query);

    const { data: screenshots, error } = await supabase.from('screenshots').select('*');
    if (error) throw error;

    const results = screenshots.map((s: any) => {
      const emb = typeof s.embedding === 'string' ? JSON.parse(s.embedding) : s.embedding;
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
    const ai = new GoogleGenAI({ apiKey: process.env.VITE_GEMINI_API_KEY! });

    // Fetch context from DB
    const { data: contextScreenshots, error } = await supabase
      .from('screenshots')
      .select('summary, ocr_text, category')
      .in('id', contextIds);

    if (error) throw error;

    const contextText = contextScreenshots.map((s: any) =>
      `[Category: ${s.category}] Summary: ${s.summary}\nText: ${s.ocr_text}`
    ).join("\n---\n");

    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
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

  server.listen({ port: PORT, host: "0.0.0.0" }, () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
