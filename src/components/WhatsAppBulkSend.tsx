'use client';

/* eslint-disable react-hooks/set-state-in-effect, react-hooks/exhaustive-deps */

/**
 * WhatsAppBulkSend — the send panel behind bulk fee actions.
 *
 * Two modes:
 *
 * 1. Bot mode (preferred): when the standalone auto-send bot
 *    (bot/server.mjs, `npm run bot`) is configured and connected, the panel
 *    hands the whole queue to it — every parent gets their personalised
 *    message delivered automatically with human-like delays, and the QR
 *    pairing and live progress appear right here.
 * 2. Manual mode (fallback): browsers cannot deliver a WhatsApp message on
 *    their own, so every wa.me link opens a chat with the text already typed
 *    and the admin presses send there. The panel auto-opens the chats in the
 *    background, one every 3–4 seconds (configurable). Counted tabs mean
 *    nothing is silently lost.
 */

import { useState, useEffect, useRef } from 'react';
import { normalizePhone, whatsappVoucherLink } from '@/lib/voucher';

/** One pre-composed message waiting to be opened on WhatsApp. */
export type WhatsAppMessage = {
  name: string;
  phone: string;
  message: string;
};

type ItemState = 'pending' | 'opened' | 'blocked' | 'skipped' | 'sent' | 'failed' | 'nowa';

const CHIP: Record<ItemState, { label: string; look: string }> = {
  pending: { label: 'Waiting', look: 'bg-slate-100 text-slate-500' },
  opened: { label: 'Opened', look: 'bg-emerald-50 text-emerald-700' },
  blocked: { label: 'Blocked', look: 'bg-amber-50 text-amber-700' },
  skipped: { label: 'No number', look: 'bg-rose-50 text-rose-600' },
  sent: { label: 'Sent', look: 'bg-emerald-100 text-emerald-800' },
  failed: { label: 'Failed', look: 'bg-rose-100 text-rose-700' },
  nowa: { label: 'Not on WhatsApp', look: 'bg-amber-50 text-amber-700' },
};

/** Outcome of one parent in a bot run. */
type BotResult = 'sent' | 'failed' | 'skipped' | 'nowa';

type BotQueue = {
  running: boolean;
  total: number;
  index: number;
  counts: { sent: number; failed: number; skipped: number; nowa: number };
  /** Positionally aligned with the messages submitted for the run. */
  results: (BotResult | null)[];
  startedAt: string | null;
  finishedAt: string | null;
};

type BotStatus = {
  configured: boolean;
  available: boolean;
  connected?: boolean;
  phone?: string | null;
  name?: string | null;
  qr?: string | null;
  note?: string;
  queue?: BotQueue;
  error?: string;
};

/** WhatsApp glyph shared by the primary send buttons. */
const WA_PATH =
  'M12.04 2C6.58 2 2.13 6.45 2.13 11.91c0 1.75.46 3.45 1.32 4.95L2 22l5.25-1.38a9.9 9.9 0 0 0 4.79 1.22h.01c5.46 0 9.91-4.45 9.91-9.91S17.5 2 12.04 2Zm5.8 14.16c-.25.69-1.43 1.32-1.98 1.37-.53.05-1.02.23-3.45-.72-2.9-1.13-4.74-4.09-4.88-4.29-.14-.19-1.16-1.54-1.16-2.94 0-1.4.73-2.08.99-2.37.26-.28.57-.36.76-.36.19 0 .38 0 .55.01.19.01.44-.07.69.53.25.6.86 2.06.94 2.21.08.15.13.32.03.52-.11.19-.16.31-.32.48-.16.16-.33.36-.47.48-.15.13-.31.28-.13.54.18.27.79 1.3 1.69 2.11 1.16 1.03 2.13 1.35 2.43 1.5.3.15.47.13.65-.08.18-.21.75-.87.95-1.17.2-.3.4-.25.66-.15.27.1 1.71.81 2 .96.3.15.5.22.57.35.08.12.08.71-.17 1.4Z';

function WaIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="currentColor" aria-hidden="true">
      <path d={WA_PATH} />
    </svg>
  );
}

function Stat({ label, value, look }: { label: string; value: number; look: string }) {
  return (
    <div className={`rounded-xl px-2 py-2.5 text-center ${look}`}>
      <p className="text-lg font-bold leading-none tabular-nums">{value}</p>
      <p className="mt-1 text-[0.65rem] font-semibold uppercase tracking-wide opacity-80">{label}</p>
    </div>
  );
}

