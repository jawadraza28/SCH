'use client';

/* eslint-disable react-hooks/set-state-in-effect, react-hooks/exhaustive-deps */

/**
 * WhatsAppBulkSend — the send panel behind bulk fee actions.
 *
 * Browsers cannot deliver a WhatsApp message on their own: every wa.me link
 * opens a chat with the text already typed, and the admin presses send there.
 * The panel now auto-opens the chats in the background, one every 3–4 seconds
 * (configurable), so the admin can step away. The big "Send all" button still
 * kicks off the queue, "Send next" walks any remaining tabs manually, and we
 * count every refused tab so nothing is silently lost.
 */

import { useState, useEffect, useRef } from 'react';
import { normalizePhone, whatsappVoucherLink } from '@/lib/voucher';

/** One pre-composed message waiting to be opened on WhatsApp. */
export type WhatsAppMessage = {
  name: string;
  phone: string;
  message: string;
};

type ItemState = 'pending' | 'opened' | 'blocked' | 'skipped';

const CHIP: Record<ItemState, { label: string; look: string }> = {
  pending: { label: 'Waiting', look: 'bg-slate-100 text-slate-500' },
  opened: { label: 'Opened', look: 'bg-emerald-50 text-emerald-700' },
  blocked: { label: 'Blocked', look: 'bg-amber-50 text-amber-700' },
  skipped: { label: 'No number', look: 'bg-rose-50 text-rose-600' },
};

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
};

export default function WhatsAppBulkSend({ title, messages, onClose, queueMs = 3500 }: Props) {
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
    if (next > 0) openOne(next);
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
          if (next > 0) openOne(next);
          timerRef.current = setInterval(advanceAuto, queueMs);
        }
      }
    }
  }, [running, states, queueMs]);

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

      <div className="grid grid-cols-3 gap-2 px-5 py-4">
        <Stat label="Opened" value={opened} look="bg-emerald-50 text-emerald-700" />
        <Stat label="Waiting" value={waiting} look="bg-slate-100 text-slate-600" />
        <Stat label="No number" value={skipped} look="bg-rose-50 text-rose-600" />
      </div>

      {blocked > 0 && waiting > 0 ? (
        <p className="mt-3 px-5 pb-3 text-xs text-amber-700">
          The browser refused {blocked} tab{blocked === 1 ? '' : 's'} — allow pop-ups for this site, then press
          Send all again.
        </p>
      ) : null}

      <div className="space-y-3 px-5 pb-5">
        {states.map((state, index) =>
          state === 'pending' || state === 'blocked' ? (
            <div
              key={index}
              className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm ${state === 'pending' ? 'bg-slate-50' : 'bg-amber-50'}`}
            >
              <span className={`rounded-full px-2 py-0.5 text-[0.65rem] font-semibold ${CHIP[state].look}`}>
                {CHIP[state].label}
              </span>
              <span className="font-medium text-slate-700 truncate">{messages[index].name}</span>
              <span className="text-xs text-slate-400">
                {normalizePhone(messages[index].phone) ? 'WhatsApp' : 'No number'}
              </span>
            </div>
          ) : null,
        )}

        {waiting === 0 ? (
          <p className="mt-2 rounded-xl bg-emerald-50 px-3 py-2.5 text-xs text-emerald-700">
            All chats opened — press send in each WhatsApp tab.
          </p>
        ) : null}

        <div className="flex gap-2">
          <button
            type="button"
            onClick={openAll}
            disabled={waiting === 0}
            className="flex-1 whitespace-nowrap rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-emerald-500 disabled:opacity-50"
          >
            <span className="flex items-center justify-center gap-2">
              <svg viewBox="0 0 24 24" className="h-5 w-5" fill="currentColor" aria-hidden="true">
                <path d="M12.04 2C6.58 2 2.13 6.45 2.13 11.91c0 1.75.46 3.45 1.32 4.95L2 22l5.25-1.38a9.9 9.9 0 0 0 4.79 1.22h.01c5.46 0 9.91-4.45 9.91-9.91S17.5 2 12.04 2Zm5.8 14.16c-.25.69-1.43 1.32-1.98 1.37-.53.05-1.02.23-3.45-.72-2.9-1.13-4.74-4.09-4.88-4.29-.14-.19-1.16-1.54-1.16-2.94 0-1.4.73-2.08.99-2.37.26-.28.57-.36.76-.36.19 0 .38 0 .55.01.19.01.44-.07.69.53.25.6.86 2.06.94 2.21.08.15.13.32.03.52-.11.19-.16.31-.32.48-.16.16-.33.36-.47.48-.15.13-.31.28-.13.54.18.27.79 1.3 1.69 2.11 1.16 1.03 2.13 1.35 2.43 1.5.3.15.47.13.65-.08.18-.21.75-.87.95-1.17.2-.3.4-.25.66-.15.27.1 1.71.81 2 .96.3.15.5.22.57.35.08.12.08.71-.17 1.4Z" />
              </svg>
              Send all ({waiting})
            </span>
          </button>
          <button
            type="button"
            onClick={openFirstWaiting}
            disabled={waiting === 0}
            className="flex-1 whitespace-nowrap rounded-xl border border-emerald-600 px-4 py-2.5 text-sm font-semibold text-emerald-700 hover:bg-emerald-50 disabled:opacity-50"
          >
            Send next
          </button>
        </div>
      </div>

      {messages.some((_, index) => states[index] === 'blocked' || states[index] === 'skipped') ? (
        <div className="border-t border-slate-100 px-5 py-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Needs attention</p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {messages.map((item, index) =>
              states[index] === 'blocked' || states[index] === 'skipped' ? (
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
          : 'WhatsApp opens each chat with the message already typed — press send in the tab. Students without a saved number are skipped.'}
      </p>
    </div>
  );
}
