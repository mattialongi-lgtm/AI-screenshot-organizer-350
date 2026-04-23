import "dotenv/config";
import express, { type NextFunction, type Request, type Response } from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import multer from "multer";
import { createClient, type User } from "@supabase/supabase-js";
import fs from "fs";
import OpenAI from "openai";
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

server.on("error", (err: NodeJS.ErrnoException) => {
  if (err.code === "EADDRINUSE") {
    console.error(`[server] Port ${PORT} is already in use. Stop the previous process and retry.`);
    process.exit(1);
  }
  console.error("[server] HTTP server error:", err);
});

wss.on("error", (err: NodeJS.ErrnoException) => {
  if (err.code === "EADDRINUSE") {
    return; // already handled by server error above
  }
  console.error("[server] WebSocket server error:", err);
});

const googleClientId = process.env.GOOGLE_CLIENT_ID;
const googleClientSecret = process.env.GOOGLE_CLIENT_SECRET;
const configuredFrontendAppUrl = normalizeUrl(process.env.APP_URL);
const configuredApiPublicUrl = normalizeUrl(process.env.API_PUBLIC_URL);
const configuredGoogleRedirectUri = normalizeUrl(process.env.GOOGLE_OAUTH_REDIRECT_URI);
const oauthStateSecret = process.env.GOOGLE_OAUTH_STATE_SECRET;
const tokenEncryptionSecret = process.env.GOOGLE_TOKEN_ENCRYPTION_KEY;

if (!oauthStateSecret || !tokenEncryptionSecret) {
  const missing = [
    !oauthStateSecret && "GOOGLE_OAUTH_STATE_SECRET",
    !tokenEncryptionSecret && "GOOGLE_TOKEN_ENCRYPTION_KEY",
  ].filter(Boolean);
  throw new Error(
    `Missing required environment variables: ${missing.join(", ")}. Set each secret independently before starting the server.`
  );
}
const openaiApiKey = process.env.OPENAI_API_KEY;
const openaiApiKeySource = process.env.OPENAI_API_KEY ? "OPENAI_API_KEY" : null;
const OPENAI_ANALYSIS_MODEL = process.env.OPENAI_ANALYSIS_MODEL || "gpt-4.1-mini";
const OPENAI_CHAT_MODEL = process.env.OPENAI_CHAT_MODEL || "gpt-4.1-mini";
const OPENAI_EMBEDDING_MODEL = process.env.OPENAI_EMBEDDING_MODEL || "text-embedding-3-small";
const OPENAI_EMBEDDING_DIMENSIONS = Number(process.env.OPENAI_EMBEDDING_DIMENSIONS) > 0
  ? Number(process.env.OPENAI_EMBEDDING_DIMENSIONS)
  : 768;
const openai = openaiApiKey ? new OpenAI({ apiKey: openaiApiKey }) : null;
const OPTIONAL_ANALYSIS_COLUMNS = new Set([
  "embedding",
  "entities",
  "is_sensitive",
  "safety_reason",
  "last_analyzed_at",
]);
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
const GOOGLE_SOURCE_TYPE = "google_drive";

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

type ScreenshotEntities = {
  dates: string[];
  amounts: string[];
  emails: string[];
  urls: string[];
  phones: string[];
  order_ids: string[];
  merchant?: string;
};

type ScreenshotAnalysisResult = {
  category: string;
  summary: string;
  ocr_text: string;
  tags: string[];
  entities: ScreenshotEntities;
  safety: {
    contains_sensitive: boolean;
    reason: string;
  };
};

type ConnectedClient = {
  userId: string;
};

const clients = new Map<WebSocket, ConnectedClient>();

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

function getOpenAIClient() {
  if (!openai) {
    throw new Error("Missing OpenAI API key. Set OPENAI_API_KEY on the backend runtime.");
  }

  return openai;
}

function createRequestId() {
  return crypto.randomUUID().slice(0, 8);
}

function redactUserId(userId?: string | null) {
  if (!userId) return null;
  return `${userId.slice(0, 8)}...`;
}

function serializeError(error: unknown) {
  if (error instanceof Error) {
    const err = error as Error & {
      status?: number;
      code?: string;
      details?: unknown;
      hint?: unknown;
      cause?: unknown;
    };

    return {
      name: err.name,
      message: err.message,
      status: err.status ?? null,
      code: err.code ?? null,
      details: err.details ?? null,
      hint: err.hint ?? null,
      cause: err.cause instanceof Error ? err.cause.message : err.cause ?? null,
      stack: err.stack ?? null,
    };
  }

  return { value: error };
}

function logRouteInfo(route: string, requestId: string, details: Record<string, unknown>) {
  console.log(`[${route}] ${JSON.stringify({ requestId, ...details })}`);
}

function logRouteWarn(route: string, requestId: string, details: Record<string, unknown>) {
  console.warn(`[${route}] ${JSON.stringify({ requestId, ...details })}`);
}

function logRouteError(
  route: string,
  requestId: string,
  req: Request | null,
  error: unknown,
  details: Record<string, unknown> = {},
) {
  console.error(
    `[${route}] ${JSON.stringify({
      requestId,
      userId: redactUserId(req?.user?.id),
      ...details,
      error: serializeError(error),
    })}`,
  );
}

function buildAnalysisPrompt() {
  return `Analyze this screenshot and return only valid JSON with the following fields:
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
}`;
}