type Props = {
  title: string;
  messages: WhatsAppMessage[];
  onClose: () => void;
  /** Milliseconds between opening each chat when the queue runs in the background. */
  queueMs?: number;
  responsibleUse?: boolean;
};

export default function WhatsAppBulkSend({ title, messages, onClose, queueMs = 3500, responsibleUse = true }: Props) {
  const [states, setStates] = useState<ItemState[]>(() =>
    messages.map((item) => (normalizePhone(item.phone) ? 'pending' : 'skipped')),
  );
  const [running, setRunning] = useState(false);
  const autoIndexRef = useRef(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const prevCount = useRef(messages.length);

  const opened = states.filter((s) => s === 'opened').length;
  const waiting = states.filter((s) => s === 'pending' || s === 'blocked').length;
  const skipped = states.filter((s) => s === 'skipped').length;
  const blocked = states.filter((s) => s === 'blocked').length;
  const sent = states.filter((s) => s === 'sent').length;
  const failed = states.filter((s) => s === 'failed' || s === 'nowa').length;

  /* ------------------------------------------------------------- bot mode -- */
  const [bot, setBot] = useState<BotStatus | null>(null); // null = not asked yet
  const [botBusy, setBotBusy] = useState(false);
  const [botError, setBotError] = useState('');
  const submittedRef = useRef<number[] | null>(null);
  const fetchingRef = useRef(false);

  const botReady = Boolean(bot?.available && bot?.connected);
  const botSending = Boolean(bot?.queue?.running);

  /** Copies finished bot outcomes back onto the matching rows. */
  function applyBotResults(queue?: BotQueue) {
    if (!queue || !submittedRef.current) return;
    const submitted = submittedRef.current;
    setStates((current) => {
      const next = [...current];
      let changed = false;
      queue.results.forEach((result, position) => {
        const at = submitted[position];
        if (at === undefined || !result) return;
        const mapped: ItemState =
          result === 'sent' ? 'sent' : result === 'failed' ? 'failed' : result === 'nowa' ? 'nowa' : 'skipped';
        if (next[at] !== mapped) {
          next[at] = mapped;
          changed = true;
        }
      });
      return changed ? next : current;
    });
  }

  async function fetchBotStatus() {
    if (fetchingRef.current) return;
    fetchingRef.current = true;
    try {
      const response = await fetch('/api/whatsapp-bot', { cache: 'no-store' });
      const data = (await response.json()) as BotStatus;
      if (!response.ok && !data.configured) {
        setBot({ configured: false, available: false });
        return;
      }
      setBot(data);
      // A run started before this panel opened (page reload): when it covers
      // every row, adopt the identity mapping so results still land right.
      if (!submittedRef.current && data.queue && data.queue.total === messages.length && data.queue.index > 0) {
        submittedRef.current = messages.map((_, index) => index);
      }
      applyBotResults(data.queue);
    } catch {
      /* Next server unreachable — leave the last known status in place. */
    } finally {
      fetchingRef.current = false;
    }
  }

  async function botPost(action: 'connect' | 'send' | 'stop' | 'logout', messagesPayload?: WhatsAppMessage[]) {
    setBotBusy(true);
    setBotError('');
    try {
      const response = await fetch('/api/whatsapp-bot', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(messagesPayload ? { action, messages: messagesPayload } : { action }),
      });
      const data = await response.json().catch(() => ({}) as Record<string, unknown>);
      if (!response.ok) {
        setBotError(String((data as { error?: string }).error ?? 'The bot server is not running.'));
        return false;
      }
      return true;
    } catch {
      setBotError('The bot server is not running.');
      return false;
    } finally {
      setBotBusy(false);
    }
  }

  async function connectBot() {
    if (await botPost('connect')) void fetchBotStatus();
  }

  async function sendViaBot() {
    if (!responsibleUse) return;
    const indexes = messages
      .map((_, index) => index)
      .filter((index) => states[index] === 'pending' || states[index] === 'blocked');
    if (indexes.length === 0) return;
    submittedRef.current = indexes;
    const payload = indexes.map((index) => messages[index]);
    if (await botPost('send', payload)) void fetchBotStatus();
  }

  async function stopBot() {
    if (await botPost('stop')) void fetchBotStatus();
  }

  function openLink(index: number): boolean {
    const item = messages[index];
    const tab = window.open(whatsappVoucherLink(normalizePhone(item.phone), item.message), '_blank');
    if (!tab) return false;
    try {
      tab.opener = null;
    } catch {
      /* A cross-origin tab can refuse the write; only the hardening is lost. */
    }
    return true;
  }

  function openOne(index: number) {
    const allowed = openLink(index);
    setStates((current) =>
      current.map((state, position) => (position === index ? (allowed ? 'opened' : 'blocked') : state)),
    );
  }

  function advanceAuto() {
    const current = autoIndexRef.current;
    const next = states.findIndex((state, i) => i > current && (state === 'pending' || state === 'blocked'));
    if (next < 0) {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
      setRunning(false);
      return;
    }
    openOne(next);
    autoIndexRef.current = next;
  }

  function startQueue() {
    if (running) return;
    const next = states.findIndex((state) => state === 'pending' || state === 'blocked');
    if (next < 0) return;
    setRunning(true);
    autoIndexRef.current = next;
    openOne(next);
    timerRef.current = setInterval(advanceAuto, queueMs);
  }

  function stopQueue() {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    setRunning(false);
  }

  function openAll() {
    messages.forEach((_, index) => {
      if (states[index] === 'pending') openOne(index);
    });
    setRunning(true);
    const blockedCount = messages.reduce((acc, _, i) => acc + (states[i] === 'blocked' ? 1 : 0), 0);
    if (blockedCount > 0) {
      const next = states.findIndex((state) => state === 'blocked');
      if (next >= 0) {
        timerRef.current = setInterval(advanceAuto, queueMs);
      }
    }
  }

  function openFirstWaiting() {
    const index = states.findIndex((state) => state === 'pending' || state === 'blocked');
    if (index >= 0) openOne(index);
  }

  // Update states when new messages arrive (e.g. a custom-pay queue was built
  // after the panel opened), resetting the auto-send if it was running.
  useEffect(() => {
    if (messages.length !== prevCount.current) {
      prevCount.current = messages.length;
      setStates(() => messages.map((item) => (normalizePhone(item.phone) ? 'pending' : 'skipped')));
      setRunning(false);
      autoIndexRef.current = 0;
    }
  }, [messages]);

  // Restart the queue whenever it becomes enabled again.
  useEffect(() => {
    if (running) {
      const stillHasWork = states.some((state) => state === 'pending' || state === 'blocked');
      if (stillHasWork && !timerRef.current) {
        const next = states.findIndex((state) => state === 'pending' || state === 'blocked');
        if (next >= 0) {
          openOne(next);
          timerRef.current = setInterval(advanceAuto, queueMs);
        }
      }
    }
  }, [running, states, queueMs]);

  // Ask the bot for its status once on mount; then poll while it is still
  // pairing (QR flow) or actively sending, so progress appears live. When
  // the bot is idle and linked the polling stops on its own.
  useEffect(() => {
    void fetchBotStatus();
  }, []);

  useEffect(() => {
    if (!bot?.configured) return;
    const needsPolling = !bot.connected || Boolean(bot.queue?.running);
    if (!needsPolling) return;
    const id = setInterval(() => void fetchBotStatus(), 3000);
    return () => clearInterval(id);
  }, [bot?.configured, bot?.connected, bot?.queue?.running]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    };
  }, []);

  return (
    <div className="rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
        <div className="flex items-center gap-3">
          <h2 className="font-semibold text-slate-900">{title}</h2>
          <span
            className={`rounded-full px-2.5 py-0.5 text-[0.65rem] font-semibold uppercase tracking-wide ${blocked > 0 ? CHIP.blocked.look : waiting > 0 ? CHIP.pending.look : CHIP.opened.look}`}
          >
            {blocked > 0 ? `${blocked} blocked` : waiting > 0 ? `${waiting} waiting` : 'Complete'}
          </span>
        </div>
        <div className="flex gap-2">
          {running ? (
            <button
              type="button"
              onClick={stopQueue}
              className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50"
            >
              Pause
            </button>
          ) : (
            <button
              type="button"
              onClick={startQueue}
              className="rounded-lg border border-emerald-600 px-3 py-1.5 text-xs font-semibold text-emerald-700 hover:bg-emerald-50"
            >
              Resume auto-send
            </button>
          )}
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50"
          >
            Close
          </button>
        </div>
      </div>

      {bot?.configured ? (
        <div className="border-b border-slate-100 px-5 py-4">
          {!bot.available ? (
            <div className="rounded-xl bg-amber-50 px-3 py-2.5 text-xs text-amber-700">
              Auto-send bot is not running — start it on the server with{' '}
              <code className="font-semibold">npm run bot</code>, or use the manual buttons below.
            </div>
          ) : !bot.connected ? (
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div className="min-w-0 flex-1">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Auto-send bot</p>
                <p className="mt-1 text-sm text-slate-600">
                  {bot.note || 'Not connected yet. Press Connect, then scan the QR with the school phone.'}
                </p>
                <button
                  type="button"
                  onClick={connectBot}
                  disabled={botBusy}
                  className="mt-2 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-500 disabled:opacity-50"
                >
                  {botBusy ? 'Working…' : bot.qr ? 'Retry' : 'Connect'}
                </button>
                {botError ? <p className="mt-2 text-xs text-rose-600">{botError}</p> : null}
              </div>
              {bot.qr ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={bot.qr}
                  alt="WhatsApp pairing QR code"
                  className="h-36 w-36 shrink-0 self-center rounded-lg border border-slate-200 bg-white"
                />
              ) : null}
            </div>
          ) : (
            <div className="rounded-xl bg-emerald-50 px-3 py-2.5 text-xs text-emerald-700">
              <span className="font-semibold">Auto-send bot connected</span>
              {bot.phone ? <span> · +{bot.phone}</span> : null}
              {bot.note ? <span className="mt-0.5 block text-emerald-600">{bot.note}</span> : null}
              {botError ? <span className="mt-0.5 block text-rose-600">{botError}</span> : null}
            </div>
          )}
          <p className="mt-3 text-xs leading-5 text-slate-500">Messages are paced by the bot with a delay and periodic pauses. This reduces burst traffic but cannot guarantee that WhatsApp will not restrict an account. Use only with recipient consent.</p>
        </div>
      ) : null}

      <div className={`grid gap-2 px-5 py-4 ${sent + failed > 0 ? 'grid-cols-5' : 'grid-cols-3'}`}>
        <Stat label="Opened" value={opened} look="bg-emerald-50 text-emerald-700" />
        <Stat label="Waiting" value={waiting} look="bg-slate-100 text-slate-600" />
        <Stat label="No number" value={skipped} look="bg-rose-50 text-rose-600" />
        {sent + failed > 0 ? (
          <>
            <Stat label="Sent" value={sent} look="bg-emerald-100 text-emerald-800" />
            <Stat label="Failed" value={failed} look="bg-rose-50 text-rose-600" />
          </>
        ) : null}
      </div>

      {blocked > 0 && waiting > 0 ? (
        <p className="mt-3 px-5 pb-3 text-xs text-amber-700">
          The browser refused {blocked} tab{blocked === 1 ? '' : 's'} — allow pop-ups for this site, then press
          Send all again.
        </p>
      ) : null}

      <div className="space-y-3 px-5 pb-5">
        <div>
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
            Students in this run ({messages.length})
          </p>
          <div className="max-h-72 space-y-2 overflow-y-auto pr-1">
            {states.map((state, index) => (
              <div
                key={index}
                className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm ${
                  state === 'blocked'
                    ? 'bg-amber-50'
                    : state === 'sent' || state === 'opened'
                      ? 'bg-emerald-50'
                      : state === 'failed' || state === 'skipped' || state === 'nowa'
                        ? 'bg-rose-50'
                        : 'bg-slate-50'
                }`}
              >
                <span
                  className={`shrink-0 rounded-full px-2 py-0.5 text-[0.65rem] font-semibold ${CHIP[state].look}`}
                >
                  {CHIP[state].label}
                </span>
                <span className="truncate font-medium text-slate-700">{messages[index].name}</span>
                <span className="ml-auto shrink-0 text-xs text-slate-400">
                  {normalizePhone(messages[index].phone) ? 'WhatsApp' : 'No number'}
                </span>
              </div>
            ))}
          </div>
        </div>

        {waiting === 0 ? (
          botReady ? (
            sent + failed > 0 ? (
              <p className="mt-2 rounded-xl bg-emerald-50 px-3 py-2.5 text-xs text-emerald-700">
                All messages sent — {sent} delivered{failed > 0 ? `, ${failed} could not be delivered` : ''}.
              </p>
            ) : (
              <p className="mt-2 rounded-xl bg-slate-100 px-3 py-2.5 text-xs text-slate-600">Nothing left to send.</p>
            )
          ) : (
            <p className="mt-2 rounded-xl bg-emerald-50 px-3 py-2.5 text-xs text-emerald-700">
              All chats opened — press send in each WhatsApp tab.
            </p>
          )
        ) : null}

        {botSending ? (
          <div className="rounded-xl bg-sky-50 px-3 py-2.5">
            <div className="flex items-center justify-between text-xs font-semibold text-sky-700">
              <span>Bot sending…</span>
              <span className="tabular-nums">
                {bot?.queue?.index ?? 0}/{bot?.queue?.total ?? 0}
              </span>
            </div>
            <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-sky-100">
              <div
                className="h-2 rounded-full bg-sky-500 transition-all"
                style={{
                  width: `${
                    bot?.queue?.total ? Math.round((bot.queue.index / bot.queue.total) * 100) : 0
                  }%`,
                }}
              />
            </div>
          </div>
        ) : null}

        <div className="flex gap-2">
          {botReady ? (
            botSending ? (
              <button
                type="button"
                onClick={stopBot}
                disabled={botBusy}
                className="flex-1 whitespace-nowrap rounded-xl bg-rose-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-rose-500 disabled:opacity-50"
              >
                Stop sending
              </button>
            ) : (
              <button
                type="button"
                onClick={sendViaBot}
                disabled={botBusy || waiting === 0 || !responsibleUse}
                className="flex-1 whitespace-nowrap rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-emerald-500 disabled:opacity-50"
              >
                <span className="flex items-center justify-center gap-2">
                  <WaIcon />
                  Send automatically ({waiting})
                </span>
              </button>
            )
          ) : (
            <button
              type="button"
              onClick={openAll}
              disabled={waiting === 0 || !responsibleUse}
              className="flex-1 whitespace-nowrap rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-emerald-500 disabled:opacity-50"
            >
              <span className="flex items-center justify-center gap-2">
                <WaIcon />
                Send all ({waiting})
              </span>
            </button>
          )}
          <button
            type="button"
            onClick={startQueue}
            disabled={waiting === 0 || botSending || !responsibleUse}
            className="flex-1 whitespace-nowrap rounded-xl border border-blue-600 px-4 py-2.5 text-sm font-semibold text-blue-700 hover:bg-blue-50 disabled:opacity-50"
            title="Open each prepared WhatsApp link at a safe interval. You press Send in WhatsApp."
          >
            <span className="flex items-center justify-center gap-2">
              <WaIcon />
              Open manual links ({waiting})
            </span>
          </button>
          <button
            type="button"
            onClick={openFirstWaiting}
            disabled={waiting === 0 || botSending}
            className="flex-1 whitespace-nowrap rounded-xl border border-emerald-600 px-4 py-2.5 text-sm font-semibold text-emerald-700 hover:bg-emerald-50 disabled:opacity-50"
          >
            Open one link
          </button>
        </div>
      </div>

      {messages.some((_, index) =>
        states[index] === 'blocked' || states[index] === 'skipped' || states[index] === 'failed' || states[index] === 'nowa',
      ) ? (
        <div className="border-t border-slate-100 px-5 py-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Needs attention</p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {messages.map((item, index) =>
              states[index] === 'blocked' ||
              states[index] === 'skipped' ||
              states[index] === 'failed' ||
              states[index] === 'nowa' ? (
                <span
                  key={index}
                  className={`whitespace-nowrap rounded-full px-2 py-0.5 text-[0.7rem] font-semibold ${CHIP[states[index]].look}`}
                >
                  {item.name} · {CHIP[states[index]].label}
                </span>
              ) : null,
            )}
          </div>
        </div>
      ) : null}

      <p className="mt-3 px-5 pb-5 text-xs text-slate-400">
        {running
          ? `Auto-send is on — chats open one by one every ${queueMs}ms. Press Pause to check each on WhatsApp.`
          : botSending
            ? 'The bot is sending one message at a time with random delays and long pauses between batches. Numbers not on WhatsApp are skipped.'
            : botReady
              ? 'You can use automatic bot delivery, or open manual links. Manual mode opens one prepared chat at a time and you press Send in WhatsApp.'
              : 'WhatsApp opens each chat with the message already typed — press Send in the tab. Students without a saved number are skipped.'}
      </p>
    </div>
  );
}
