#!/usr/bin/env node
/**
 * bot/server.mjs — free WhatsApp auto-send bot for the school portal.
 *
 * A standalone Node process (`npm run bot`) that holds ONE WhatsApp session
 * as a linked device (scan the QR once with the school phone) and exposes a
 * small HTTP API that the Next.js route /api/whatsapp-bot calls:
 *
 *   GET  /status   connection state, fresh QR (data URL), queue progress
 *   POST /connect  start the socket (a QR appears in /status while pairing)
 *   POST /send     { messages: [{ phone, message }] } — runs the send queue
 *   POST /stop     stop the queue after the current message
 *   POST /logout   unlink this device and wipe the saved session
 *
 * Anti-ban pacing (all env-tunable): a random delay between messages, a long
 * pause every PAUSE_EVERY messages, a per-run cap, and an onWhatsApp()
 * existence check so numbers that are not on WhatsApp are never burned.
 *
 * Security: with WA_BOT_TOKEN set, every request must send
 * `Authorization: Bearer <token>`; without it only loopback callers pass.
 */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import QRCode from 'qrcode';
import P from 'pino';
import makeWASocket, {
  DisconnectReason,
  fetchLatestBaileysVersion,
  makeCacheableSignalKeyStore,
  // Renamed so the React Hooks lint rule does not mistake this Baileys
  // helper for a React hook — this file is a plain Node server.
  useMultiFileAuthState as multiFileAuthState,
} from '@whiskeysockets/baileys';

const HERE = path.dirname(fileURLToPath(import.meta.url));

/** Reads ../.env into process.env without overriding real environment variables. */
function loadDotEnv() {
  const file = path.join(HERE, '..', '.env');
  if (!fs.existsSync(file)) return;
  for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const match = /^\s*([A-Za-z0-9_]+)\s*=\s*(.*)$/.exec(line);
    if (!match) continue;
    let value = match[2].trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1);
    if (process.env[match[1]] === undefined) process.env[match[1]] = value;
  }
}
loadDotEnv();

const num = (name, fallback) => {
  const value = Number(process.env[name]);
  return Number.isFinite(value) && value > 0 ? value : fallback;
};
const PORT = num('WA_BOT_PORT', 3099);
const HOST = process.env.WA_BOT_HOST || '127.0.0.1';
const TOKEN = process.env.WA_BOT_TOKEN || '';
const AUTH_DIR = path.join(HERE, 'auth');
const DELAY_MIN = num('WA_BOT_DELAY_MIN_MS', 6000);
const DELAY_MAX = Math.max(DELAY_MIN, num('WA_BOT_DELAY_MAX_MS', 15000));
const PAUSE_EVERY = num('WA_BOT_PAUSE_EVERY', 25);
const PAUSE_MIN = num('WA_BOT_PAUSE_MIN_MS', 60000);
const PAUSE_MAX = Math.max(PAUSE_MIN, num('WA_BOT_PAUSE_MAX_MS', 120000));
const MAX_PER_RUN = num('WA_BOT_MAX_PER_RUN', 500);

const logger = P({ level: process.env.WA_BOT_LOG_LEVEL || 'silent' });
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const rand = (min, max) => min + Math.floor(Math.random() * (max - min + 1));
const digits = (value) => String(value ?? '').replace(/\D/g, '');

/* ---------------------------------------------------------------- socket -- */
let sock = null;
let connecting = false;
let qrDataUrl = '';
let note = '';
let reconnectTimer = null;

function summary() {
  return {
    connected: Boolean(sock?.user),
    phone: sock?.user?.id ? digits(String(sock.user.id).split(':')[0]) || null : null,
    name: sock?.user?.name || null,
    qr: qrDataUrl || null,
    note,
  };
}

async function connect() {
  if (sock || connecting) return summary();
  connecting = true;
  note = 'Connecting…';
  try {
    const { state, saveCreds } = await multiFileAuthState(AUTH_DIR);
    let version;
    try {
      ({ version } = await fetchLatestBaileysVersion());
    } catch {
      /* offline — fall back to the version Baileys ships with */
    }
    const socket = makeWASocket({
      ...(version ? { version } : {}),
      logger,
      printQRInTerminal: false,
      auth: { creds: state.creds, keys: makeCacheableSignalKeyStore(state.keys, logger) },
      browser: ['SCH Voucher Bot', 'Chrome', '123.0'],
      markOnlineOnConnect: false,
      syncFullHistory: false,
      generateHighQualityLinkPreview: false,
    });
    socket.ev.on('creds.update', saveCreds);
    socket.ev.on('connection.update', (update) => handleUpdate(socket, update));
    sock = socket;
  } finally {
    connecting = false;
  }
  return summary();
}

