"use strict";

/**
 * Fee voucher helpers.
 *
 * A voucher is the receipt the school sends to a parent: it carries the
 * student's identity, the voucher number, the amount due (the class fee) and a
 * due date ten days out. The message is plain text so it can be pasted into
 * WhatsApp by hand as well as sent from the fees screen.
 *
 * This module is deliberately isomorphic — no database, no server-only imports —
 * so the server can mint a voucher number on create and the browser can build
 * the WhatsApp link without a round trip.
 */

/** How long a voucher stays payable. */
export const VOUCHER_DUE_DAYS = 10;

/** Days after the fee month a voucher is issued for. */
function addDays(from: Date, days: number) {
  const result = new Date(from.getTime());
  result.setDate(result.getDate() + days);
  return result;
}

/** Voucher number for the Nth voucher of a year, e.g. `VCH-2026-0001`. */
export function buildVoucherNo(sequence: number, year = new Date().getFullYear()) {
  return `VCH-${year}-${String(Math.max(1, sequence)).padStart(4, "0")}`;
}

/** Formats a date the way the voucher prints it. */
export function formatVoucherDate(date: Date) {
  return date.toLocaleDateString("en-US", { day: "numeric", month: "long", year: "numeric" });
}

/**
 * Picks the parent's number to send the voucher to.
 *
 * The guardian's mobile is the right destination for a fee notice, so it wins;
 * the emergency contact is the fallback, then the mother's number.
 */
export function voucherRecipient(contact: {
  fatherPhone?: string;
  motherPhone?: string;
  emergencyContact?: string;
}): string {
  return contact.fatherPhone?.trim() || contact.emergencyContact?.trim() || contact.motherPhone?.trim() || "";
}

/**
 * Normalises a phone number to the bare digits WhatsApp expects.
 *
 * Pakistani numbers are stored as 0300…1234567 but WhatsApp addresses them as
 * 92300…1234567, so a local 0 is replaced by the country code. Returns "" when
 * the result is not a plausible 10–15 digit international number, which is how
 * the caller knows to disable the Send button instead of opening a dead link.
 */
export function normalizePhone(raw: string): string {
  const digits = String(raw ?? "").replace(/[^\d]/g, "");
  if (!digits) return "";
  let international = digits;
  if (international.startsWith("0092")) international = `92${international.slice(4)}`;
  else if (international.startsWith("0") && international.length === 11) international = `92${international.slice(1)}`;
  else if (international.startsWith("92") && international.length === 11) international = `92${international.slice(2)}`;
  return /^\d{10,15}$/.test(international) ? international : "";
}

/** A voucher, as rendered into the WhatsApp message. */
export type VoucherDetails = {
  schoolName: string;
  studentName: string;
  className: string;
  section: string;
  rollNumber: string;
  voucherNo: string;
  month: string;
  year: number | string;
  amount: number;
  /** When the voucher was issued; the due date is ten days after this. */
  issuedOn: Date;
};

/** The due date printed on the voucher — ten days after it was issued. */
export function voucherDueDate(issuedOn: Date = new Date()) {
  return addDays(issuedOn, VOUCHER_DUE_DAYS);
}

/**
 * The WhatsApp text. WhatsApp renders *asterisks* as bold, so the labels are
 * wrapped rather than using Markdown headings that would show up literally.
 */
export function buildVoucherMessage(details: VoucherDetails): string {
  const due = voucherDueDate(details.issuedOn);
  const amount = new Intl.NumberFormat("en-US").format(Math.round(details.amount));
  const greeting = details.studentName.trim().split(/\s+/)[0] || details.studentName;

  return [
    `*FEE VOUCHER — ${details.schoolName.trim() || "School"}*`,
    "",
    `Assalam-o-Alaikum ${greeting},`,
    "",
    `*Voucher No:* ${details.voucherNo || "-"}`,
    `*Student:* ${details.studentName}`,
    `*Class:* ${details.className}-${details.section}`,
    `*Roll No:* ${details.rollNumber || "-"}`,
    `*Period:* ${details.month} ${details.year}`,
    `*Amount Due:* Rs ${amount}`,
    `*Due Date:* ${formatVoucherDate(due)}`,
    "",
    `Please pay the above amount on or before ${formatVoucherDate(due)}.`,
    "Thank you.",
  ].join("\n");
}

/** The wa.me deep link with the voucher text already encoded into it. */
export function whatsappVoucherLink(phone: string, message: string): string {
  return `https://wa.me/${normalizePhone(phone)}?text=${encodeURIComponent(message)}`;
}