const SCREENSHOT_ANALYSIS_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    category: {
      type: "string",
      enum: ["Chat", "Receipt", "Social Media", "Email", "Document", "Meme", "Banking", "E-commerce", "Booking", "Other"],
    },
    summary: { type: "string" },
    ocr_text: { type: "string" },
    tags: {
      type: "array",
      items: { type: "string" },
    },
    entities: {
      type: "object",
      additionalProperties: false,
      properties: {
        dates: { type: "array", items: { type: "string" } },
        amounts: { type: "array", items: { type: "string" } },
        emails: { type: "array", items: { type: "string" } },
        urls: { type: "array", items: { type: "string" } },
        phones: { type: "array", items: { type: "string" } },
        order_ids: { type: "array", items: { type: "string" } },
        merchant: { type: "string" },
      },
      required: ["dates", "amounts", "emails", "urls", "phones", "order_ids", "merchant"],
    },
    safety: {
      type: "object",
      additionalProperties: false,
      properties: {
        contains_sensitive: { type: "boolean" },
        reason: { type: "string" },
      },
      required: ["contains_sensitive", "reason"],
    },
  },
  required: ["category", "summary", "ocr_text", "tags", "entities", "safety"],
} as const;

const SCREENSHOT_ANSWER_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    answer: { type: "string" },
    used_ids: {
      type: "array",
      items: {
        anyOf: [{ type: "string" }, { type: "number" }],
      },
    },
  },
  required: ["answer", "used_ids"],
} as const;

function normalizeStringArray(value: unknown) {
  if (!Array.isArray(value)) return [];

  return [...new Set(
    value
      .filter((entry): entry is string => typeof entry === "string")
      .map((entry) => entry.trim())
      .filter(Boolean),
  )];
}

function normalizeAnalysisResult(raw: any): ScreenshotAnalysisResult {
  const allowedCategories = new Set([
    "Chat",
    "Receipt",
    "Social Media",
    "Email",
    "Document",
    "Meme",
    "Banking",
    "E-commerce",
    "Booking",
    "Other",
  ]);

  const category = typeof raw?.category === "string" && allowedCategories.has(raw.category)
    ? raw.category
    : "Other";
  const summary = typeof raw?.summary === "string" ? raw.summary.trim() : "";
  const ocr_text = typeof raw?.ocr_text === "string" ? raw.ocr_text : "";
  const tags = normalizeStringArray(raw?.tags);
  const entities = {
    dates: normalizeStringArray(raw?.entities?.dates),
    amounts: normalizeStringArray(raw?.entities?.amounts),
    emails: normalizeStringArray(raw?.entities?.emails),
    urls: normalizeStringArray(raw?.entities?.urls),
    phones: normalizeStringArray(raw?.entities?.phones),
    order_ids: normalizeStringArray(raw?.entities?.order_ids),
    merchant: typeof raw?.entities?.merchant === "string" ? raw.entities.merchant.trim() : "",
  } satisfies ScreenshotEntities;

  return {
    category,
    summary,
    ocr_text,
    tags,
    entities,
    safety: {
      contains_sensitive: Boolean(raw?.safety?.contains_sensitive),
      reason: typeof raw?.safety?.reason === "string" ? raw.safety.reason.trim() : "",
    },
  };
}

function normalizeAnalyzeMimeType(mimeType?: string | null) {
  const normalized = mimeType?.trim().toLowerCase();
  if (!normalized) return "image/png";
  return normalized.startsWith("image/") ? normalized : "image/png";
}

function decodeBase64Image(base64Image: string) {
  const trimmed = base64Image.trim();
  if (!trimmed) {
    throw new Error("Image payload is empty.");
  }

  const normalized = trimmed.replace(/^data:[^;]+;base64,/i, "").replace(/\s+/g, "");
  const buffer = Buffer.from(normalized, "base64");
  if (!buffer.length) {
    throw new Error("Decoded image buffer is empty.");
  }

  return { base64: normalized, buffer };
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

function mapSourceTypeToProvider(type?: string | null) {
  if (type === GOOGLE_SOURCE_TYPE) return "googleDrive";
  return null;
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
      row.source === GOOGLE_SOURCE_TYPE
        ? "googleDrive"
        : "upload",
    isAnalyzed: !!(row.is_analyzed === 1 || row.is_analyzed === true),
    isSensitive: !!(row.is_sensitive === 1 || row.is_sensitive === true),
    safetyReason: row.safety_reason || "",
    embedding: row.embedding,
  };
}

function serializeCloudSource(row: any) {
  const provider = mapSourceTypeToProvider(row.type);
  if (!provider) {
    return null;
  }

  return {
    id: row.id,
    provider,
    status: row.status === "error" ? "error" : row.status === "connected" ? "connected" : "disconnected",
    connectedAt: row.connected_at ? new Date(row.connected_at).getTime() : undefined,
    lastSyncAt: row.last_sync ? new Date(row.last_sync).getTime() : undefined,
    accountEmail: row.email || undefined,
    settings: parseSourceSettings(row.settings),
  };
}

function isImportIdentityConflict(error: any) {
  if (!error || typeof error !== "object") {
    return false;
  }

  return error.code === "23505" && (
    error.constraint === "screenshots_source_import_identity_uidx" ||
    String(error.message || "").includes("screenshots_source_import_identity_uidx")
  );
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

async function removeStorageObjectBestEffort(storagePath: string) {
  try {
    await supabase.storage.from("screenshots").remove([storagePath]);
  } catch (error) {
    console.warn(`[upload] Failed to roll back storage object ${storagePath}:`, error);
  }
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

async function authenticateRequestToken(token: string) {
  const { data, error } = await supabase.auth.getUser(token);
  if (error || !data.user) {
    return null;
  }

  return {
    accessToken: token,
    user: data.user,
  };
}

async function requireAuth(req: Request, res: Response, next: NextFunction) {
  try {
    const token = getBearerToken(req);
    if (!token) {
      return res.status(401).json({ error: "Missing bearer token" });
    }

    const authenticated = await authenticateRequestToken(token);
    if (!authenticated?.user) {
      return res.status(401).json({ error: "Invalid or expired token" });
    }

    req.accessToken = authenticated.accessToken;
    req.user = authenticated.user;
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
  clients.forEach((clientInfo, client) => {
    if (clientInfo.userId === userId && client.readyState === WebSocket.OPEN) {
      client.send(message);
    }
  });
}

// --- In-memory rate limiter ---
const _rlStore = new Map<string, { count: number; resetAt: number }>();
setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of _rlStore) {
    if (now > entry.resetAt) _rlStore.delete(key);
  }
}, 5 * 60 * 1000);

