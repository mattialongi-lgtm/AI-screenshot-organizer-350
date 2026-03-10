import chokidar from 'chokidar';
import fs from 'fs';
import path from 'path';
import { WebSocket } from 'ws';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Configuration
const API_URL = process.env.API_URL || 'http://localhost:3000';
const WS_URL = process.env.WS_URL || 'ws://localhost:3000';
const WATCH_PATH = process.argv[2] || process.env.WATCH_PATH;

if (!WATCH_PATH) {
  console.error('Error: Please provide a path to watch.');
  console.log('Usage: node agent/index.js "/path/to/icloud/screenshots"');
  process.exit(1);
}

console.log(`🚀 iCloud Sync Agent starting...`);
console.log(`👀 Watching: ${WATCH_PATH}`);
console.log(`🔗 API: ${API_URL}`);

// Initialize watcher
const watcher = chokidar.watch(WATCH_PATH, {
  ignored: /(^|[\/\\])\../, // ignore dotfiles
  persistent: true,
  ignoreInitial: true, // Don't sync everything on start, only new ones
});

async function uploadFile(filePath) {
  try {
    const stats = fs.statSync(filePath);
    if (stats.isDirectory()) return;

    // Check if it's an image
    const ext = path.extname(filePath).toLowerCase();
    if (!['.png', '.jpg', '.jpeg', '.webp', '.heic'].includes(ext)) return;

    console.log(`📤 New file detected: ${path.basename(filePath)}`);

    const formData = new FormData();
    const fileBuffer = fs.readFileSync(filePath);
    const blob = new Blob([fileBuffer], { type: `image/${ext.replace('.', '')}` });
    
    formData.append('file', blob, path.basename(filePath));
    formData.append('localPath', filePath);
    formData.append('modifiedTime', stats.mtime.toISOString());

    const response = await fetch(`${API_URL}/api/icloud/import`, {
      method: 'POST',
      body: formData,
    });

    const result = await response.json();
    if (result.success) {
      if (result.skipped) {
        console.log(`⏭️  Skipped (already exists): ${path.basename(filePath)}`);
      } else {
        console.log(`✅ Imported: ${path.basename(filePath)}`);
      }
    } else {
      console.error(`❌ Failed to import: ${path.basename(filePath)}`, result.error);
    }
  } catch (error) {
    console.error(`❌ Error processing ${filePath}:`, error);
  }
}

watcher.on('add', (filePath) => uploadFile(filePath));

// Keep-alive WebSocket connection to show status in UI
let ws;
function connectWS() {
  ws = new WebSocket(WS_URL);
  
  ws.on('open', () => {
    console.log('📡 Connected to app server');
    ws.send(JSON.stringify({ type: 'agent:status', status: 'online', path: WATCH_PATH }));
  });

  ws.on('close', () => {
    console.log('📡 Disconnected from app server. Retrying in 5s...');
    setTimeout(connectWS, 5000);
  });

  ws.on('error', (err) => {
    // console.error('WS Error:', err.message);
  });
}

connectWS();

// Handle termination
process.on('SIGINT', () => {
  console.log('👋 Agent shutting down...');
  if (ws) ws.send(JSON.stringify({ type: 'agent:status', status: 'offline' }));
  watcher.close().then(() => process.exit(0));
});
