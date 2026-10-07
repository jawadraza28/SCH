'use strict';

/**
 * Fee voucher helpers.
 *
 * A voucher is the receipt the school sends to a parent: it carries the
 * student's identity, the voucher number, the amount due (the class fee) and a
 * due date ten days out. The message is plain text so it can be pasted into
 * WhatsApp by hand as well as sent from the fees screen.
 *
 * This module is deliberately isomorphic: no database, no server-only imports.
 * So the server can mint a voucher number on create and the browser can build
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
  return `VCH-${year}-${String(Math.max(1, sequence)).padStart(4, '0')}`;
}

/** Formats a date the way the voucher prints it. */
export function formatVoucherDate(date: Date) {
  return date.toLocaleDateString('en-US', { day: 'numeric', month: 'long', year: 'numeric' });
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
  return contact.fatherPhone?.trim() || contact.emergencyContact?.trim() || contact.motherPhone?.trim() || '';
}

/**
 * Normalises a phone number to the bare digits WhatsApp expects.
 *
 * Pakistani numbers are stored as 0300...1234567 but WhatsApp addresses them as
 * 92300...1234567, so a local 0 is replaced by the country code. Returns "" when
 * the result is not a plausible 10-15 digit international number, which is how
 * the caller knows to disable the Send button instead of opening a dead link.
 */
export function normalizePhone(raw: string): string {
  const digits = String(raw ?? '').replace(/[^\d]/g, '');
  if (!digits) return '';
  let international = digits;
  if (international.startsWith('0092')) international = `92${international.slice(4)}`;
  else if (international.startsWith('0') && international.length === 11) international = `92${international.slice(1)}`;
  else if (international.startsWith('92') && international.length === 11) international = `92${international.slice(2)}`;
  return /^\d{10,15}$/.test(international) ? international : '';
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

/** The due date printed on the voucher (ten days after it was issued). */
export function voucherDueDate(issuedOn: Date = new Date()) {
  return addDays(issuedOn, VOUCHER_DUE_DAYS);
}

/**
 * The WhatsApp text. WhatsApp renders asterisks as bold, so the labels are
 * wrapped rather than using Markdown headings that would show up literally.
 */
export function buildVoucherMessage(details: VoucherDetails): string {
  const due = voucherDueDate(details.issuedOn);
  const amount = new Intl.NumberFormat('en-US').format(Math.round(details.amount));
  const greeting = details.studentName.trim().split(/\s+/)[0] || details.studentName;

  return [
    `*FEE VOUCHER — ${details.schoolName.trim() || 'School'}*`,
    '',
    `Assalam-o-Alaikum ${greeting},`,
    '',
    `*Voucher No:* ${details.voucherNo || '-'}`,
    `*Student:* ${details.studentName}`,
    `*Class:* ${details.className}-${details.section}`,
    `*Roll No:* ${details.rollNumber || '-'}`,
    `*Month:* ${details.month} ${details.year}`,
    `*Amount Due:* Rs ${amount}`,
    `*Due Date:* ${formatVoucherDate(due)}`,
    '',
    `Please pay the above amount on or before ${formatVoucherDate(due)}.`,
    'Thank you.',
  ].join('\n');
}

/**
 * The WhatsApp text of a payment receipt. It repeats what the admin recorded:
 * fee for the month, money received, and what is still owed, so the parent can
 * check it against the receipt without opening the portal. WhatsApp renders
 * asterisks as bold, hence the wrapped labels.
 */
export function buildReceiptMessage(details: {
  schoolName: string;
  studentName: string;
  className: string;
  section: string;
  rollNumber: string;
  month: string;
  year: number | string;
  /** The whole month's fee. */
  fee: number;
  /** What the school has received against it, in total. */
  paid: number;
  /** The date this payment was recorded. */
  paidOn?: Date;
}): string {
  const money = (value: number) => new Intl.NumberFormat('en-US').format(Math.round(value));
  const remaining = Math.max(0, details.fee - details.paid);
  const greeting = details.studentName.trim().split(/\s+/)[0] || details.studentName;
  const paidOn = details.paidOn ?? new Date();

  return [
    `*PAYMENT RECEIPT — ${details.schoolName.trim() || 'School'}*`,
    '',
    `Assalam-o-Alaikum ${greeting},`,
    '',
    `*Student:* ${details.studentName}`,
    `*Class:* ${details.className}-${details.section}`,
    `*Roll No:* ${details.rollNumber || '-'}`,
    `*Month:* ${details.month} ${details.year}`,
    `*Fee:* Rs ${money(details.fee)}`,
    `*Received:* Rs ${money(details.paid)}`,
    remaining > 0 ? `*Balance remaining:* Rs ${money(remaining)}` : '*Balance remaining:* Nil — paid in full',
    `*Paid on:* ${formatVoucherDate(paidOn)}`,
    '',
    remaining > 0
      ? `Please clear the remaining Rs ${money(remaining)} at the school office.`
      : 'Thank you, your fee for this month is fully cleared.',
  ].join('\n');
}

/**
 * The WhatsApp text for a custom pay, where the parent has paid a specific
 * amount that is less than the full month's fee. WhatsApp renders asterisks
 * as bold, so the labels are wrapped rather than using Markdown headings.
 */
export function buildCustomPayMessage(details: {
  schoolName: string;
  studentName: string;
  className: string;
  section: string;
  rollNumber: string;
  voucherNo: string;
  month: string;
  year: number | string;
  /** The whole month's fee. */
  fee: number;
  /** What the school has now received against this month's fee. */
  paid: number;
  /** The amount the parent actually handed over this time. */
  received: number;
}): string {
  const money = (value: number) => new Intl.NumberFormat('en-US').format(Math.round(value));
  const remaining = Math.max(0, details.fee - details.paid);
  const received = Math.max(0, details.received);
  const greeting = details.studentName.trim().split(/\s+/)[0] || details.studentName;

  return [
    `*CUSTOM PAY — ${details.schoolName.trim() || 'School'}*`,
    '',
    `Assalam-o-Alaikum ${greeting},`,
    '',
    `*Voucher No:* ${details.voucherNo || '-'}`,
    `*Student:* ${details.studentName}`,
    `*Class:* ${details.className}-${details.section}`,
    `*Roll No:* ${details.rollNumber || '-'}`,
    `*Month:* ${details.month} ${details.year}`,
    `*Fee:* Rs ${money(details.fee)}`,
    `*Paid:* Rs ${money(details.paid)}`,
    `*Received now:* Rs ${money(received)}`,
    remaining > 0 ? `*Still due:* Rs ${money(remaining)}` : '*Balance*: Nil — paid in full',
    '',
    received > 0
      ? `Thank you for your payment of Rs ${money(received)}. ${remaining > 0 ? `Your remaining balance is Rs ${money(remaining)}.` : 'Your fee for this month is now fully cleared.'}`
      : `The amount you submitted was Rs ${money(received)}. Please return any excess to the school office.`,
  ].join('\n');
}

/** The wa.me deep link with the voucher text already encoded into it. */
export function whatsappVoucherLink(phone: string, message: string): string {
  return `https://wa.me/${normalizePhone(phone)}?text=${encodeURIComponent(message)}`;
}