function rateLimit(prefix: string, limit: number, windowMs: number) {
  return (req: Request, res: Response, next: NextFunction) => {
    const userId = req.user?.id ?? req.ip ?? "anon";
    const key = `${prefix}:${userId}`;
    const now = Date.now();
    const entry = _rlStore.get(key);
    if (!entry || now > entry.resetAt) {
      _rlStore.set(key, { count: 1, resetAt: now + windowMs });
      return next();
    }
    if (entry.count >= limit) {
      return res.status(429).json({ error: "Too many requests. Please try again later." });
    }
    entry.count++;
    next();
  };
}

wss.on("connection", (ws) => {
  // Require auth message within 5 seconds or close
  const authTimeout = setTimeout(() => {
    ws.close(1008, "Authentication timeout");
  }, 5000);

  ws.once("message", async (rawMessage) => {
    clearTimeout(authTimeout);
    try {
      const parsed = JSON.parse(rawMessage.toString());
      if (parsed?.type !== "auth" || typeof parsed.token !== "string") {
        ws.close(1008, "Authentication required");
        return;
      }

      const authenticated = await authenticateRequestToken(parsed.token);
      if (!authenticated?.user) {
        ws.close(1008, "Invalid token");
        return;
      }

      clients.set(ws, {
        userId: authenticated.user.id,
      });

      ws.on("close", () => {
        clients.delete(ws);
      });
    } catch (error) {
      console.error("WebSocket auth failed:", error);
      ws.close(1011, "Authentication failed");
    }
  });
});

app.use(express.json({ limit: '10mb' }));
app.use((req, res, next) => {
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Headers", "Content-Type, Authorization");
  res.header("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  if (req.method === "OPTIONS") return res.sendStatus(204);
  next();
});

// Multer Setup
const ALLOWED_UPLOAD_MIME_TYPES = new Set([
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/webp",
  "image/gif",
  "image/heic",
  "image/bmp",
]);

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOADS_DIR),
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
    cb(null, uniqueSuffix + path.extname(file.originalname));
  },
});
const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (ALLOWED_UPLOAD_MIME_TYPES.has(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error(`File type not allowed: ${file.mimetype}. Upload JPEG, PNG, WebP, GIF, HEIC, or BMP images only.`));
    }
  },
});

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

app.get("/api/screenshots/:id/image", requireAuth, async (req, res) => {
  const requestId = createRequestId();

  try {
    if (!req.user) {
      return res.status(401).json({ error: "Authentication required", requestId });
    }

    const screenshotId = String(req.params.id || "").trim();
    if (!screenshotId || screenshotId.length > 100) {
      return res.status(400).json({ error: "Invalid screenshot id", requestId });
    }

    const asset = await loadOwnedScreenshotAsset(screenshotId, req.user.id);
    if (!asset) {
      return res.status(404).json({ error: "Screenshot not found", requestId });
    }

    const inlineFilename = sanitizeStorageFilename(asset.filename);
    res.setHeader("Cache-Control", "private, no-store, max-age=0");
    res.setHeader("Content-Disposition", `inline; filename="${inlineFilename}"`);
    res.setHeader("Content-Length", asset.buffer.length.toString());
    res.setHeader("Content-Type", asset.mimeType);
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.send(asset.buffer);
  } catch (error) {
    logRouteError("/api/screenshots/:id/image", requestId, req, error, {
      screenshotId: req.params.id,
    });
    res.status(500).json({ error: "Failed to load screenshot image", requestId });
  }
});

app.delete("/api/screenshots/:id", requireAuth, async (req, res) => {
  const requestId = createRequestId();

  try {
    if (!req.user) {
      return res.status(401).json({ error: "Authentication required", requestId });
    }

    const screenshotId = String(req.params.id || "").trim();
    if (!screenshotId || screenshotId.length > 100) {
      return res.status(400).json({ error: "Invalid screenshot id", requestId });
    }

    const { data: screenshot, error: lookupError } = await supabase
      .from("screenshots")
      .select("id, storage_path, filename")
      .eq("id", screenshotId)
      .eq("user_id", req.user.id)
      .maybeSingle();

    if (lookupError) {
      throw lookupError;
    }

    if (!screenshot) {
      return res.status(404).json({ error: "Screenshot not found", requestId });
    }

    const storagePath = screenshot.storage_path
      || (typeof screenshot.filename === "string" && screenshot.filename.includes("/") ? screenshot.filename : null);

    if (storagePath) {
      await removeStorageObjectBestEffort(storagePath);
    } else if (typeof screenshot.filename === "string") {
      const localFilename = path.basename(screenshot.filename);
      const filePath = path.join(UPLOADS_DIR, localFilename);
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }
    }

    const { error: tagsDeleteError } = await supabase
      .from("tags")
      .delete()
      .eq("screenshot_id", screenshotId);

    if (tagsDeleteError) {
      throw tagsDeleteError;
    }

    const { error: deleteError } = await supabase
      .from("screenshots")
      .delete()
      .eq("id", screenshotId)
      .eq("user_id", req.user.id);

    if (deleteError) {
      throw deleteError;
    }

    res.json({ success: true, requestId });
  } catch (error) {
    logRouteError("/api/screenshots/:id", requestId, req, error, {
      screenshotId: req.params.id,
    });
    res.status(500).json({ error: "Failed to delete screenshot", requestId });
  }
});

