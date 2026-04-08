import "dotenv/config";
import express, { type NextFunction, type Request, type Response } from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import multer from "multer";
import { createClient, type User } from "@supabase/supabase-js";
import fs from "fs";
import { GoogleGenAI, Type } from "@google/genai";
import { fileURLToPath } from "url";
import crypto from "crypto";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Ensure uploads directory exists
const UPLOADS_DIR = path.join(__dirname, "uploads");
if (!fs.existsSync(UPLOADS_DIR)) {
  fs.mkdirSync(UPLOADS_DIR);
}

// Supabase Setup
const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceRoleKey) {
  throw new Error("Missing Supabase server environment variables.");
}

const supabase = createClient(
  supabaseUrl,
  supabaseServiceRoleKey,
  {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  }
);

import { google } from "googleapis";
import { WebSocketServer, WebSocket } from "ws";
import http from "http";

const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ server });
const PORT = process.env.PORT || 3000;
app.set("trust proxy", true);

const googleClientId = process.env.GOOGLE_CLIENT_ID;
const googleClientSecret = process.env.GOOGLE_CLIENT_SECRET;
const configuredFrontendAppUrl = normalizeUrl(process.env.APP_URL);
const configuredApiPublicUrl = normalizeUrl(process.env.API_PUBLIC_URL);
const configuredGoogleRedirectUri = normalizeUrl(process.env.GOOGLE_OAUTH_REDIRECT_URI);
const oauthStateSecret = process.env.GOOGLE_OAUTH_STATE_SECRET || supabaseServiceRoleKey;
const tokenEncryptionSecret = process.env.GOOGLE_TOKEN_ENCRYPTION_KEY || supabaseServiceRoleKey;
const geminiApiKey = process.env.GEMINI_API_KEY || process.env.VITE_GEMINI_API_KEY;
const GOOGLE_DRIVE_SCOPES = [
  "https://www.googleapis.com/auth/drive.readonly",
  "openid",
  "email",
  "profile",
] as const;
const DEFAULT_SOURCE_SETTINGS = {
  keywords: ["screenshot", "screen shot", "screenshots", "IMG_"],
  dateRangeDays: 30,
  maxFiles: 200,
  autoSyncEnabled: false,
  intervalMinutes: 15,
} as const;

declare global {
  namespace Express {
    interface Request {
      accessToken?: string;
      user?: User;
    }
  }
}

type OAuthStatePayload = {
  appOrigin?: string | null;
  exp: number;
  redirectUri: string;
  userId: string;
};

const clients = new Map<WebSocket, string>();

function normalizeUrl(value?: string | null) {
  if (!value) return null;

  const trimmed = value.trim();
  if (!trimmed) return null;

  try {
    return new URL(trimmed).toString().replace(/\/$/, "");
  } catch (error) {
    throw new Error(`Invalid URL value: ${trimmed}`);
  }
}

function resolveRequestOrigin(req: Request) {
  const forwardedProto = req.get("x-forwarded-proto")?.split(",")[0]?.trim();
  const forwardedHost = req.get("x-forwarded-host")?.split(",")[0]?.trim();
  const protocol = forwardedProto || req.protocol;
  const host = forwardedHost || req.get("host");

  if (!host) {
    return null;
  }

  return normalizeUrl(`${protocol}://${host}`);
}

function resolveFrontendOrigin(req?: Request, state?: OAuthStatePayload | null) {
  return state?.appOrigin || configuredFrontendAppUrl || normalizeUrl(req?.get("origin") ?? null);
}

function resolveGoogleRedirectUri(req?: Request, state?: OAuthStatePayload | null) {
  if (state?.redirectUri) {
    return state.redirectUri;
  }

  if (configuredGoogleRedirectUri) {
    return configuredGoogleRedirectUri;
  }

  if (configuredApiPublicUrl) {
    return `${configuredApiPublicUrl}/api/auth/google/callback`;
  }

  const requestOrigin = req ? resolveRequestOrigin(req) : null;
  return requestOrigin ? `${requestOrigin}/api/auth/google/callback` : null;
}

function createGoogleOAuthClient(redirectUri?: string | null) {
  if (!googleClientId || !googleClientSecret) {
    throw new Error("Missing GOOGLE_CLIENT_ID or GOOGLE_CLIENT_SECRET.");
  }

  return new google.auth.OAuth2(
    googleClientId,
    googleClientSecret,
    redirectUri ?? undefined,
  );
}

