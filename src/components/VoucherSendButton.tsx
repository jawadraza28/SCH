"use client";

/**
 * VoucherSendButton — "Send" on every fee row.
 *
 * Clicking it opens WhatsApp with the voucher already typed out, so the admin
 * only has to press send in WhatsApp. The message and the wa.me link are built
 * on the client from the row the fees screen already loaded, which means no
 * extra request and no server round trip per click.
 *
 * The button is disabled when the student has no usable number — a wa.me link
 * with an empty recipient opens nothing, so the admin is told what to fix
 * instead of clicking into a dead end.
 */

import { useState } from "react";
import { buildVoucherMessage, normalizePhone, voucherDueDate, formatVoucherDate, whatsappVoucherLink } from "@/lib/voucher";

type Props = {
  schoolName: string;
  studentName: string;
  className: string;
  section: string;
  rollNumber: string;
  voucherNo: string;
  phone: string;
  month: string;
  year: string;
  /** The class fee charged for this month. */
  amount: number;
};

export default function VoucherSendButton({
  schoolName,
  studentName,
  className,
  section,
  rollNumber,
  voucherNo,
  phone,
  month,
  year,
  amount,
}: Props) {
  const [error, setError] = useState("");
  const recipient = normalizePhone(phone);

  function send() {
    setError("");
    if (!recipient) {
      setError("No usable phone number on this student.");
      return;
    }
    const message = buildVoucherMessage({
      schoolName,
      studentName,
      className,
      section,
      rollNumber,
      voucherNo,
      month,
      year,
      amount,
      issuedOn: new Date(),
    });
    // noopener stops the WhatsApp tab from reaching back into the portal.
    window.open(whatsappVoucherLink(recipient, message), "_blank", "noopener,noreferrer");
  }

  const due = voucherDueDate();

  if (!recipient) {
    return (
      <div className="flex flex-col items-end gap-1">
        <button
          type="button"
          disabled
          title="Add a father, mother or emergency phone number to this student"
          className="whitespace-nowrap rounded-lg bg-slate-100 px-3 py-1.5 text-xs font-semibold text-slate-400"
        >
          Send voucher
        </button>
        <p className="max-w-[13rem] text-right text-[0.7rem] leading-snug text-slate-400">
          No phone number saved for this student
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        type="button"
        onClick={send}
        title={`Send the fee voucher to WhatsApp ${recipient} — due ${formatVoucherDate(due)}`}
        className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-500"
      >
        <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="currentColor" aria-hidden="true">
          <path d="M12.04 2C6.58 2 2.13 6.45 2.13 11.91c0 1.75.46 3.45 1.32 4.95L2 22l5.25-1.38a9.9 9.9 0 0 0 4.79 1.22h.01c5.46 0 9.91-4.45 9.91-9.91S17.5 2 12.04 2Zm5.8 14.16c-.25.69-1.43 1.32-1.98 1.37-.53.05-1.02.23-3.45-.72-2.9-1.13-4.74-4.09-4.88-4.29-.14-.19-1.16-1.54-1.16-2.94 0-1.4.73-2.08.99-2.37.26-.28.57-.36.76-.36.19 0 .38 0 .55.01.19.01.44-.07.69.53.25.6.86 2.06.94 2.21.08.15.13.32.03.52-.11.19-.16.31-.32.48-.16.16-.33.36-.47.48-.15.13-.31.28-.13.54.18.27.79 1.3 1.69 2.11 1.16 1.03 2.13 1.35 2.43 1.5.3.15.47.13.65-.08.18-.21.75-.87.95-1.17.2-.3.4-.25.66-.15.27.1 1.71.81 2 .96.3.15.5.22.57.35.08.12.08.71-.17 1.4Z" />
        </svg>
        Send voucher
      </button>
      <p className="text-right text-[0.7rem] text-slate-400">Due {formatVoucherDate(due)}</p>
      {error ? <p className="text-right text-[0.7rem] text-red-600">{error}</p> : null}
    </div>
  );
}