// AI Service Logic
async function analyzeScreenshot(buffer: Buffer, mimeType = "image/png") {
  const imageData = buffer.toString("base64");
  const normalizedMimeType = normalizeAnalyzeMimeType(mimeType);

  const response = await getOpenAIClient().chat.completions.create({
    model: OPENAI_ANALYSIS_MODEL,
    messages: [
      {
        role: "system",
        content: "You analyze screenshots and return structured metadata.",
      },
      {
        role: "user",
        content: [
          { type: "text", text: buildAnalysisPrompt() },
          {
            type: "image_url",
            image_url: {
              url: `data:${normalizedMimeType};base64,${imageData}`,
            },
          },
        ],
      },
    ],
    response_format: {
      type: "json_schema",
      json_schema: {
        name: "screenshot_analysis",
        strict: true,
        schema: SCREENSHOT_ANALYSIS_SCHEMA,
      },
    },
  });

  return normalizeAnalysisResult(parseJsonResponse(extractChatCompletionText(response)));
}

async function generateEmbedding(text: string) {
  const normalizedText = text.trim();
  if (!normalizedText) {
    return [];
  }

  const result = await getOpenAIClient().embeddings.create({
    model: OPENAI_EMBEDDING_MODEL,
    input: normalizedText,
    encoding_format: "float",
    ...(OPENAI_EMBEDDING_MODEL.startsWith("text-embedding-3")
      ? { dimensions: OPENAI_EMBEDDING_DIMENSIONS }
      : {}),
  });

  const values = result.data[0]?.embedding;
  if (!Array.isArray(values) || values.length === 0) {
    throw new Error("Empty embedding response from AI");
  }

  if (values.length !== OPENAI_EMBEDDING_DIMENSIONS) {
    throw new Error(
      `Unexpected embedding dimension: got ${values.length}, expected ${OPENAI_EMBEDDING_DIMENSIONS}`,
    );
  }

  return values;
}

type ChatCompletionTextResponse = {
  choices?: Array<{
    message?: {
      content?: string | Array<{ type?: string; text?: string }>;
      refusal?: string | null;
    };
  }>;
};