async function handleUpdate(socket, { connection, lastDisconnect, qr }) {
  if (socket !== sock && sock) return; // ignore a replaced socket's last events
  if (qr) {
    try {
      qrDataUrl = await QRCode.toDataURL(qr);
      note = 'Scan the QR with the school phone (WhatsApp → Linked devices).';
    } catch {
      qrDataUrl = '';
    }
  }
  if (connection === 'open') {
    qrDataUrl = '';
    note = '';
    console.log(`[wa-bot] connected as ${sock?.user?.id ?? 'unknown'}`);
  }
  if (connection === 'close') {
    qrDataUrl = '';
    const code = lastDisconnect?.error?.output?.statusCode;
    if (code === DisconnectReason.loggedOut) {
      sock = null;
      note = 'Logged out — press Connect and scan the QR again.';
      stopQueue();
      console.log('[wa-bot] logged out; scan a new QR to reconnect.');
    } else {
      sock = null;
      note = 'Connection lost — reconnecting…';
      console.log(`[wa-bot] connection closed (code ${code ?? '?'}); reconnecting in 3s`);
      if (!reconnectTimer) {
        reconnectTimer = setTimeout(() => {
          reconnectTimer = null;
          connect().catch((err) => console.error('[wa-bot] reconnect failed:', err?.message || err));
        }, 3000);
      }
    }
  }
}

async function logout() {
  try {
    await sock?.logout?.();
  } catch {
    /* already gone */
  }
  sock = null;
  qrDataUrl = '';
  note = 'Device unlinked. Press Connect to pair again.';
  stopQueue();
  fs.rmSync(AUTH_DIR, { recursive: true, force: true });
}

/* ----------------------------------------------------------------- queue -- */
const queue = {
  runId: 0,
  items: [],
  results: [],
  index: 0,
  running: false,
  stop: false,
  startedAt: null,
  finishedAt: null,
};

function queueSummary() {
  const counts = { sent: 0, failed: 0, skipped: 0, nowa: 0 };
  for (const result of queue.results) if (result && Object.hasOwn(counts, result)) counts[result] += 1;
  return {
    running: queue.running,
    total: queue.items.length,
    index: queue.index,
    counts,
    results: queue.items.map((_, i) => queue.results[i] ?? null),
    startedAt: queue.startedAt,
    finishedAt: queue.finishedAt,
  };
}

function stopQueue() {
  queue.stop = true;
}

function startQueue(items) {
  if (queue.running) throw new Error('A send is already running.');
  if (!sock?.user) throw new Error('The bot is not connected yet.');
  if (items.length > MAX_PER_RUN) throw new Error(`At most ${MAX_PER_RUN} messages per run.`);
  queue.runId += 1;
  queue.items = items.map((item) => ({
    phone: digits(item?.phone),
    message: String(item?.message ?? '').trim(),
  }));
  queue.results = [];
  queue.index = 0;
  queue.stop = false;
  queue.running = true;
  queue.startedAt = new Date().toISOString();
  queue.finishedAt = null;
  runQueue(queue.runId).catch((err) => console.error('[wa-bot] run crashed:', err?.message || err));
  return queueSummary();
}

/** Sleeps in 1s slices so Stop takes effect quickly. */
async function interruptibleSleep(ms) {
  const until = Date.now() + ms;
  while (Date.now() < until && queue.running && !queue.stop) await sleep(Math.min(1000, until - Date.now()));
}