function requireGeminiApiKey() {
  if (!geminiApiKey) {
    throw new Error("Missing GEMINI_API_KEY server environment variable.");
  }

  return geminiApiKey;
}

function getTokenEncryptionKey() {
  return crypto
    .createHash("sha256")
    .update(tokenEncryptionSecret)
    .digest();
}

function encryptStoredToken(token?: string | null) {
  if (!token) return null;
  if (token.startsWith("enc:v1:")) return token;

  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", getTokenEncryptionKey(), iv);
  const encrypted = Buffer.concat([cipher.update(token, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();

  return `enc:v1:${iv.toString("base64url")}:${authTag.toString("base64url")}:${encrypted.toString("base64url")}`;
}

function decryptStoredToken(token?: string | null) {
  if (!token) return null;
  if (!token.startsWith("enc:v1:")) return token;

  const [, , iv, authTag, encrypted] = token.split(":");
  if (!iv || !authTag || !encrypted) {
    throw new Error("Stored Google token is malformed.");
  }

  const decipher = crypto.createDecipheriv(
    "aes-256-gcm",
    getTokenEncryptionKey(),
    Buffer.from(iv, "base64url"),
  );
  decipher.setAuthTag(Buffer.from(authTag, "base64url"));

  return Buffer.concat([
    decipher.update(Buffer.from(encrypted, "base64url")),
    decipher.final(),
  ]).toString("utf8");
}

function encodeStoragePath(storagePath: string) {
  return storagePath
    .split("/")
    .map((segment) => encodeURIComponent(segment))
    .join("/");
}

function getPublicStorageUrl(storagePath?: string | null) {
  if (!storagePath) return undefined;
  return `${supabaseUrl}/storage/v1/object/public/screenshots/${encodeStoragePath(storagePath)}`;
}

function sanitizeStorageFilename(filename: string) {
  const sanitized = path.basename(filename).replace(/[^a-zA-Z0-9._-]/g, "_");
  return sanitized || `screenshot-${Date.now()}.bin`;
}

function resolveMimeType(filename: string, fallback?: string | null) {
  if (fallback) return fallback;

  const extension = path.extname(filename).toLowerCase();
  switch (extension) {
    case ".jpg":
    case ".jpeg":
      return "image/jpeg";
    case ".webp":
      return "image/webp";
    case ".gif":
      return "image/gif";
    case ".heic":
      return "image/heic";
    case ".bmp":
      return "image/bmp";
    default:
      return "image/png";
  }
}

function escapeDriveQueryValue(value: string) {
  return value.replace(/\\/g, "\\\\").replace(/'/g, "\\'");
}

function parseSourceSettings(settings: any) {
  let parsed = settings;
  if (typeof settings === "string") {
    try {
      parsed = JSON.parse(settings);
    } catch {
      parsed = {};
    }
  }

  const safeKeywords = Array.isArray(parsed?.keywords)
    ? parsed.keywords.filter((keyword: unknown): keyword is string => typeof keyword === "string" && keyword.trim().length > 0)
    : [...DEFAULT_SOURCE_SETTINGS.keywords];

  return {
    ...DEFAULT_SOURCE_SETTINGS,
    ...(parsed && typeof parsed === "object" ? parsed : {}),
    keywords: safeKeywords.length > 0 ? safeKeywords : [...DEFAULT_SOURCE_SETTINGS.keywords],
    dateRangeDays: Number(parsed?.dateRangeDays) > 0 ? Number(parsed.dateRangeDays) : DEFAULT_SOURCE_SETTINGS.dateRangeDays,
    maxFiles: Number(parsed?.maxFiles) > 0 ? Number(parsed.maxFiles) : DEFAULT_SOURCE_SETTINGS.maxFiles,
    autoSyncEnabled: parsed?.autoSyncEnabled ?? DEFAULT_SOURCE_SETTINGS.autoSyncEnabled,
    intervalMinutes: Number(parsed?.intervalMinutes) > 0 ? Number(parsed.intervalMinutes) : DEFAULT_SOURCE_SETTINGS.intervalMinutes,
  };
}

function buildRealtimeScreenshotPayload(row: any) {
  const storagePath = row.storage_path || row.filename;

  return {
    id: row.id,
    userId: row.user_id,
    createdAt: new Date(row.upload_date || row.created_at || Date.now()).getTime(),
    filename: storagePath,
    ocrText: row.ocr_text || "",
    summary: row.summary || "",
    category: row.category || "Other",
    tags: Array.isArray(row.tags) ? row.tags : [],
    entities: row.entities || {
      dates: [],
      amounts: [],
      emails: [],
      urls: [],
      phones: [],
      order_ids: [],
    },
    source:
      row.source === "google_drive"
        ? "googleDrive"
        : row.source === "icloud_folder" || row.source_id === "icloud_folder"
          ? "icloudFolder"
          : "upload",
    imageUrl: getPublicStorageUrl(storagePath),
    isAnalyzed: !!(row.is_analyzed === 1 || row.is_analyzed === true),
    isSensitive: !!(row.is_sensitive === 1 || row.is_sensitive === true),
    safetyReason: row.safety_reason || "",
    embedding: row.embedding,
  };
}

async function uploadBufferToStorage(userId: string, originalName: string, buffer: Buffer, mimeType?: string | null) {
  const safeFilename = sanitizeStorageFilename(originalName);
  const storagePath = `${userId}/${Date.now()}-${Math.round(Math.random() * 1e9)}-${safeFilename}`;
  const { error } = await supabase.storage
    .from("screenshots")
    .upload(storagePath, buffer, {
      contentType: resolveMimeType(originalName, mimeType),
      upsert: false,
    });

  if (error) {
    throw error;
  }

  return storagePath;
}

async function persistGoogleTokens(
  sourceId: string,
  userId: string,
  tokens: { access_token?: string | null; refresh_token?: string | null },
) {
  const updates: Record<string, any> = { status: "connected" };
  if (tokens.access_token) {
    updates.access_token = encryptStoredToken(tokens.access_token);
  }
  if (tokens.refresh_token) {
    updates.refresh_token = encryptStoredToken(tokens.refresh_token);
  }

  if (Object.keys(updates).length === 1) {
    return;
  }

  const { error } = await supabase
    .from("cloud_sources")
    .update(updates)
    .eq("id", sourceId)
    .eq("user_id", userId);

  if (error) {
    console.error("Failed to persist refreshed Google tokens:", error);
  }
}

async function setGoogleSourceStatus(sourceId: string, userId: string, status: "connected" | "error") {
  const { error } = await supabase
    .from("cloud_sources")
    .update({ status })
    .eq("id", sourceId)
    .eq("user_id", userId);

  if (error) {
    console.error("Failed to update Google Drive source status:", error);
  }
}

async function createGoogleDriveAuth(source: any, userId: string) {
  const auth = createGoogleOAuthClient();
  const accessToken = decryptStoredToken(source.access_token);
  const refreshToken = decryptStoredToken(source.refresh_token);

  if (!accessToken && !refreshToken) {
    throw new Error("Google Drive tokens are missing. Reconnect this source.");
  }

  auth.on("tokens", (tokens) => {
    void persistGoogleTokens(source.id, userId, tokens);
  });

  auth.setCredentials({
    access_token: accessToken ?? undefined,
    refresh_token: refreshToken ?? undefined,
  });

  if (refreshToken) {
    await auth.getAccessToken();
  }

  return auth;
}

function buildOAuthState(userId: string, redirectUri: string, appOrigin?: string | null) {
  const payload = Buffer.from(JSON.stringify({
    appOrigin: appOrigin || null,
    exp: Date.now() + 10 * 60 * 1000,
    redirectUri,
    userId,
  } satisfies OAuthStatePayload)).toString("base64url");
  const signature = crypto
    .createHmac("sha256", oauthStateSecret)
    .update(payload)
    .digest("base64url");

  return `${payload}.${signature}`;
}

function verifyOAuthState(state: string | null): OAuthStatePayload | null {
  if (!state) return null;

  const [payload, signature] = state.split(".");
  if (!payload || !signature) return null;

  const expectedSignature = crypto
    .createHmac("sha256", oauthStateSecret)
    .update(payload)
    .digest("base64url");

  const providedBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expectedSignature);
  if (
    providedBuffer.length !== expectedBuffer.length ||
    !crypto.timingSafeEqual(providedBuffer, expectedBuffer)
  ) {
    return null;
  }

  try {
    const parsed = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as OAuthStatePayload;
    if (!parsed.userId || parsed.exp < Date.now()) {
      return null;
    }
    return parsed;
  } catch (error) {
    console.error("Invalid OAuth state payload:", error);
    return null;
  }
}

function getBearerToken(req: Request) {
  const authHeader = req.headers.authorization;
  if (!authHeader) return null;

  const [scheme, token] = authHeader.split(" ");
  if (scheme?.toLowerCase() !== "bearer" || !token) return null;

  return token.trim();
}

async function requireAuth(req: Request, res: Response, next: NextFunction) {
  try {
    const token = getBearerToken(req);
    if (!token) {
      return res.status(401).json({ error: "Missing bearer token" });
    }

    const { data, error } = await supabase.auth.getUser(token);
    if (error || !data.user) {
      return res.status(401).json({ error: "Invalid or expired token" });
    }

    req.accessToken = token;
    req.user = data.user;
    next();
  } catch (error) {
    console.error("Auth middleware error:", error);
    return res.status(401).json({ error: "Authentication failed" });
  }
}

async function getOwnedSource(sourceId: string, userId: string) {
  const { data, error } = await supabase
    .from("cloud_sources")
    .select("*")
    .eq("id", sourceId)
    .eq("user_id", userId)
    .maybeSingle();

  if (error) throw error;
  return data;
}

function broadcastToUser(userId: string, data: any) {
  const message = JSON.stringify(data);
  clients.forEach((clientUserId, client) => {
    if (clientUserId === userId && client.readyState === WebSocket.OPEN) {
      client.send(message);
    }
  });
}

wss.on("connection", async (ws, req) => {
  try {
    const wsUrl = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`);
    const token = wsUrl.searchParams.get("token");
    if (!token) {
      ws.close(1008, "Authentication required");
      return;
    }

    const { data, error } = await supabase.auth.getUser(token);
    if (error || !data.user) {
      ws.close(1008, "Invalid token");
      return;
    }

    clients.set(ws, data.user.id);
    ws.on("close", () => clients.delete(ws));
  } catch (error) {
    console.error("WebSocket auth failed:", error);
    ws.close(1011, "Authentication failed");
  }
});

app.use(express.json({ limit: '50mb' }));
app.use((req, res, next) => {
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Headers", "Content-Type, Authorization");
  res.header("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  if (req.method === "OPTIONS") return res.sendStatus(204);
  next();
});

// Multer Setup
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOADS_DIR),
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
    cb(null, uniqueSuffix + path.extname(file.originalname));
  },
});
const upload = multer({ storage });

app.get("/uploads/:filename", requireAuth, async (req, res) => {
  try {
    const { filename } = req.params;
    if (!req.user) {
      return res.status(401).json({ error: "Authentication required" });
    }

    if (filename !== path.basename(filename)) {
      return res.status(400).json({ error: "Invalid file path" });
    }

    const { data: screenshot, error } = await supabase
      .from("screenshots")
      .select("id")
      .eq("filename", filename)
      .eq("user_id", req.user.id)
      .maybeSingle();

    if (error) {
      console.error("Uploads lookup error:", error);
      return res.status(500).json({ error: "Failed to load upload" });
    }

    if (!screenshot) {
      return res.status(404).json({ error: "Upload not found" });
    }

    const filePath = path.join(UPLOADS_DIR, filename);
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ error: "Upload file missing" });
    }

    res.sendFile(filePath);
  } catch (error) {
    console.error("Protected upload error:", error);
    res.status(500).json({ error: "Failed to load upload" });
  }
});

// iCloud Import Endpoint (called by local agent)
app.post("/api/icloud/import", requireAuth, upload.single("file"), async (req, res) => {
  try {
    if (!req.user) return res.status(401).json({ error: "Authentication required" });
    if (!req.file) return res.status(400).json({ error: "No file uploaded" });
    const { localPath, modifiedTime } = req.body;

    // Check if already exists
    const { data: existingScreenshots } = await supabase
      .from('screenshots')
      .select('id')
      .eq('external_id', localPath)
      .eq('user_id', req.user.id);

    if (existingScreenshots && existingScreenshots.length > 0) {
      fs.unlinkSync(req.file.path);
      return res.json({ success: true, skipped: true });
    }

    const buffer = fs.readFileSync(req.file.path);
    const storagePath = await uploadBufferToStorage(
      req.user.id,
      req.file.originalname,
      buffer,
      req.file.mimetype,
    );
    const analysis = await analyzeScreenshot(
      buffer,
      resolveMimeType(req.file.originalname, req.file.mimetype),
    );
    const embedding = await generateEmbedding(analysis.summary + " " + analysis.ocr_text);

    const { data: dbData, error: dbError } = await supabase
      .from('screenshots')
      .insert([{
        user_id: req.user.id,
        filename: storagePath,
        storage_path: storagePath,
        original_name: req.file.originalname,
        category: analysis.category,
        summary: analysis.summary,
        ocr_text: analysis.ocr_text,
        tags: analysis.tags, // Supabase handles JSON arrays directly if column is jsonb/text[]
        entities: analysis.entities,
        language: analysis.language,
        embedding: embedding,
        is_sensitive: analysis.safety?.contains_sensitive ? 1 : 0,
        is_analyzed: 1,
        source_id: 'icloud_folder',
        external_id: localPath,
        upload_date: modifiedTime || new Date().toISOString(),
      }])
      .select()
      .single();

    if (dbError) {
      console.error("Supabase insert error (iCloud):", dbError);
      throw dbError;
    }
    console.log("Supabase insert success (iCloud):", dbData.id);

    const newScreenshot = buildRealtimeScreenshotPayload({
      ...dbData,
      source_id: 'icloud_folder',
    });

    broadcastToUser(req.user.id, { type: 'icloud:newFile', data: newScreenshot });
    res.json({ success: true, id: dbData.id });
  } catch (error) {
    console.error("iCloud import error:", error);
    res.status(500).json({ error: "Failed to process iCloud screenshot" });
  } finally {
    if (req.file?.path && fs.existsSync(req.file.path)) {
      fs.unlinkSync(req.file.path);
    }
  }
});

// AI Service Logic
async function analyzeScreenshot(buffer: Buffer, mimeType = "image/png") {
  const ai = new GoogleGenAI({ apiKey: requireGeminiApiKey() });
  const imageData = buffer.toString("base64");

  const response = await ai.models.generateContent({
    model: "gemini-2.5-flash",
    contents: [
      {
        parts: [
          {
            inlineData: {
              mimeType,
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
  const ai = new GoogleGenAI({ apiKey: requireGeminiApiKey() });
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

app.post("/api/analyze", requireAuth, async (req, res) => {
  try {
    const { image, mimeType } = req.body;
    if (!image) return res.status(400).json({ error: "No image data" });

    const ai = new GoogleGenAI({ apiKey: requireGeminiApiKey() });
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

app.post("/api/embed", requireAuth, async (req, res) => {
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

app.post("/api/ask", requireAuth, async (req, res) => {
  try {
    const { question, context } = req.body;
    if (!question) return res.status(400).json({ error: "No question provided" });

    const ai = new GoogleGenAI({ apiKey: requireGeminiApiKey() });
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
app.get("/api/auth/google/url", requireAuth, (req, res) => {
  try {
    if (!req.user) return res.status(401).json({ error: "Authentication required" });

    const redirectUri = resolveGoogleRedirectUri(req);
    if (!redirectUri) {
      return res.status(500).json({ error: "Google OAuth redirect URI is not configured." });
    }

    const oauth2Client = createGoogleOAuthClient(redirectUri);
    const url = oauth2Client.generateAuthUrl({
      access_type: "offline",
      scope: [...GOOGLE_DRIVE_SCOPES],
      prompt: "consent",
      redirect_uri: redirectUri,
      state: buildOAuthState(req.user.id, redirectUri, resolveFrontendOrigin(req)),
    });
    res.json({ url });
  } catch (error) {
    console.error("Failed to create Google OAuth URL:", error);
    res.status(500).json({ error: error instanceof Error ? error.message : "Failed to create Google OAuth URL." });
  }
});

app.get("/api/auth/google/callback", async (req, res) => {
  const { code } = req.query;
  const state = typeof req.query.state === "string" ? req.query.state : null;
  const statePayload = verifyOAuthState(state);
  const appOrigin = resolveFrontendOrigin(undefined, statePayload);

  const sendPopupResult = (messageType: "AUTH_SUCCESS" | "AUTH_ERROR", message?: string) => {
    res.send(`
      <html>
        <body>
          <script>
            const targetOrigin = ${JSON.stringify(appOrigin || "*")};
            const payload = {
              type: ${JSON.stringify(messageType)},
              source: 'google_drive',
              message: ${JSON.stringify(message || "")}
            };

            try {
              if (window.opener && !window.opener.closed) {
                window.opener.postMessage(payload, targetOrigin);
              }
            } catch (error) {
              console.error(error);
            }

            if (window.opener && !window.opener.closed) {
              window.close();
            }
          </script>
          <p>${messageType === "AUTH_SUCCESS" ? "Connected! You can close this window." : (message || "Authentication failed.")}</p>
        </body>
      </html>
    `);
  };

  try {
    if (!statePayload) {
      return res.status(400).send("Invalid OAuth state");
    }

    if (!code || typeof code !== "string") {
      throw new Error("Google did not return an authorization code.");
    }

    const oauth2Client = createGoogleOAuthClient(statePayload.redirectUri);
    const { tokens } = await oauth2Client.getToken({
      code,
      redirect_uri: statePayload.redirectUri,
    });
    oauth2Client.setCredentials(tokens);

    const oauth2 = google.oauth2({ version: "v2", auth: oauth2Client });
    const userInfo = await oauth2.userinfo.get();

    if (!userInfo.data.id || !userInfo.data.email) {
      throw new Error("Google account details were missing from the callback.");
    }

    const sourceId = `google_drive:${statePayload.userId}:${userInfo.data.id}`;
    const existingSource = await getOwnedSource(sourceId, statePayload.userId);
    const storedRefreshToken = decryptStoredToken(existingSource?.refresh_token);
    const storedAccessToken = decryptStoredToken(existingSource?.access_token);
    const { error: upsertError } = await supabase
      .from('cloud_sources')
      .upsert({
        id: sourceId,
        user_id: statePayload.userId,
        type: "google_drive",
        email: userInfo.data.email,
        access_token: encryptStoredToken(tokens.access_token ?? storedAccessToken),
        refresh_token: encryptStoredToken(tokens.refresh_token ?? storedRefreshToken),
        status: "connected",
        connected_at: new Date().toISOString(),
      });

    if (upsertError) throw upsertError;

    sendPopupResult("AUTH_SUCCESS");
  } catch (error) {
    console.error("Auth error:", error);
    sendPopupResult("AUTH_ERROR", error instanceof Error ? error.message : "Authentication failed");
  }
});

app.get("/api/sources", requireAuth, async (req, res) => {
  if (!req.user) return res.status(401).json({ error: "Authentication required" });

  const { data: sources, error } = await supabase
    .from('cloud_sources')
    .select('id, type, email, local_path, last_sync, status, connected_at, settings')
    .eq('user_id', req.user.id);

  if (error) return res.status(500).json({ error: error.message });

  res.json(sources.map((s: any) => ({
    ...s,
    provider: s.type === 'google_drive' ? 'googleDrive' : s.type,
    settings: parseSourceSettings(s.settings)
  })));
});

app.post("/api/sources/:id/settings", requireAuth, async (req, res) => {
  const { id } = req.params;
  const { settings } = req.body;
  if (!req.user) return res.status(401).json({ error: "Authentication required" });
  const sanitizedSettings = parseSourceSettings(settings);

  const { data: updatedSource, error } = await supabase
    .from('cloud_sources')
    .update({ settings: sanitizedSettings })
    .eq('id', id)
    .eq('user_id', req.user.id)
    .select('id')
    .maybeSingle();

  if (error) return res.status(500).json({ error: error.message });
  if (!updatedSource) return res.status(404).json({ error: "Source not found" });

  res.json({ success: true });
});

app.post("/api/sources/:id/disconnect", requireAuth, async (req, res) => {
  const { id } = req.params;
  if (!req.user) return res.status(401).json({ error: "Authentication required" });

  const source = await getOwnedSource(id, req.user.id);
  if (!source) {
    return res.status(404).json({ error: "Source not found" });
  }

  if (source && source.type === 'google_drive') {
    try {
      const auth = createGoogleOAuthClient();
      const tokenToRevoke = decryptStoredToken(source.refresh_token) || decryptStoredToken(source.access_token);
      if (tokenToRevoke) {
        auth.setCredentials({ access_token: decryptStoredToken(source.access_token) ?? undefined });
        await auth.revokeToken(tokenToRevoke);
      }
    } catch (e) {
      console.error("Token revocation failed:", e);
    }
  }

  const { error } = await supabase
    .from('cloud_sources')
    .delete()
    .eq('id', id)
    .eq('user_id', req.user.id);

  if (error) return res.status(500).json({ error: error.message });
  res.json({ success: true });
});

// Sync Logic
app.post("/api/sync", requireAuth, async (req, res) => {
  if (!req.user) return res.status(401).json({ error: "Authentication required" });

  const { sourceId } = req.body ?? {};
  let sourcesQuery = supabase
    .from('cloud_sources')
    .select('*')
    .eq('user_id', req.user.id);

  if (sourceId) {
    sourcesQuery = sourcesQuery.eq('id', sourceId);
  }

  const { data: sources, error } = await sourcesQuery;
  if (error) return res.status(500).json({ error: error.message });

  let totalSynced = 0;
  let results: any[] = [];

  for (const source of sources as any) {
    const settings = parseSourceSettings(source.settings);

    if (source.type === "google_drive") {
      try {
        const auth = await createGoogleDriveAuth(source, req.user.id);
        const drive = google.drive({ version: "v3", auth });

        // Build query to restrict to screenshots
        const dateLimit = new Date();
        dateLimit.setDate(dateLimit.getDate() - settings.dateRangeDays);
        const rfc3339Date = dateLimit.toISOString();
        const maxFiles = Math.min(Math.max(settings.maxFiles, 1), 500);
        const filenameKeywordClauses = settings.keywords.map((keyword: string) => `name contains '${escapeDriveQueryValue(keyword)}'`);

        // Query for folders named "Screenshots"
        let folderQuery = "mimeType = 'application/vnd.google-apps.folder' and trashed = false and (name contains 'Screenshot' or name contains 'screenshot')";
        let folderResponse;
        try {
          folderResponse = await drive.files.list({
            q: folderQuery,
            fields: "files(id, name)",
            pageSize: 10,
            includeItemsFromAllDrives: true,
            supportsAllDrives: true,
          });
        } catch (e) {
          console.error("Failed to fetch folders:", e);
        }

        const folders = folderResponse?.data?.files || [];

        let q = `trashed = false and mimeType contains 'image/' and modifiedTime > '${rfc3339Date}'`;

        if (folders.length > 0) {
          // If screenshot folders exist, restrict to those folders
          const parentQueries = folders.map((f) => `'${f.id}' in parents`).join(" or ");
          q += ` and (${parentQueries})`;
        } else if (filenameKeywordClauses.length > 0) {
          q += ` and (${filenameKeywordClauses.join(" or ")})`;
        }

        const response = await drive.files.list({
          q,
          fields: "files(id, name, mimeType, modifiedTime, webViewLink)",
          pageSize: maxFiles,
          orderBy: "modifiedTime desc",
          includeItemsFromAllDrives: true,
          supportsAllDrives: true,
          spaces: "drive",
        });
        const files = response.data.files || [];
        let sourceSynced = 0;
        let sourceSkipped = 0;
        let sourceErrors = 0;

        for (const file of files) {
          // Check if already synced
          const { data: existing } = await supabase
            .from('screenshots')
            .select('id')
            .eq('external_id', file.id)
            .eq('user_id', req.user.id);

          if (existing && existing.length > 0) {
            sourceSkipped++;
            continue;
          }

          try {
            const fileRes = await drive.files.get({ fileId: file.id!, alt: "media" }, { responseType: "arraybuffer" });
            const buffer = Buffer.from(fileRes.data as ArrayBuffer);
            const storagePath = await uploadBufferToStorage(
              req.user.id,
              file.name || `${file.id}.png`,
              buffer,
              resolveMimeType(file.name || `${file.id}.png`, file.mimeType),
            );
            const analysis = await analyzeScreenshot(
              buffer,
              resolveMimeType(file.name || `${file.id}.png`, file.mimeType),
            );
            const embedding = await generateEmbedding(analysis.summary + " " + analysis.ocr_text);

            const { data: insertedScreenshot, error: insError } = await supabase
              .from('screenshots')
              .insert([{
                user_id: req.user.id,
                filename: storagePath,
                storage_path: storagePath,
                original_name: file.name,
                category: analysis.category,
                summary: analysis.summary,
                ocr_text: analysis.ocr_text,
                tags: analysis.tags,
                entities: analysis.entities,
                language: analysis.language,
                embedding: embedding,
                is_sensitive: analysis.safety?.contains_sensitive ? 1 : 0,
                is_analyzed: 1,
                source_id: source.id,
                external_id: file.id,
                upload_date: file.modifiedTime || new Date().toISOString(),
              }])
              .select()
              .single();

            if (insError || !insertedScreenshot) {
              throw insError || new Error("Google Drive screenshot insert returned no row.");
            }
            console.log("Supabase insert success (Google Drive):", insertedScreenshot.id);

            sourceSynced++;
            totalSynced++;

            // Broadcast new file
            broadcastToUser(req.user.id, {
              type: 'google:newFile',
              data: buildRealtimeScreenshotPayload({
                ...insertedScreenshot,
                source: 'google_drive',
              })
            });
          } catch (err) {
            console.error(`Failed to sync file ${file.id}:`, err);
            sourceErrors++;
          }
        }
        await supabase
          .from('cloud_sources')
          .update({ last_sync: new Date().toISOString(), status: 'connected' })
          .eq('id', source.id)
          .eq('user_id', req.user.id);

        results.push({ provider: 'googleDrive', synced: sourceSynced, skipped: sourceSkipped, errors: sourceErrors });
      } catch (err) {
        console.error("Google Drive sync failed:", err);
        await setGoogleSourceStatus(source.id, req.user.id, "error");
        results.push({ provider: 'googleDrive', error: err instanceof Error ? err.message : "Sync failed" });
      }
    }
  }

  res.json({ success: true, syncedCount: totalSynced, results });
});

// API Routes
app.post("/api/upload", requireAuth, upload.single("screenshot"), async (req, res) => {
  try {
    if (!req.user) return res.status(401).json({ error: "Authentication required" });
    if (!req.file) return res.status(400).json({ error: "No file uploaded" });

    const buffer = fs.readFileSync(req.file.path);
    const storagePath = await uploadBufferToStorage(
      req.user.id,
      req.file.originalname,
      buffer,
      req.file.mimetype,
    );
    const analysis = await analyzeScreenshot(
      buffer,
      resolveMimeType(req.file.originalname, req.file.mimetype),
    );
    const embedding = await generateEmbedding(analysis.summary + " " + analysis.ocr_text);

    const { data, error } = await supabase
      .from('screenshots')
      .insert([{
        user_id: req.user.id,
        filename: storagePath,
        storage_path: storagePath,
        original_name: req.file.originalname,
        category: analysis.category,
        summary: analysis.summary,
        ocr_text: analysis.ocr_text,
        tags: analysis.tags,
        entities: analysis.entities,
        language: analysis.language,
        embedding: embedding,
        is_sensitive: analysis.safety?.contains_sensitive ? 1 : 0,
        is_analyzed: 1,
        upload_date: new Date().toISOString(),
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
  } finally {
    if (req.file?.path && fs.existsSync(req.file.path)) {
      fs.unlinkSync(req.file.path);
    }
  }
});

app.get("/api/screenshots", requireAuth, async (req, res) => {
  if (!req.user) return res.status(401).json({ error: "Authentication required" });

  const { data, error } = await supabase
    .from('screenshots')
    .select('*')
    .eq('user_id', req.user.id)
    .order('upload_date', { ascending: false });

  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

app.post("/api/search", requireAuth, async (req, res) => {
  try {
    if (!req.user) return res.status(401).json({ error: "Authentication required" });
    const { query } = req.body;
    if (!query) return res.status(400).json({ error: "No query provided" });
    const queryEmbedding = await generateEmbedding(query);

    const { data: screenshots, error } = await supabase
      .from('screenshots')
      .select('*')
      .eq('user_id', req.user.id);
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

app.post("/api/chat", requireAuth, async (req, res) => {
  try {
    if (!req.user) return res.status(401).json({ error: "Authentication required" });
    const { message, contextIds } = req.body;
    if (!message) return res.status(400).json({ error: "No message provided" });
    const ai = new GoogleGenAI({ apiKey: requireGeminiApiKey() });

    // Fetch context from DB
    const { data: contextScreenshots, error } = await supabase
      .from('screenshots')
      .select('summary, ocr_text, category')
      .eq('user_id', req.user.id)
      .in('id', Array.isArray(contextIds) ? contextIds : []);

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

    const text = await extractResponseText(response);
    res.json({ text });
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