// Frontend-facing AI proxy endpoints (used when frontend sets VITE_API_URL)
function extractChatCompletionText(response: ChatCompletionTextResponse) {
  const message = response.choices[0]?.message;
  if (!message) {
    throw new Error("Empty response from AI");
  }

  if (message.refusal) {
    throw new Error(`AI refused request: ${message.refusal}`);
  }

  if (typeof message.content === "string") {
    return message.content;
  }

  if (Array.isArray(message.content)) {
    return message.content
      .filter((part): part is { type: "text"; text: string } => part.type === "text" && typeof part.text === "string")
      .map((part) => part.text)
      .join("\n")
      .trim();
  }

  return "";
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

type AskContextItem = {
  id?: string | number | null;
  category?: string | null;
  summary?: string | null;
  ocrText?: string | null;
  ocr_text?: string | null;
  tags?: unknown;
  entities?: unknown;
};

type AskHistoryItem = {
  role?: string | null;
  text?: string | null;
};

function buildAskContextText(context: unknown) {
  if (typeof context === "string") {
    return context.trim();
  }

  if (!Array.isArray(context)) {
    return "";
  }

  return context
    .filter((item): item is AskContextItem => Boolean(item) && typeof item === "object")
    .map((item) => {
      const id = typeof item.id === "string" || typeof item.id === "number" ? item.id : null;
      const category = typeof item.category === "string" ? item.category.trim() : "";
      const summary = typeof item.summary === "string" ? item.summary.trim() : "";
      const ocrText = typeof item.ocrText === "string"
        ? item.ocrText
        : typeof item.ocr_text === "string"
          ? item.ocr_text
          : "";
      const tags = normalizeStringArray(item.tags);
      const entities = item.entities && typeof item.entities === "object"
        ? JSON.stringify(item.entities)
        : "{}";

      return [
        id !== null ? `ID: ${id}` : null,
        category ? `Category: ${category}` : null,
        summary ? `Summary: ${summary}` : null,
        ocrText ? `OCR Text: ${ocrText}` : null,
        tags.length > 0 ? `Tags: ${tags.join(", ")}` : null,
        `Entities: ${entities}`,
      ]
        .filter((line): line is string => Boolean(line))
        .join("\n");
    })
    .filter(Boolean)
    .join("\n---\n");
}

function buildAskHistoryText(history: unknown) {
  if (!Array.isArray(history)) {
    return "";
  }

  return history
    .filter((item): item is AskHistoryItem => Boolean(item) && typeof item === "object")
    .map((item) => {
      const role = item.role === "ai" ? "Assistant" : item.role === "user" ? "User" : null;
      const text = typeof item.text === "string" ? item.text.trim() : "";

      if (!role || !text) {
        return null;
      }

      return `${role}: ${text}`;
    })
    .filter((line): line is string => Boolean(line))
    .slice(-8)
    .join("\n");
}

async function downloadScreenshotFromStorage(storagePath: string) {
  const { data, error } = await supabase.storage
    .from("screenshots")
    .download(storagePath);

  if (error || !data) {
    throw error || new Error(`Failed to download screenshots/${storagePath}`);
  }

  const buffer = Buffer.from(await data.arrayBuffer());
  if (!buffer.length) {
    throw new Error(`Downloaded screenshots/${storagePath} but the file was empty.`);
  }

  return buffer;
}

type OwnedScreenshotAsset = {
  buffer: Buffer;
  filename: string;
  mimeType: string;
  storagePath: string | null;
};

async function loadOwnedScreenshotAsset(screenshotId: string, userId: string): Promise<OwnedScreenshotAsset | null> {
  const { data: screenshot, error } = await supabase
    .from("screenshots")
    .select("id, storage_path, filename, original_name")
    .eq("id", screenshotId)
    .eq("user_id", userId)
    .maybeSingle();

  if (error) {
    throw error;
  }

  if (!screenshot) {
    return null;
  }

  const storagePath = screenshot.storage_path
    || (typeof screenshot.filename === "string" && screenshot.filename.includes("/") ? screenshot.filename : null);
  const sourceName = screenshot.original_name || screenshot.filename || `screenshot-${screenshotId}.png`;
  const mimeType = resolveMimeType(sourceName);

  if (storagePath) {
    return {
      buffer: await downloadScreenshotFromStorage(storagePath),
      filename: sourceName,
      mimeType,
      storagePath,
    };
  }

  const localFilename = typeof screenshot.filename === "string" ? path.basename(screenshot.filename) : null;
  if (!localFilename) {
    throw new Error("Screenshot is missing a readable file path.");
  }

  const filePath = path.join(UPLOADS_DIR, localFilename);
  if (!fs.existsSync(filePath)) {
    throw new Error(`Screenshot file is missing for ${localFilename}.`);
  }

  const buffer = fs.readFileSync(filePath);
  if (!buffer.length) {
    throw new Error(`Screenshot file ${localFilename} was empty.`);
  }

  return {
    buffer,
    filename: sourceName,
    mimeType,
    storagePath: null,
  };
}

async function replaceScreenshotTags(screenshotId: string, tags: string[]) {
  const normalizedTags = normalizeStringArray(tags);

  const { error: deleteError } = await supabase
    .from("tags")
    .delete()
    .eq("screenshot_id", screenshotId);

  if (deleteError) {
    throw deleteError;
  }

  if (normalizedTags.length === 0) {
    return normalizedTags;
  }

  const { error: insertError } = await supabase
    .from("tags")
    .insert(normalizedTags.map((tag) => ({ screenshot_id: screenshotId, tag })));

  if (insertError) {
    throw insertError;
  }

  return normalizedTags;
}

async function replaceScreenshotTagsBestEffort(route: string, screenshotId: string, tags: string[]) {
  try {
    await replaceScreenshotTags(screenshotId, tags);
  } catch (error) {
    logRouteError(route, "n/a", null, error, {
      stage: "tags-warning",
      screenshotId,
      warning: "Analysis row saved, but tag rows did not persist.",
    });
  }
}

function buildAnalysisUpdatePayload(analysis: ScreenshotAnalysisResult, embedding: number[]) {
  return {
    category: analysis.category,
    summary: analysis.summary,
    ocr_text: analysis.ocr_text,
    entities: analysis.entities,
    embedding,
    is_sensitive: analysis.safety.contains_sensitive ? 1 : 0,
    is_analyzed: 1,
    safety_reason: analysis.safety.reason || "",
    last_analyzed_at: new Date().toISOString(),
  };
}

function extractMissingColumn(error: any) {
  const combined = [error?.message, error?.details, error?.hint]
    .filter((value): value is string => typeof value === "string" && value.length > 0)
    .join(" ");

  const match = combined.match(/'([a-zA-Z0-9_]+)' column/);
  return match?.[1] ?? null;
}

async function persistAnalysisForScreenshot(params: {
  requestId: string;
  route: string;
  screenshotId: string;
  userId: string;
  analysis: ScreenshotAnalysisResult;
  embedding: number[];
}) {
  const { analysis, embedding, requestId, route, screenshotId, userId } = params;
  const warnings: string[] = [];
  const updatePayload: Record<string, any> = buildAnalysisUpdatePayload(analysis, embedding);

  while (true) {
    const { error } = await supabase
      .from("screenshots")
      .update(updatePayload)
      .eq("id", screenshotId)
      .eq("user_id", userId);

    if (!error) {
      break;
    }

    const missingColumn = extractMissingColumn(error);
    if (missingColumn && OPTIONAL_ANALYSIS_COLUMNS.has(missingColumn) && missingColumn in updatePayload) {
      delete updatePayload[missingColumn];
      const warning = `screenshots.${missingColumn} is missing in production; skipped persisting it.`;
      warnings.push(warning);
      logRouteWarn(route, requestId, {
        stage: "db-update-warning",
        screenshotId,
        warning,
      });
      continue;
    }

    throw error;
  }

  try {
    await replaceScreenshotTags(screenshotId, analysis.tags);
  } catch (tagError) {
    const warning = "Failed to persist tags rows; analysis row saved without tag records.";
    warnings.push(warning);
    logRouteError(route, requestId, null, tagError, {
      stage: "tags-warning",
      screenshotId,
      warning,
    });
  }

  return { warnings, persistedColumns: Object.keys(updatePayload) };
}

app.post("/api/analyze", requireAuth, rateLimit("analyze", 30, 15 * 60 * 1000), async (req, res) => {
  const requestId = createRequestId();
  const startedAt = Date.now();

  try {
    if (!req.user) {
      return res.status(401).json({ error: "Authentication required", requestId });
    }

    const { image, mimeType, screenshotId } = req.body ?? {};

    if (screenshotId !== undefined && (typeof screenshotId !== "string" || screenshotId.length > 100)) {
      return res.status(400).json({ error: "Invalid screenshotId.", requestId });
    }

    const normalizedMimeType = normalizeAnalyzeMimeType(mimeType);
    let buffer: Buffer;
    let storagePath: string | null = null;

    if (screenshotId) {
      const asset = await loadOwnedScreenshotAsset(screenshotId, req.user.id);
      if (!asset) {
        return res.status(404).json({ error: "Screenshot not found", requestId });
      }

      storagePath = asset.storagePath;
      buffer = asset.buffer;
    } else {
      if (!image || typeof image !== "string") {
        return res.status(400).json({ error: "No image data", requestId });
      }

      // ~7 MB base64 ≈ 5 MB decoded
      if (image.length > 7 * 1024 * 1024) {
        return res.status(413).json({ error: "Image payload too large. Maximum ~5 MB.", requestId });
      }

      const decodedImage = decodeBase64Image(image);
      buffer = decodedImage.buffer;
    }

    logRouteInfo("/api/analyze", requestId, {
      stage: "start",
      userId: redactUserId(req.user.id),
      screenshotId: screenshotId ?? null,
      storagePath,
      mimeType: normalizedMimeType,
      imageBytes: buffer.length,
      openaiApiKeySource,
      analysisModel: OPENAI_ANALYSIS_MODEL,
    });

    const analysis = await analyzeScreenshot(buffer, normalizedMimeType);
    let embedding: number[] | undefined;
    let saveWarnings: string[] = [];

    if (screenshotId) {
      embedding = await generateEmbedding(`${analysis.summary} ${analysis.ocr_text}`.trim());
      const persistence = await persistAnalysisForScreenshot({
        requestId,
        route: "/api/analyze",
        screenshotId: String(screenshotId),
        userId: req.user.id,
        analysis,
        embedding,
      });
      saveWarnings = persistence.warnings;
    }

    logRouteInfo("/api/analyze", requestId, {
      stage: "success",
      userId: redactUserId(req.user.id),
      screenshotId: screenshotId ?? null,
      storagePath,
      durationMs: Date.now() - startedAt,
      category: analysis.category,
      tagCount: analysis.tags.length,
      ocrChars: analysis.ocr_text.length,
      embeddingLength: embedding?.length ?? null,
      saveWarnings,
    });

    res.json({
      requestId,
      ...analysis,
      ...(embedding ? { embedding } : {}),
      ...(screenshotId ? { screenshotId, saveWarnings } : {}),
    });
  } catch (error) {
    logRouteError("/api/analyze", requestId, req, error, {
      stage: "failed",
      durationMs: Date.now() - startedAt,
      screenshotId: req.body?.screenshotId ?? null,
      hasImage: typeof req.body?.image === "string",
      imageLength: typeof req.body?.image === "string" ? req.body.image.length : null,
      mimeType: normalizeAnalyzeMimeType(req.body?.mimeType),
      openaiApiKeySource,
      analysisModel: OPENAI_ANALYSIS_MODEL,
    });
    res.status(500).json({ error: "Analysis failed", requestId });
  }
});

app.post("/api/embed", requireAuth, rateLimit("embed", 60, 15 * 60 * 1000), async (req, res) => {
  const requestId = createRequestId();
  try {
    const { text } = req.body;
    if (!text || typeof text !== "string") return res.status(400).json({ error: "No text provided", requestId });
    if (text.length > 5000) return res.status(400).json({ error: "Text too long. Maximum 5000 characters.", requestId });
    const embedding = await generateEmbedding(text);
    res.json({ embedding, requestId });
  } catch (error) {
    logRouteError("/api/embed", requestId, req, error, {
      stage: "failed",
      textLength: typeof req.body?.text === "string" ? req.body.text.length : null,
      embeddingModel: OPENAI_EMBEDDING_MODEL,
      openaiApiKeySource,
    });
    res.status(500).json({ error: "Embedding failed", requestId });
  }
});

app.post("/api/ask", requireAuth, rateLimit("ask", 30, 15 * 60 * 1000), async (req, res) => {
  const requestId = createRequestId();
  const startedAt = Date.now();

  try {
    if (!req.user) {
      return res.status(401).json({ error: "Authentication required", requestId });
    }

    const { question, context, history } = req.body;
    if (!question || typeof question !== "string") {
      return res.status(400).json({ error: "No question provided", requestId });
    }
    if (question.length > 1000) {
      return res.status(400).json({ error: "Question too long. Maximum 1000 characters.", requestId });
    }
    if (Array.isArray(context) && context.length > 50) {
      return res.status(400).json({ error: "Too many context items. Maximum 50.", requestId });
    }
    if (Array.isArray(history) && history.length > 20) {
      return res.status(400).json({ error: "Too many history items. Maximum 20.", requestId });
    }

    const contextText = buildAskContextText(context);
    const historyText = buildAskHistoryText(history);

    logRouteInfo("/api/ask", requestId, {
      stage: "start",
      userId: redactUserId(req.user.id),
      questionLength: typeof question === "string" ? question.length : null,
      contextLength: contextText.length,
      contextItems: Array.isArray(context) ? context.length : null,
      historyItems: Array.isArray(history) ? history.length : null,
      chatModel: OPENAI_CHAT_MODEL,
      openaiApiKeySource,
    });

    const response = await getOpenAIClient().chat.completions.create({
      model: OPENAI_CHAT_MODEL,
      messages: [
        {
          role: "system",
          content: "You are an AI assistant helping a user with their screenshots. Use the provided screenshot context and recent conversation when answering. If screenshot context is missing, say that clearly and briefly explain why instead of inventing details.",
        },
        {
          role: "user",
          content: `Return valid JSON matching the required schema.\n\nScreenshot Context:\n${contextText || "(no context provided)"}\n\nRecent Conversation:\n${historyText || "(no prior conversation)"}\n\nCurrent Question: ${question}`,
        },
      ],
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "screenshot_answer",
          strict: true,
          schema: SCREENSHOT_ANSWER_SCHEMA,
        },
      },
    });

    const parsed = parseJsonResponse(extractChatCompletionText(response));
    const payload = {
      answer: typeof parsed?.answer === "string" ? parsed.answer : "",
      used_ids: Array.isArray(parsed?.used_ids)
        ? parsed.used_ids.filter((value: unknown): value is string | number => typeof value === "string" || typeof value === "number")
        : [],
      requestId,
    };

    logRouteInfo("/api/ask", requestId, {
      stage: "success",
      userId: redactUserId(req.user.id),
      durationMs: Date.now() - startedAt,
      answerLength: payload.answer.length,
      usedIdsCount: payload.used_ids.length,
    });

    res.json(payload);
  } catch (error) {
    logRouteError("/api/ask", requestId, req, error, {
      stage: "failed",
      durationMs: Date.now() - startedAt,
      questionLength: typeof req.body?.question === "string" ? req.body.question.length : null,
      contextType: Array.isArray(req.body?.context) ? "array" : typeof req.body?.context,
      historyItems: Array.isArray(req.body?.history) ? req.body.history.length : null,
      openaiApiKeySource,
      chatModel: OPENAI_CHAT_MODEL,
    });
    res.status(500).json({ error: "Ask failed", requestId });
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
    res.status(500).json({ error: "Failed to create Google OAuth URL. Check server configuration." });
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
        type: GOOGLE_SOURCE_TYPE,
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
    .select('id, type, email, last_sync, status, connected_at, settings')
    .eq('user_id', req.user.id)
    .eq('type', GOOGLE_SOURCE_TYPE);

  if (error) return res.status(500).json({ error: "Failed to load sources." });

  res.json(
    sources
      .map((source: any) => serializeCloudSource(source))
      .filter(Boolean)
  );
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

  if (error) return res.status(500).json({ error: "Failed to update source settings." });
  if (!updatedSource) return res.status(404).json({ error: "Source not found" });

  res.json({ success: true });
});

