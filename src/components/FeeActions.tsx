"use client";

/**
 * FeeActions — the buttons on every fee row.
 *
 * Three moves, all against the same month: settle it in full, reverse it, or
 * record a custom payment (the parent hands over part of the fee and the rest
 * stays as a balance). Money recorded this way shows in the student portal at
 * once, as "paid so far" plus what still remains.
 *
 * Only the moves that apply to the row are rendered — an untouched month offers
 * Mark paid + Custom pay, a settled one offers Mark unpaid, a part-paid one all
 * three — so no disabled buttons clutter the action cell on any screen size.
 * Anything extra the row wants on the same line (the WhatsApp voucher button)
 * is passed in as `extra` and wraps with the rest.
 *
 * Whenever an action actually brings money in, the matching payment receipt is
 * opened in WhatsApp, pre-typed and addressed to the student's guardian. The
 * browser cannot send the message by itself — the admin presses send there —
 * and when the popup is blocked the same receipt stays reachable from the small
 * WhatsApp button, so nothing is ever lost.
 */

import { useState, type FormEvent, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { buildReceiptMessage, normalizePhone, whatsappVoucherLink } from "@/lib/voucher";
import { formatMoney } from "@/components/charts/palette";

/** What the fees API reports back after a save. */
export type FeeUpdate = {
  status: "paid" | "partial" | "unpaid";
  amount: number;
  paidAmount: number;
  /** What this particular action changed. */
  received: number;
  remaining: number;
};

/** Everything needed to address and word a WhatsApp receipt. */
export type FeeReceipt = {
  schoolName: string;
  studentName: string;
  className: string;
  section: string;
  rollNumber: string;
  phone: string;
};

type Props = {
  studentId: string;
  month: string;
  year: number;
  status: "paid" | "partial" | "unpaid";
  /** The whole month's fee. 0 hides the amount-dependent parts. */
  amount?: number;
  /** Money already received against it. */
  paidAmount?: number;
  /** Present where the screen knows the student's guardian number. */
  receipt?: FeeReceipt;
  /** Extra controls that share the action row, e.g. the voucher button. */
  extra?: ReactNode;
  /** Called after a successful update. Defaults to refreshing server data. */
  onUpdated?: (update: FeeUpdate) => void | Promise<void>;
};

export default function FeeActions({
  studentId,
  month,
  year,
  status,
  amount = 0,
  paidAmount = 0,
  receipt,
  extra,
  onUpdated,
}: Props) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [note, setNote] = useState("");
  const [customOpen, setCustomOpen] = useState(false);
  const [custom, setCustom] = useState("");

  const remaining = Math.max(0, amount - paidAmount);
  const fullyPaid = amount > 0 && remaining <= 0;
  const recipient = receipt ? normalizePhone(receipt.phone) : "";

  /** The wa.me link for a receipt describing `fee` / `paid`, or null. */
  function receiptLink(fee: number, paid: number) {
    if (!receipt || !recipient || fee <= 0 || paid <= 0) return null;
    const message = buildReceiptMessage({
      schoolName: receipt.schoolName,
      studentName: receipt.studentName,
      className: receipt.className,
      section: receipt.section,
      rollNumber: receipt.rollNumber,
      month,
      year,
      fee,
      paid,
    });
    // noopener stops the WhatsApp tab from reaching back into the portal.
    return whatsappVoucherLink(recipient, message);
  }

  async function update(action: "paid" | "unpaid" | "pay", received?: number) {
    setSaving(true);
    setError("");
    setNote("");
    try {
      const response = await fetch("/api/fees", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ studentId, month, year, action, received }),
      });
      const result = await response.json();
      if (!response.ok) {
        setError(result.error ?? "Unable to update fee");
        return;
      }
      const info: FeeUpdate = {
        status: (result.status ?? "unpaid") as FeeUpdate["status"],
        amount: Number(result.amount ?? amount),
        paidAmount: Number(result.paidAmount ?? 0),
        received: Number(result.received ?? 0),
        remaining: Number(result.remaining ?? 0),
      };
      if (onUpdated) await onUpdated(info);
      else router.refresh();

      // Money came in: hand the receipt to WhatsApp straight away, and keep a
      // button behind it in case the browser refused to open the tab.
      if ((action === "paid" || action === "pay") && info.received > 0) {
        const link = receiptLink(info.amount, info.paidAmount);
        if (link) {
          const opened = window.open(link, "_blank", "noopener,noreferrer");
          setNote(
            opened
              ? `${formatMoney(info.received)} recorded — press send in WhatsApp.`
              : "Payment saved, but the browser blocked WhatsApp. Tap the WhatsApp button to send the receipt.",
          );
        } else {
          setNote(`${formatMoney(info.received)} recorded. No WhatsApp number on file for a receipt.`);
        }
      } else if (action === "unpaid") {
        setNote("Payment reversed — the month is unpaid again.");
      }

      if (action === "pay") {
        setCustomOpen(false);
        setCustom("");
      }
    } catch {
      setError("Unable to connect to the server");
    } finally {
      setSaving(false);
    }
  }

  function submitCustom(event: FormEvent) {
    event.preventDefault();
    const value = Number(custom);
    if (!Number.isFinite(value) || value <= 0) {
      setError("Enter an amount greater than zero");
      return;
    }
    void update("pay", value);
  }

  const resend = receiptLink(amount, paidAmount);
  const canResend = Boolean(resend) && paidAmount > 0;

  // Which moves this row offers: an untouched month can be settled or part
  // paid, a settled month can be reversed, a part-paid month can do either.
  // Nothing disabled is ever rendered — that is what keeps the cell tidy on
  // both the desktop table and the stacked mobile cards.
  const canSettle = status !== "paid" && !fullyPaid;
  const canCustom = amount > 0 && !fullyPaid;
  const canReverse = status !== "unpaid" || paidAmount > 0;

  return (
    <div className="flex w-full flex-wrap items-center justify-start gap-1.5 sm:justify-end">
      {canSettle ? (
        <button
          type="button"
          disabled={saving}
          onClick={() => void update("paid")}
          className="h-8 whitespace-nowrap rounded-lg bg-emerald-600 px-3 text-xs font-semibold text-white hover:bg-emerald-500 disabled:opacity-50"
        >
          Mark paid
        </button>
      ) : null}
      {canCustom ? (
        <button
          type="button"
          disabled={saving}
          onClick={() => {
            setError("");
            setNote("");
            setCustomOpen((open) => !open);
          }}
          aria-expanded={customOpen}
          title="Record a part payment, for example 1500 of 3000"
          className="h-8 whitespace-nowrap rounded-lg border border-blue-200 bg-blue-50 px-3 text-xs font-semibold text-blue-700 hover:border-blue-300 disabled:opacity-50"
        >
          Custom pay
        </button>
      ) : null}
      {canReverse ? (
        <button
          type="button"
          disabled={saving}
          onClick={() => void update("unpaid")}
          title="Reverse this payment — the month becomes unpaid again"
          className="h-8 whitespace-nowrap rounded-lg bg-slate-200 px-3 text-xs font-semibold text-slate-700 hover:bg-slate-300 disabled:opacity-50"
        >
          Mark unpaid
        </button>
      ) : null}
      {canResend ? (
        <button
          type="button"
          onClick={() => resend && window.open(resend, "_blank", "noopener,noreferrer")}
          title={`Send the payment receipt to WhatsApp ${recipient}`}
          aria-label="Send payment receipt on WhatsApp"
          className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-emerald-50 text-emerald-700 hover:bg-emerald-100"
        >
          <svg viewBox="0 0 24 24" className="h-4 w-4" fill="currentColor" aria-hidden="true">
            <path d="M12.04 2C6.58 2 2.13 6.45 2.13 11.91c0 1.75.46 3.45 1.32 4.95L2 22l5.25-1.38a9.9 9.9 0 0 0 4.79 1.22h.01c5.46 0 9.91-4.45 9.91-9.91S17.5 2 12.04 2Zm5.8 14.16c-.25.69-1.43 1.32-1.98 1.37-.53.05-1.02.23-3.45-.72-2.9-1.13-4.74-4.09-4.88-4.29-.14-.19-1.16-1.54-1.16-2.94 0-1.4.73-2.08.99-2.37.26-.28.57-.36.76-.36.19 0 .38 0 .55.01.19.01.44-.07.69.53.25.6.86 2.06.94 2.21.08.15.13.32.03.52-.11.19-.16.31-.32.48-.16.16-.33.36-.47.48-.15.13-.31.28-.13.54.18.27.79 1.3 1.69 2.11 1.16 1.03 2.13 1.35 2.43 1.5.3.15.47.13.65-.08.18-.21.75-.87.95-1.17.2-.3.4-.25.66-.15.27.1 1.71.81 2 .96.3.15.5.22.57.35.08.12.08.71-.17 1.4Z" />
          </svg>
        </button>
      ) : null}
      {extra}

      {customOpen ? (
        <form onSubmit={submitCustom} className="flex items-center gap-1.5">
          <label className="sr-only" htmlFor={`pay-${studentId}-${month}-${year}`}>
            Amount received
          </label>
          <input
            id={`pay-${studentId}-${month}-${year}`}
            type="number"
            min={1}
            step="any"
            autoFocus
            value={custom}
            onChange={(event) => setCustom(event.target.value)}
            placeholder={amount > 0 ? String(remaining) : "0"}
            className="w-28 rounded-lg border border-slate-300 px-2 py-1.5 text-xs"
          />
          <button
            type="submit"
            disabled={saving}
            className="whitespace-nowrap rounded-lg bg-blue-600 px-2.5 py-1.5 text-xs font-semibold text-white disabled:opacity-40"
          >
            {saving ? "Saving…" : "Save"}
          </button>
          <button
            type="button"
            onClick={() => {
              setCustomOpen(false);
              setCustom("");
              setError("");
            }}
            className="rounded-lg px-2 py-1.5 text-xs font-semibold text-slate-500 hover:text-slate-700"
          >
            Cancel
          </button>
        </form>
      ) : null}

      {error ? <p className="basis-full text-xs text-red-600 sm:text-right">{error}</p> : null}
      {note ? <p className="basis-full text-xs text-slate-500 sm:text-right">{note}</p> : null}
    </div>
  );
}