async function runQueue(runId) {
  try {
    let sincePause = 0;
    while (queue.runId === runId && !queue.stop && queue.index < queue.items.length) {
      if (!sock?.user) {
        note = 'Connection lost — remaining messages are still waiting.';
        break;
      }
      const at = queue.index;
      const item = queue.items[at];
      let outcome;
      try {
        if (!item.phone || item.phone.length < 10 || !item.message) {
          outcome = 'skipped';
        } else {
          const jid = `${item.phone}@s.whatsapp.net`;
          const check = await sock.onWhatsApp(jid);
          const first = Array.isArray(check) ? check[0] : check;
          const exists = first && typeof first === 'object' ? Boolean(first.exists) : Boolean(first);
          if (!exists) {
            outcome = 'nowa';
          } else {
            await sock.sendMessage(jid, { text: item.message });
            outcome = 'sent';
          }
        }
      } catch (err) {
        outcome = 'failed';
        console.warn(`[wa-bot] #${at + 1} failed: ${err?.message || err}`);
      }
      queue.results[at] = outcome;
      queue.index = at + 1;
      sincePause += 1;
      if (queue.runId === runId && !queue.stop && queue.index < queue.items.length) {
        const longPause = sincePause >= PAUSE_EVERY;
        if (longPause) sincePause = 0;
        await interruptibleSleep(longPause ? rand(PAUSE_MIN, PAUSE_MAX) : rand(DELAY_MIN, DELAY_MAX));
      }
    }
  } finally {
    if (queue.runId === runId) {
      queue.running = false;
      queue.finishedAt = new Date().toISOString();
      const { counts } = queueSummary();
      console.log(`[wa-bot] run finished: ${counts.sent} sent, ${counts.failed} failed, ${counts.nowa} not-on-WhatsApp, ${counts.skipped} skipped (${queue.index}/${queue.items.length})`);
    }
  }
}

/* -------------------------------------------------------------- http api -- */
function readJson(req) {
  return new Promise((resolve) => {
    let raw = '';
    req.on('data', (chunk) => {
      raw += chunk;
      if (raw.length > 2_000_000) req.destroy();
    });
    req.on('end', () => {
      try {
        resolve(JSON.parse(raw || '{}'));
      } catch {
        resolve({});
      }
    });
    req.on('error', () => resolve({}));
  });
}

function json(res, status, data) {
  const body = JSON.stringify(data);
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'content-length': Buffer.byteLength(body) });
  res.end(body);
}

function authorised(req) {
  if (TOKEN) return (req.headers.authorization || '') === `Bearer ${TOKEN}`;
  const addr = req.socket.remoteAddress || '';
  return ['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(addr);
}

const server = http.createServer(async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', req.headers.origin || '*');
  res.setHeader('Access-Control-Allow-Headers', 'authorization, content-type');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }
  if (!authorised(req)) {
    json(res, 401, { error: 'Unauthorized' });
    return;
  }

  const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);
  try {
    if (req.method === 'GET' && url.pathname === '/status') {
      json(res, 200, { ok: true, ...summary(), queue: queueSummary() });
      return;
    }
    if (req.method !== 'POST') {
      json(res, 404, { error: 'Not found' });
      return;
    }
    const body = await readJson(req);
    if (url.pathname === '/connect') {
      json(res, 200, { ok: true, ...(await connect()) });
      return;
    }
    if (url.pathname === '/send') {
      if (!Array.isArray(body.messages) || body.messages.length === 0) {
        json(res, 400, { error: 'messages[] is required' });
        return;
      }
      json(res, 200, { ok: true, queue: startQueue(body.messages) });
      return;
    }
    if (url.pathname === '/stop') {
      stopQueue();
      json(res, 200, { ok: true, queue: queueSummary() });
      return;
    }
    if (url.pathname === '/logout') {
      await logout();
      json(res, 200, { ok: true, ...summary() });
      return;
    }
    json(res, 404, { error: 'Not found' });
  } catch (err) {
    json(res, 409, { error: err?.message || 'Bot error' });
  }
});

server.listen(PORT, HOST, () => {
  console.log(`[wa-bot] listening on http://${HOST}:${PORT}`);
  console.log(TOKEN ? '[wa-bot] auth: WA_BOT_TOKEN required' : '[wa-bot] auth: local only (set WA_BOT_TOKEN to allow remote callers)');
  if (fs.existsSync(path.join(AUTH_DIR, 'creds.json'))) {
    console.log('[wa-bot] saved session found — connecting…');
    connect().catch((err) => console.error('[wa-bot] connect failed:', err?.message || err));
  } else {
    console.log('[wa-bot] no session yet — press Connect in the portal to get a QR code.');
  }
});

process.on('uncaughtException', (err) => console.error('[wa-bot] uncaught:', err?.message || err));
process.on('unhandledRejection', (err) => console.error('[wa-bot] unhandled:', err?.message || err));
