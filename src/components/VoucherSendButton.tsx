"use client";

/**
 * VoucherSendButton — "Send" on every fee row.
 *
 * Clicking it opens WhatsApp with the voucher already typed out, so the admin
 * only has to press send in WhatsApp. The message and the wa.me link are built
 * on the client from the row the fees screen already loaded, which means no
 * extra request and no server round trip per click.
 *
 * It is icon-only so the action cell stays one tidy row instead of a stack of
 * labelled buttons; the recipient and the voucher's due date are carried by
 * the tooltip and the aria-label. When the student has no usable number the
 * button renders disabled in grey — a wa.me link with an empty recipient
 * opens nothing, so the tooltip says what to fix instead.
 */

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
  /** The amount still owed, which is what the voucher asks for. */
  amount: number;
  /** The month's full fee, so the message can show total / paid / remaining. */
  fee?: number;
  /** What the office has received against this month's fee so far. */
  paid?: number;
};

/** The WhatsApp glyph every voucher button renders. */
function WhatsAppGlyph({ className }: { className: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="currentColor" aria-hidden="true">
      <path d="M12.04 2C6.58 2 2.13 6.45 2.13 11.91c0 1.75.46 3.45 1.32 4.95L2 22l5.25-1.38a9.9 9.9 0 0 0 4.79 1.22h.01c5.46 0 9.91-4.45 9.91-9.91S17.5 2 12.04 2Zm5.8 14.16c-.25.69-1.43 1.32-1.98 1.37-.53.05-1.02.23-3.45-.72-2.9-1.13-4.74-4.09-4.88-4.29-.14-.19-1.16-1.54-1.16-2.94 0-1.4.73-2.08.99-2.37.26-.28.57-.36.76-.36.19 0 .38 0 .55.01.19.01.44-.07.69.53.25.6.86 2.06.94 2.21.08.15.13.32.03.52-.11.19-.16.31-.32.48-.16.16-.33.36-.47.48-.15.13-.31.28-.13.54.18.27.79 1.3 1.69 2.11 1.16 1.03 2.13 1.35 2.43 1.5.3.15.47.13.65-.08.18-.21.75-.87.95-1.17.2-.3.4-.25.66-.15.27.1 1.71.81 2 .96.3.15.5.22.57.35.08.12.08.71-.17 1.4Z" />
    </svg>
  );
}

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
  fee,
  paid,
}: Props) {
  const recipient = normalizePhone(phone);

  function send() {
    if (!recipient) return;
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
      fee,
      paid,
      issuedOn: new Date(),
    });
    // noopener stops the WhatsApp tab from reaching back into the portal.
    window.open(whatsappVoucherLink(recipient, message), "_blank", "noopener,noreferrer");
  }

  // Icon-only: the WhatsApp glyph keeps the action cell to one tidy row, with
  // the recipient and due date carried by the tooltip and aria-label instead
  // of a stack of labels. No usable number → a grey disabled glyph, because a
  // wa.me link with an empty recipient opens nothing.
  if (!recipient) {
    return (
      <button
        type="button"
        disabled
        title="No phone number saved — add a father, mother or emergency number to this student"
        aria-label="Send voucher unavailable: no phone number saved for this student"
        className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-400"
      >
        <WhatsAppGlyph className="h-4 w-4" />
      </button>
    );
  }

  const due = voucherDueDate();
  return (
    <button
      type="button"
      onClick={send}
      title={`Send the fee voucher to WhatsApp ${recipient} — due ${formatVoucherDate(due)}`}
      aria-label={`Send fee voucher on WhatsApp to ${recipient}`}
      className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-emerald-600 text-white hover:bg-emerald-500"
    >
      <WhatsAppGlyph className="h-4 w-4" />
    </button>
  );
}