app.post("/api/sources/:id/disconnect", requireAuth, async (req, res) => {
  const { id } = req.params;
  if (!req.user) return res.status(401).json({ error: "Authentication required" });

  const source = await getOwnedSource(id, req.user.id);
  if (!source || source.type !== GOOGLE_SOURCE_TYPE) {
    return res.status(404).json({ error: "Source not found" });
  }

  if (source && source.type === GOOGLE_SOURCE_TYPE) {
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

  if (error) return res.status(500).json({ error: "Failed to disconnect source." });
  res.json({ success: true });
});

// Sync Logic
app.post("/api/sync", requireAuth, rateLimit("sync", 5, 15 * 60 * 1000), async (req, res) => {
  if (!req.user) return res.status(401).json({ error: "Authentication required" });

  const { sourceId } = req.body ?? {};
  let sourcesQuery = supabase
    .from('cloud_sources')
    .select('*')
    .eq('user_id', req.user.id)
    .eq('type', GOOGLE_SOURCE_TYPE);

  if (sourceId) {
    sourcesQuery = sourcesQuery.eq('id', sourceId);
  }

  const { data: sources, error } = await sourcesQuery;
  if (error) return res.status(500).json({ error: "Failed to load sources for sync." });

  let totalSynced = 0;
  let results: any[] = [];

  for (const source of sources as any) {
    const settings = parseSourceSettings(source.settings);

    if (source.type === GOOGLE_SOURCE_TYPE) {
      try {
        const auth = await createGoogleDriveAuth(source, req.user.id);
        const drive = google.drive({ version: "v3", auth });

        const dateLimit = new Date();
        dateLimit.setDate(dateLimit.getDate() - settings.dateRangeDays);
        const rfc3339Date = dateLimit.toISOString();
        const maxFiles = Math.min(Math.max(settings.maxFiles, 1), 500);
        const filenameKeywordClauses = settings.keywords
          .map((keyword: string) => keyword.trim())
          .filter(Boolean)
          .map((keyword: string) => `name contains '${escapeDriveQueryValue(keyword)}'`);

        const folderQuery = "mimeType = 'application/vnd.google-apps.folder' and trashed = false and (name contains 'Screenshot' or name contains 'screenshot')";
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
        const discoveryClauses: string[] = [];

        if (folders.length > 0) {
          const parentQueries = folders
            .filter((folder) => folder.id)
            .map((folder) => `'${folder.id}' in parents`);

          if (parentQueries.length > 0) {
            discoveryClauses.push(`(${parentQueries.join(" or ")})`);
          }
        }

        if (filenameKeywordClauses.length > 0) {
          discoveryClauses.push(`(${filenameKeywordClauses.join(" or ")})`);
        }

        let q = `trashed = false and (mimeType contains 'image/' or mimeType = 'application/octet-stream') and modifiedTime > '${rfc3339Date}'`;

        if (discoveryClauses.length > 0) {
          q += ` and (${discoveryClauses.join(" or ")})`;
        }

        const files: any[] = [];
        let pageToken: string | undefined;
        do {
          const response = await drive.files.list({
            q,
            fields: "nextPageToken, files(id, name, mimeType, modifiedTime, webViewLink)",
            pageSize: Math.min(100, maxFiles - files.length),
            pageToken,
            orderBy: "modifiedTime desc",
            includeItemsFromAllDrives: true,
            supportsAllDrives: true,
            spaces: "drive",
          });

          files.push(...(response.data.files || []));
          pageToken = response.data.nextPageToken ?? undefined;
        } while (pageToken && files.length < maxFiles);

        let sourceSynced = 0;
        let sourceSkipped = 0;
        let sourceErrors = 0;

        for (const file of files) {
          // Check if already synced
          const { data: existing, error: existingError } = await supabase
            .from('screenshots')
            .select('id')
            .eq('user_id', req.user.id)
            .eq('source_id', source.id)
            .eq('external_id', file.id)
            .limit(1);

          if (existingError) {
            throw existingError;
          }

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
                entities: analysis.entities,
                embedding: embedding,
                is_sensitive: analysis.safety?.contains_sensitive ? 1 : 0,
                is_analyzed: 1,
                safety_reason: analysis.safety?.reason || "",
                last_analyzed_at: new Date().toISOString(),
                source_id: source.id,
                external_id: file.id,
                upload_date: file.modifiedTime || new Date().toISOString(),
              }])
              .select()
              .single();

            if (isImportIdentityConflict(insError)) {
              await removeStorageObjectBestEffort(storagePath);
              sourceSkipped++;
              continue;
            }

            if (insError || !insertedScreenshot) {
              await removeStorageObjectBestEffort(storagePath);
              throw insError || new Error("Google Drive screenshot insert returned no row.");
            }
            await replaceScreenshotTagsBestEffort("/api/sync", insertedScreenshot.id, analysis.tags);
            console.log("Supabase insert success (Google Drive):", insertedScreenshot.id);

            sourceSynced++;
            totalSynced++;

            // Broadcast new file
            broadcastToUser(req.user.id, {
              type: 'google:newFile',
              data: buildRealtimeScreenshotPayload({
                ...insertedScreenshot,
                source: GOOGLE_SOURCE_TYPE,
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

  const hasSourceFailure = results.some((result) => Boolean(result.error));
  res
    .status(hasSourceFailure && totalSynced === 0 ? 502 : 200)
    .json({ success: !hasSourceFailure, syncedCount: totalSynced, results });
});

// API Routes
app.post("/api/upload", requireAuth, rateLimit("upload", 20, 15 * 60 * 1000), (req, res, next) => {
  upload.single("screenshot")(req, res, (err) => {
    if (err instanceof multer.MulterError && err.code === "LIMIT_FILE_SIZE") {
      return res.status(413).json({ error: "File too large. Maximum 10 MB per upload." });
    }
    if (err) {
      return res.status(400).json({ error: err instanceof Error ? err.message : "Invalid file." });
    }
    next();
  });
}, async (req, res) => {
  const requestId = createRequestId();
  let storagePath: string | null = null;
  try {
    if (!req.user) return res.status(401).json({ error: "Authentication required", requestId });
    if (!req.file) return res.status(400).json({ error: "No file uploaded", requestId });

    const buffer = fs.readFileSync(req.file.path);
    const mimeType = resolveMimeType(req.file.originalname, req.file.mimetype);

    storagePath = await uploadBufferToStorage(
      req.user.id,
      req.file.originalname,
      buffer,
      req.file.mimetype,
    );

    let analysis: ScreenshotAnalysisResult;
    let embedding: number[];
    try {
      analysis = await analyzeScreenshot(buffer, mimeType);
      embedding = await generateEmbedding(`${analysis.summary} ${analysis.ocr_text}`.trim());
    } catch (analysisError) {
      await removeStorageObjectBestEffort(storagePath);
      logRouteError("/api/upload", requestId, req, analysisError, {
        stage: "analysis-failed",
        storagePath,
      });
      return res.status(502).json({ error: "Analysis failed. Upload rolled back.", requestId });
    }

    const { data, error } = await supabase
      .from('screenshots')
      .insert([{
        user_id: req.user.id,
        filename: storagePath,
        storage_path: storagePath,
        original_name: req.file.originalname,
        source: "upload",
        category: analysis.category,
        summary: analysis.summary,
        ocr_text: analysis.ocr_text,
        entities: analysis.entities,
        embedding,
        is_sensitive: analysis.safety?.contains_sensitive ? 1 : 0,
        is_analyzed: 1,
        safety_reason: analysis.safety?.reason || "",
        last_analyzed_at: new Date().toISOString(),
        upload_date: new Date().toISOString(),
      }])
      .select()
      .single();

    if (error || !data) {
      await removeStorageObjectBestEffort(storagePath);
      logRouteError("/api/upload", requestId, req, error, {
        stage: "db-insert-failed",
        storagePath,
      });
      return res.status(500).json({ error: "Failed to persist screenshot. Upload rolled back.", requestId });
    }

    await replaceScreenshotTagsBestEffort("/api/upload", data.id, analysis.tags);

    const screenshotRow = { ...data, tags: analysis.tags.map((tag) => ({ tag })) };
    res.json({ requestId, screenshot: screenshotRow });
  } catch (error) {
    if (storagePath) await removeStorageObjectBestEffort(storagePath);
    logRouteError("/api/upload", requestId, req, error, { stage: "failed", storagePath });
    res.status(500).json({ error: "Failed to process screenshot", requestId });
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

  if (error) return res.status(500).json({ error: "Failed to load screenshots." });
  res.json(data);
});

app.post("/api/search", requireAuth, rateLimit("search", 60, 15 * 60 * 1000), async (req, res) => {
  try {
    if (!req.user) return res.status(401).json({ error: "Authentication required" });
    const { query } = req.body;
    if (!query || typeof query !== "string") return res.status(400).json({ error: "No query provided" });
    if (query.length > 500) return res.status(400).json({ error: "Query too long. Maximum 500 characters." });
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

app.post("/api/chat", requireAuth, rateLimit("chat", 30, 15 * 60 * 1000), async (req, res) => {
  try {
    if (!req.user) return res.status(401).json({ error: "Authentication required" });
    const { message, contextIds } = req.body;
    if (!message || typeof message !== "string") return res.status(400).json({ error: "No message provided" });
    if (message.length > 1000) return res.status(400).json({ error: "Message too long. Maximum 1000 characters." });
    if (contextIds !== undefined && (!Array.isArray(contextIds) || contextIds.length > 20)) {
      return res.status(400).json({ error: "contextIds must be an array of at most 20 items." });
    }

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

    const response = await getOpenAIClient().chat.completions.create({
      model: OPENAI_CHAT_MODEL,
      messages: [
        {
          role: "system",
          content: "You are an AI assistant helping a user with their screenshots.",
        },
        {
          role: "user",
          content: `Here is the context from relevant screenshots:\n${contextText || "(no matching screenshots found)"}\n\nUser Question: ${message}`,
        },
      ],
    });

    const text = extractChatCompletionText(response);
    res.json({ text });
  } catch (error) {
    res.status(500).json({ error: "Chat failed" });
  }
});

// Helper functions for vector math
function dotProduct(a: number[], b: number[]) {
  if (!Array.isArray(a) || !Array.isArray(b) || a.length === 0 || b.length === 0 || a.length !== b.length) {
    return 0;
  }
  return a.reduce((sum, val, i) => sum + val * b[i], 0);
}
function magnitude(a: number[]) {
  if (!Array.isArray(a) || a.length === 0) {
    return 0;
  }
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

  console.log(`[startup] ${JSON.stringify({
    nodeEnv: process.env.NODE_ENV || "development",
    port: PORT,
    supabaseConfigured: Boolean(supabaseUrl && supabaseServiceRoleKey),
    openaiConfigured: Boolean(openaiApiKey),
    openaiApiKeySource,
    analysisModel: OPENAI_ANALYSIS_MODEL,
    chatModel: OPENAI_CHAT_MODEL,
    embeddingModel: OPENAI_EMBEDDING_MODEL,
    embeddingDimensions: OPENAI_EMBEDDING_DIMENSIONS,
  })}`);

  server.listen({ port: PORT, host: "0.0.0.0" }, () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
