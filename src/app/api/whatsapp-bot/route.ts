import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { normalizePhone } from "@/lib/voucher";

/**
 * Proxy to the standalone WhatsApp auto-send bot (bot/server.mjs, `npm run bot`).
 *
 * The browser never talks to the bot directly: the shared secret stays in
 * WA_BOT_TOKEN on the server, and every call here is admin-only. The bot
 * holds the linked WhatsApp session and paces the messages itself, so this
 * route only forwards commands and reports progress.
 *
 *   GET  → bot status (connection, QR, queue progress)
 *   POST → { action: 'connect' | 'send' | 'stop' | 'logout', messages? }
 */
const BOT_URL = (process.env.WA_BOT_URL ?? "").replace(/\/+$/, "");
const BOT_TOKEN = process.env.WA_BOT_TOKEN ?? "";
const MAX_MESSAGES = 500;

async function isAdmin(): Promise<boolean> {
  const session = await getCurrentUser();
  return Boolean(session.authenticated && session.user?.role === "admin");
}

async function callBot(path: string, init?: RequestInit): Promise<Response> {
  return fetch(`${BOT_URL}${path}`, {
    ...init,
    headers: {
      "content-type": "application/json",
      ...(BOT_TOKEN ? { authorization: `Bearer ${BOT_TOKEN}` } : {}),
      ...(init?.headers ?? {}),
    },
    cache: "no-store",
  });
}

function notConfigured() {
  return NextResponse.json(
    { configured: false, available: false, error: "WA_BOT_URL is not set for this deployment" },
    { status: 503 },
  );
}

export async function GET() {
  if (!(await isAdmin())) return NextResponse.json({ error: "Administrator access required" }, { status: 403 });
  if (!BOT_URL) return NextResponse.json({ configured: false, available: false });
  try {
    const response = await callBot("/status");
    const data = await response.json();
    return NextResponse.json({ configured: true, available: true, ...data });
  } catch {
    return NextResponse.json({ configured: true, available: false, error: "Bot server is not running" });
  }
}

export async function POST(request: Request) {
  if (!(await isAdmin())) return NextResponse.json({ error: "Administrator access required" }, { status: 403 });
  if (!BOT_URL) return notConfigured();

  let body: { action?: string; messages?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const action = body.action;

  try {
    if (action === "connect" || action === "stop" || action === "logout") {
      const response = await callBot(`/${action}`, { method: "POST", body: "{}" });
      const data = await response.json().catch(() => ({}));
      return NextResponse.json(data, { status: response.status });
    }

    if (action === "send") {
      if (!Array.isArray(body.messages) || body.messages.length === 0) {
        return NextResponse.json({ error: "messages[] is required" }, { status: 400 });
      }
      if (body.messages.length > MAX_MESSAGES) {
        return NextResponse.json({ error: `At most ${MAX_MESSAGES} messages per run` }, { status: 400 });
      }
      // Keep every entry — positions must line up with the panel's rows so
      // per-parent results land back on the right student. Invalid numbers
      // are normalised to "" and the bot skips them.
      const messages = (body.messages as { phone?: unknown; message?: unknown }[]).map((item) => ({
        phone: normalizePhone(String(item?.phone ?? "")),
        message: String(item?.message ?? "").slice(0, 4000),
      }));
      const response = await callBot("/send", { method: "POST", body: JSON.stringify({ messages }) });
      const data = await response.json().catch(() => ({}));
      return NextResponse.json(data, { status: response.status });
    }

    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  } catch {
    return NextResponse.json({ error: "Bot server is not running" }, { status: 502 });
  }
}
