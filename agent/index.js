import chokidar from 'chokidar';
import fs from 'fs';
import path from 'path';
import { WebSocket } from 'ws';

const IMAGE_EXTENSIONS = new Set(['.png', '.jpg', '.jpeg', '.webp', '.heic']);
const WATCH_PATH = process.argv[2] || process.env.WATCH_PATH;
const AUTH_TOKEN =
  process.env.SCREENSORT_AGENT_TOKEN ||
  process.env.AUTH_TOKEN ||
  process.env.SUPABASE_JWT;

function normalizeBaseUrl(value, fallback) {
  try {
    return new URL(value || fallback).toString().replace(/\/$/, '');
  } catch {
    return fallback;
  }
}

function deriveWebSocketUrl(httpUrl) {
  const url = new URL(httpUrl);
  url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
  return url.toString().replace(/\/$/, '');
}

const API_URL = normalizeBaseUrl(
  process.env.API_URL || process.env.API_PUBLIC_URL,
  'http://localhost:3000'
);
const WS_URL = normalizeBaseUrl(
  process.env.WS_URL,
  deriveWebSocketUrl(API_URL)
);
const IMPORT_EXISTING = !['0', 'false', 'no'].includes(
  String(process.env.IMPORT_EXISTING || '1').toLowerCase()
);
const pendingUploads = new Set();

if (!WATCH_PATH) {
  console.error('Error: Please provide a path to watch.');
  console.log('Usage: node agent/index.js "/path/to/icloud/screenshots"');
  process.exit(1);
}

if (!fs.existsSync(WATCH_PATH)) {
  console.error(`Error: Watch path does not exist: ${WATCH_PATH}`);
  process.exit(1);
}

if (!AUTH_TOKEN) {
  console.warn('Warning: set SCREENSORT_AGENT_TOKEN, AUTH_TOKEN, or SUPABASE_JWT before starting the agent.');
}

console.log('iCloud Sync Agent starting...');
console.log(`Watching: ${WATCH_PATH}`);
console.log(`API: ${API_URL}`);
console.log(`Initial scan: ${IMPORT_EXISTING ? 'enabled' : 'disabled'}`);

function isImageFile(filePath) {
  return IMAGE_EXTENSIONS.has(path.extname(filePath).toLowerCase());
}

function isLikelyScreenshot(filePath) {
  const normalizedPath = filePath.toLowerCase();
  const fileName = path.basename(normalizedPath);

  if (
    WATCH_PATH.toLowerCase().includes('screenshot') ||
    path.dirname(normalizedPath).includes('screenshot')
  ) {
    return true;
  }

  return /screen[\s._-]?shot/.test(fileName);
}

async function waitForStableFile(filePath) {
  let previousSize = -1;

  for (let attempt = 0; attempt < 6; attempt += 1) {
    const stats = fs.statSync(filePath);
    if (stats.size > 0 && stats.size === previousSize) {
      return stats;
    }

    previousSize = stats.size;
    await new Promise((resolve) => setTimeout(resolve, 500));
  }

  return fs.statSync(filePath);
}

function collectExistingFiles(rootPath) {
  const entries = fs.readdirSync(rootPath, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    if (entry.name.startsWith('.')) {
      continue;
    }

    const absolutePath = path.join(rootPath, entry.name);
    if (entry.isDirectory()) {
      files.push(...collectExistingFiles(absolutePath));
      continue;
    }

    if (entry.isFile() && isImageFile(absolutePath)) {
      files.push(absolutePath);
    }
  }

  return files.sort();
}

async function readJsonResponse(response) {
  const responseText = await response.text();

  try {
    return responseText ? JSON.parse(responseText) : {};
  } catch {
    return { error: responseText || `HTTP ${response.status}` };
  }
}

const watcher = chokidar.watch(WATCH_PATH, {
  ignored: /(^|[\/\\])\../,
  persistent: true,
  ignoreInitial: true,
});

async function uploadFile(filePath) {
  try {
    if (!AUTH_TOKEN) {
      console.error('Cannot upload without SCREENSORT_AGENT_TOKEN, AUTH_TOKEN, or SUPABASE_JWT.');
      return;
    }

    if (!fs.existsSync(filePath)) {
      return;
    }

    const stats = await waitForStableFile(filePath);
    if (stats.isDirectory()) {
      return;
    }

    if (!isImageFile(filePath)) {
      return;
    }

    if (!isLikelyScreenshot(filePath)) {
      console.log(`Skipped (not recognized as a screenshot): ${path.basename(filePath)}`);
      return;
    }

    console.log(`Importing: ${path.basename(filePath)}`);

    const ext = path.extname(filePath).toLowerCase();
    const formData = new FormData();
    const fileBuffer = fs.readFileSync(filePath);
    const blob = new Blob([fileBuffer], { type: `image/${ext.replace('.', '')}` });

    formData.append('file', blob, path.basename(filePath));
    formData.append('localPath', filePath);
    formData.append('modifiedTime', stats.mtime.toISOString());

    const response = await fetch(`${API_URL}/api/icloud/import`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${AUTH_TOKEN}`,
      },
      body: formData,
    });

    const result = await readJsonResponse(response);
    if (!response.ok) {
      console.error(`Import failed for ${path.basename(filePath)}:`, result.error || `HTTP ${response.status}`);
      return;
    }

    if (result.success) {
      if (result.skipped) {
        console.log(`Skipped (already exists): ${path.basename(filePath)}`);
      } else {
        console.log(`Imported: ${path.basename(filePath)}`);
      }
    } else {
      console.error(`Import failed for ${path.basename(filePath)}:`, result.error);
    }
  } catch (error) {
    console.error(`Error processing ${filePath}:`, error);
  }
}

async function queueUpload(filePath) {
  if (pendingUploads.has(filePath)) {
    return;
  }

  pendingUploads.add(filePath);
  try {
    await uploadFile(filePath);
  } finally {
    pendingUploads.delete(filePath);
  }
}

async function runInitialSync() {
  if (!IMPORT_EXISTING) {
    return;
  }

  const existingFiles = collectExistingFiles(WATCH_PATH);
  console.log(`Scanning ${existingFiles.length} existing image file(s)...`);

  for (const filePath of existingFiles) {
    await queueUpload(filePath);
  }

  console.log('Initial scan complete.');
}

watcher.on('add', (filePath) => {
  void queueUpload(filePath);
});

let ws;

function connectWS() {
  if (!AUTH_TOKEN) {
    return;
  }

  const wsUrl = new URL(WS_URL);
  wsUrl.searchParams.set('token', AUTH_TOKEN);
  ws = new WebSocket(wsUrl);

  ws.on('open', () => {
    console.log('Connected to app server.');
    ws.send(JSON.stringify({ type: 'agent:status', status: 'online', path: WATCH_PATH }));
  });

  ws.on('close', () => {
    console.log('Disconnected from app server. Retrying in 5s...');
    setTimeout(connectWS, 5000);
  });

  ws.on('error', () => {
    // Ignore transient websocket errors. The reconnect loop handles recovery.
  });
}

connectWS();
void runInitialSync();

process.on('SIGINT', () => {
  console.log('Agent shutting down...');
  if (ws) {
    ws.send(JSON.stringify({ type: 'agent:status', status: 'offline' }));
  }
  watcher.close().then(() => process.exit(0));
});
