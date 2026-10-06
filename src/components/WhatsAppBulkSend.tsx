"use client";

/**
 * WhatsAppBulkSend — the send panel behind bulk fee actions.
 *
 * Browsers cannot deliver a WhatsApp message on their own: every wa.me link
 * opens a chat with the text already typed, and the admin presses send there.
 * The panel is therefore a compact summary — three counters and one big
 * "Send all" button — NOT a line-by-line list: a single click opens every
 * remaining chat at once (each refusal is counted and stays in the queue), and
 * "Send next" walks them one at a time as the fallback. Only the exceptions
 * (blocked tabs, missing numbers) are named, under "Needs attention".
 *
 * Popup blockers refuse window.open calls made outside a user gesture, so the
 * buttons must be clicked — the panel deliberately never opens tabs by itself.
 *
 * Tabs are opened without the noopener feature so a null return can be told
 * apart from success — the counts above depend on it — and the opener is then
 * cleared by hand, which is what noopener would have done anyway.
 */

import { useState } from "react";
import { normalizePhone, whatsappVoucherLink } from "@/lib/voucher";

/** One pre-composed message waiting to be opened on WhatsApp. */
export type WhatsAppMessage = {
  /** Who the chat is for, as shown in the queue list. */
  name: string;
  /** Guardian number as saved on the student; unusable ones are skipped. */
  phone: string;
  /** The voucher or receipt text, already built by the caller. */
  message: string;
};

type ItemState = "pending" | "opened" | "blocked" | "skipped";

const CHIP: Record<ItemState, { label: string; look: string }> = {
  pending: { label: "Waiting", look: "bg-slate-100 text-slate-500" },
  opened: { label: "Opened", look: "bg-emerald-50 text-emerald-700" },
  blocked: { label: "Blocked", look: "bg-amber-50 text-amber-700" },
  skipped: { label: "No number", look: "bg-rose-50 text-rose-600" },
};

/** One counter in the panel's summary row. */
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
};

export default function WhatsAppBulkSend({ title, messages, onClose }: Props) {
  // Skipped up front, so a row without a usable number never reaches wa.me.
  const [states, setStates] = useState<ItemState[]>(() =>
    messages.map((item) => (normalizePhone(item.phone) ? "pending" : "skipped")),
  );

  const opened = states.filter((state) => state === "opened").length;
  const waiting = states.filter((state) => state === "pending" || state === "blocked").length;
  const skipped = states.filter((state) => state === "skipped").length;
  const blocked = states.filter((state) => state === "blocked").length;

  /** Opens message `index` and reports whether the browser allowed the tab. */
  function openLink(index: number): boolean {
    const item = messages[index];
    const tab = window.open(whatsappVoucherLink(normalizePhone(item.phone), item.message), "_blank");
    if (!tab) return false;
    // noopener by hand: the feature string would make window.open return null,
    // and the counts here need the real result to spot a blocked queue.
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
      current.map((state, position) => (position === index ? (allowed ? "opened" : "blocked") : state)),
    );
  }

  function openFirstWaiting() {
    const index = states.findIndex((state) => state === "pending" || state === "blocked");
    if (index >= 0) openOne(index);
  }

  function openAll() {
    // Results are computed before the single setState: window.open must not
    // run inside a state updater, which React may invoke twice in development.
    const results = states.map((state, index) =>
      state === "pending" || state === "blocked" ? (openLink(index) ? "opened" : "blocked") : state,
    );
    setStates(results);
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={title}
      className="print:hidden fixed inset-0 z-[70] flex items-center justify-center bg-slate-950/50 p-4"
    >
      <div className="flex w-full max-w-lg flex-col rounded-2xl bg-white p-5 shadow-xl sm:p-6">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="font-semibold text-slate-900">{title}</h2>
            <p className="mt-1 text-sm text-slate-500">
              {waiting > 0
                ? `${waiting} chat${waiting === 1 ? "" : "s"} ready — one click opens every WhatsApp chat.`
                : `All ${states.length} chats handled.`}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="-m-1.5 rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
          >
            <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Totals instead of a line-by-line list: what matters is how many
            chats are out, how many remain, and who has no number. */}
        <div className="mt-4 grid grid-cols-3 gap-2">
          <Stat label="Opened" value={opened} look="bg-emerald-50 text-emerald-700" />
          <Stat label="Waiting" value={waiting} look="bg-slate-100 text-slate-600" />
          <Stat label="No number" value={skipped} look="bg-rose-50 text-rose-600" />
        </div>

        {blocked > 0 && waiting > 0 ? (
          <p className="mt-3 rounded-xl bg-amber-50 px-3 py-2 text-xs text-amber-700">
            The browser refused {blocked} tab{blocked === 1 ? "" : "s"} — allow pop-ups for this site, then press
            Send all again.
          </p>
        ) : null}

        <button
          type="button"
          autoFocus
          onClick={openAll}
          disabled={waiting === 0}
          className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 py-3 text-sm font-semibold text-white hover:bg-emerald-500 disabled:opacity-50"
        >
          <svg viewBox="0 0 24 24" className="h-5 w-5" fill="currentColor" aria-hidden="true">
            <path d="M12.04 2C6.58 2 2.13 6.45 2.13 11.91c0 1.75.46 3.45 1.32 4.95L2 22l5.25-1.38a9.9 9.9 0 0 0 4.79 1.22h.01c5.46 0 9.91-4.45 9.91-9.91S17.5 2 12.04 2Zm5.8 14.16c-.25.69-1.43 1.32-1.98 1.37-.53.05-1.02.23-3.45-.72-2.9-1.13-4.74-4.09-4.88-4.29-.14-.19-1.16-1.54-1.16-2.94 0-1.4.73-2.08.99-2.37.26-.28.57-.36.76-.36.19 0 .38 0 .55.01.19.01.44-.07.69.53.25.6.86 2.06.94 2.21.08.15.13.32.03.52-.11.19-.16.31-.32.48-.16.16-.33.36-.47.48-.15.13-.31.28-.13.54.18.27.79 1.3 1.69 2.11 1.16 1.03 2.13 1.35 2.43 1.5.3.15.47.13.65-.08.18-.21.75-.87.95-1.17.2-.3.4-.25.66-.15.27.1 1.71.81 2 .96.3.15.5.22.57.35.08.12.08.71-.17 1.4Z" />
          </svg>
          Send all ({waiting})
        </button>
        <div className="mt-2 flex gap-2">
          <button
            type="button"
            onClick={openFirstWaiting}
            disabled={waiting === 0}
            className="flex-1 whitespace-nowrap rounded-xl border border-emerald-600 px-4 py-2.5 text-sm font-semibold text-emerald-700 hover:bg-emerald-50 disabled:opacity-50"
          >
            Send next
          </button>
          <button
            type="button"
            onClick={onClose}
            className="flex-1 whitespace-nowrap rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-600 hover:bg-slate-50"
          >
            {waiting === 0 ? "Done" : "Close"}
          </button>
        </div>

        {/* Only the exceptions are named — blocked tabs and missing numbers —
            so the panel stays a summary rather than a scroll of students. */}
        {messages.some((_, index) => states[index] === "blocked" || states[index] === "skipped") ? (
          <div className="mt-4 rounded-xl border border-slate-100 p-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Needs attention</p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {messages.map((item, index) =>
                states[index] === "blocked" || states[index] === "skipped" ? (
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

        <p className="mt-4 text-xs text-slate-400">
          WhatsApp opens each chat with the message already typed — press send in the tab. Students without a saved
          number are skipped.
        </p>
      </div>
    </div>
  );
}
