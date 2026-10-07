"use client";

/* eslint-disable react-hooks/set-state-in-effect, react-hooks/exhaustive-deps */

import Link from "next/link";
import { FormEvent, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import FeeActions from "@/components/FeeActions";
import VoucherSendButton from "@/components/VoucherSendButton";
import WhatsAppBulkSend, { type WhatsAppMessage } from "@/components/WhatsAppBulkSend";
import { SkeletonRows } from "@/components/Loaders";
import Pagination from "@/components/Pagination";
import BackLink from "@/components/BackLink";
import { formatMoney } from "@/components/charts/palette";
import { buildReceiptMessage, buildVoucherMessage } from "@/lib/voucher";

type Row = {
  id: string;
  fullName: string;
  studentId: string;
  voucherNo: string;
  voucherPhone: string;
  cnic: string;
  className: string;
  section: string;
  rollNumber: string;
  accountStatus: string;
  /** The month's full fee. */
  amount: number;
  baseAmount: number;
  discountAmount: number;
  discountReason: string;
  /** What the office has received against it. */
  paidAmount: number;
  /** What is still owed. */
  remaining: number;
  status: "paid" | "partial" | "unpaid";
  paidDate: string | null;
};

type Summary = {
  total: number;
  paid: number;
  partial: number;
  unpaid: number;
  shown: number;
  collected: number;
  outstanding: number;
};
type Filters = { search: string; className: string; section: string; month: string; year: string; status: string };

/** One student the bulk "mark all paid" run settled, as the API reports it. */
type SettledStudent = {
  fullName: string;
  className: string;
  section: string;
  rollNumber: string;
  phone: string;
  amount: number;
};

const months = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const EMPTY_SUMMARY: Summary = { total: 0, paid: 0, partial: 0, unpaid: 0, shown: 0, collected: 0, outstanding: 0 };

/** The pill that names a row's state — paid, partly paid, unpaid, or no fee. */
function StatusBadge({ status, amount }: { status: Row["status"]; amount: number }) {
  // Nothing configured to charge is not "unpaid" in any useful sense; a
  // neutral pill says so instead of crying wolf on every open month.
  if (amount <= 0) {
    return (
      <span className="whitespace-nowrap rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-500">
        No fee
      </span>
    );
  }
  const look =
    status === "paid"
      ? "bg-emerald-50 text-emerald-700"
      : status === "partial"
        ? "bg-blue-50 text-blue-700"
        : "bg-amber-50 text-amber-700";
  const label = status === "paid" ? "Paid" : status === "partial" ? "Partly paid" : "Unpaid";
  return <span className={`whitespace-nowrap rounded-full px-3 py-1 text-xs font-semibold ${look}`}>{label}</span>;
}

/** Due, received and balance for one row, as a compact three-line block. */
function MoneyBreakdown({ row }: { row: Row }) {
  return (
    <div className="text-sm">
      <p className="font-semibold tabular-nums text-slate-700">{formatMoney(row.amount)}</p>
      {row.discountAmount > 0 ? <p className="text-xs font-semibold text-violet-600">Discounted · saved {formatMoney(row.discountAmount)}</p> : null}
      <p className="mt-0.5 text-xs tabular-nums text-emerald-600">Paid {formatMoney(row.paidAmount)}</p>
      <p className={`text-xs tabular-nums ${row.remaining > 0 ? "text-rose-600" : "text-slate-400"}`}>
        {row.remaining > 0 ? `Balance ${formatMoney(row.remaining)}` : "Nothing due"}
      </p>
      {/* A date only means something when money actually arrived — a stale
          paidDate on an untouched row must not read as "Paid on …". */}
      {row.paidDate && row.paidAmount > 0 ? (
        <p className="mt-1 text-[0.7rem] text-slate-400">
          {row.remaining > 0 ? "Last payment " : "Paid on "}
          {new Date(row.paidDate).toLocaleDateString()}
        </p>
      ) : null}
    </div>
  );
}

type DiscountStudent = { _id: string; fullName: string; studentId?: string; class?: string; section?: string };

function DiscountWorkspace() {
  const now = new Date();
  const [students, setStudents] = useState<DiscountStudent[]>([]);
  const [studentId, setStudentId] = useState("");
  const [month, setMonth] = useState(months[now.getMonth()]);
  const [year, setYear] = useState(String(now.getFullYear()));
  const [discount, setDiscount] = useState("0");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    void fetch("/api/students?status=active")
      .then((response) => response.json())
      .then((result) => setStudents(Array.isArray(result.students) ? result.students : []))
      .catch(() => setError("Unable to load students"));
  }, []);

  async function save(event: FormEvent) {
    event.preventDefault();
    setBusy(true); setError(""); setMessage("");
    try {
      const response = await fetch("/api/fees", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "discount", studentId, month, year: Number(year), discountAmount: Number(discount), discountReason: reason }),
      });
      const result = await response.json();
      if (!response.ok) { setError(result.error ?? "Unable to save discount"); return; }
      setMessage(`${formatMoney(result.discountAmount)} discount saved for ${month} ${year}. The class fee was not changed.`);
    } catch { setError("Unable to connect to the server"); }
    finally { setBusy(false); }
  }

  return (
    <section className="mt-8 rounded-3xl bg-white p-5 shadow-sm sm:p-8">
      <div className="max-w-2xl">
        <p className="text-sm font-semibold uppercase tracking-wide text-violet-600">Student-specific adjustment</p>
        <h2 className="mt-2 text-2xl font-bold text-slate-900">Discount a student&apos;s fee</h2>
        <p className="mt-2 text-sm leading-6 text-slate-500">This applies only to the selected student and month. Other students in the class keep their normal fee.</p>
      </div>
      <form onSubmit={save} className="mt-7 grid gap-4 sm:grid-cols-2">
        <label className="text-sm font-semibold text-slate-700 sm:col-span-2">Student
          <select required value={studentId} onChange={(event) => setStudentId(event.target.value)} className="mt-2 w-full rounded-xl border border-slate-200 px-3 py-3">
            <option value="">Select a student</option>
            {students.map((student) => <option key={student._id} value={student._id}>{student.fullName} · {student.class}-{student.section} {student.studentId ? `· ${student.studentId}` : ""}</option>)}
          </select>
        </label>
        <label className="text-sm font-semibold text-slate-700">Month
          <select value={month} onChange={(event) => setMonth(event.target.value)} className="mt-2 w-full rounded-xl border border-slate-200 px-3 py-3">{months.map((item) => <option key={item}>{item}</option>)}</select>
        </label>
        <label className="text-sm font-semibold text-slate-700">Year
          <input type="number" min="2000" value={year} onChange={(event) => setYear(event.target.value)} className="mt-2 w-full rounded-xl border border-slate-200 px-3 py-3" />
        </label>
        <label className="text-sm font-semibold text-slate-700">Discount amount (Rs)
          <input required type="number" min="0" step="0.01" value={discount} onChange={(event) => setDiscount(event.target.value)} className="mt-2 w-full rounded-xl border border-slate-200 px-3 py-3" />
        </label>
        <label className="text-sm font-semibold text-slate-700">Reason (optional)
          <input value={reason} onChange={(event) => setReason(event.target.value)} placeholder="Scholarship, hardship..." className="mt-2 w-full rounded-xl border border-slate-200 px-3 py-3" />
        </label>
        <div className="sm:col-span-2 flex flex-wrap items-center gap-3">
          <button disabled={busy || !studentId} className="rounded-xl bg-violet-600 px-5 py-3 text-sm font-semibold text-white disabled:opacity-50">{busy ? "Saving..." : "Save discount"}</button>
          <p className="text-xs text-slate-500">Enter 0 to remove the discount for this month.</p>
        </div>
      </form>
      {error ? <p className="mt-4 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p> : null}
      {message ? <p className="mt-4 rounded-xl bg-emerald-50 px-4 py-3 text-sm text-emerald-700">{message}</p> : null}
    </section>
  );
}

// Orders "1, 2, ... 9, 10" instead of the plain string order "1, 10, 2".
function compareLabels(a: string, b: string) {
  const left = Number(a);
  const right = Number(b);
  if (Number.isFinite(left) && Number.isFinite(right)) return left - right;
  return a.localeCompare(b);
}

export default function FeesPage() {
  const searchParams = useSearchParams();
  const isDiscountTab = searchParams.get("tab") === "discounts";
  const now = new Date();
  const currentYear = String(now.getFullYear());
  const defaults: Filters = { search: "", className: "", section: "", month: months[now.getMonth()], year: currentYear, status: "all" };

  const [filters, setFilters] = useState<Filters>(defaults);
  const [rows, setRows] = useState<Row[]>([]);
  const [classSections, setClassSections] = useState<string[]>([]);
  const [summary, setSummary] = useState<Summary>(EMPTY_SUMMARY);
  const [monthlyFee, setMonthlyFee] = useState(0);
  const [schoolName, setSchoolName] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(true);
  const [bulkBusy, setBulkBusy] = useState(false);
  const [voucherBusy, setVoucherBusy] = useState(false);
  // Pre-typed WhatsApp texts waiting to be opened — filled by a bulk action,
  // cleared when the queue panel closes.
  const [queue, setQueue] = useState<{ title: string; messages: WhatsAppMessage[] } | null>(null);
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);
  const [total, setTotal] = useState(0);

  async function load(next: Filters = filters, targetPage = page) {
    setLoading(true);
    setError("");
    const params = new URLSearchParams({
      search: next.search,
      class: next.className,
      section: next.section,
      month: next.month,
      year: next.year,
      status: next.status,
      page: String(targetPage),
    });
    try {
      const response = await fetch(`/api/fees?${params.toString()}`);
      const result = await response.json();
      if (!response.ok) {
        setError(result.error ?? "Unable to load fees");
        return;
      }
      setRows(result.students ?? []);
      setClassSections(result.classSections ?? []);
      setSummary({ ...EMPTY_SUMMARY, ...(result.summary ?? {}) });
      setMonthlyFee(Number(result.monthlyFee ?? 0));
      setSchoolName(String(result.schoolName ?? ""));
      setPage(result.pagination?.page ?? 1);
      setPages(result.pagination?.pages ?? 1);
      setTotal(result.pagination?.total ?? 0);
    } catch {
      setError("Unable to connect to the server");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void load(); }, []);

  // Filter options are built from the whole school roster, so they always work.
  const classOptions = useMemo(
    () => Array.from(new Set(classSections.map((item) => item.split("-")[0]))).sort(compareLabels),
    [classSections],
  );
  const sectionOptions = useMemo(
    () =>
      Array.from(
        new Set(
          classSections
            .filter((item) => !filters.className || item.split("-")[0] === filters.className)
            .map((item) => item.split("-").slice(1).join("-")),
        ),
      ).sort(compareLabels),
    [classSections, filters.className],
  );

  function setFilter(key: keyof Filters, value: string) {
    setFilters((current) => (key === "className" ? { ...current, className: value, section: "" } : { ...current, [key]: value }));
  }

  async function apply(event: FormEvent) {
    event.preventDefault();
    setMessage("");
    await load(filters, 1);
  }

  async function reset() {
    setFilters(defaults);
    setMessage("");
    await load(defaults, 1);
  }

  /** The WhatsApp receipt details every action button on a row needs. */
  function receiptFor(row: Row) {
    return {
      schoolName,
      studentName: row.fullName,
      className: row.className,
      section: row.section,
      rollNumber: row.rollNumber,
      phone: row.voucherPhone,
      voucherNo: row.voucherNo,
    };
  }

  /**
   * Settles every student the current filters point at in one go. The filters —
   * not the rows on screen — are sent, so students further down the pages of the
   * same view are covered too.
   */
  async function markAllPaid() {
    const settled = summary.unpaid + summary.partial;
    if (settled <= 0) {
      setMessage(`Everything in this view is already paid for ${filters.month} ${filters.year}.`);
      return;
    }
    const confirmed = window.confirm(
      `Mark ${settled} student${settled === 1 ? "" : "s"} as fully paid for ${filters.month} ${filters.year}?\n\n` +
        `This covers the current filters${summary.total > settled ? ` — ${summary.total} students in scope` : ""}. ` +
        `A WhatsApp receipt is queued for every student marked — the send panel opens when this finishes.`,
    );
    if (!confirmed) return;

    setBulkBusy(true);
    setError("");
    setMessage("");
    try {
      const response = await fetch("/api/fees", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          month: filters.month,
          year: Number(filters.year) || now.getFullYear(),
          action: "paid-all",
          class: filters.className,
          section: filters.section,
          search: filters.search,
        }),
      });
      const result = await response.json();
      if (!response.ok) {
        setError(result.error ?? "Unable to mark fees paid");
        return;
      }
      const updated = Number(result.updated ?? 0);
      const skipped = Number(result.total ?? 0) - updated;
      const settledRows = (Array.isArray(result.settled) ? result.settled : []) as SettledStudent[];
      setMessage(
        `Marked ${updated} student${updated === 1 ? "" : "s"} paid for ${filters.month} ${filters.year}` +
          (skipped > 0 ? ` · ${skipped} already paid` : "") +
          ". Send each receipt from the WhatsApp panel.",
      );
      // Every student settled in this run gets a pre-typed receipt queued;
      // those without a number stay listed so the office knows who to chase.
      if (settledRows.length > 0) {
        setQueue({
          title: `Payment receipts — ${filters.month} ${filters.year}`,
          messages: settledRows.map((student) => ({
            name: student.fullName,
            phone: student.phone,
            message: buildReceiptMessage({
              schoolName,
              studentName: student.fullName,
              className: student.className,
              section: student.section,
              rollNumber: student.rollNumber,
              month: filters.month,
              year: filters.year,
              fee: student.amount,
              paid: student.amount,
            }),
          })),
        });
      }
      await load();
    } catch {
      setError("Unable to connect to the server");
    } finally {
      setBulkBusy(false);
    }
  }

  /**
   * Queues this month's voucher for every student in the current filters who
   * still owes something. `all=1` asks the API for the whole scope rather than
   * one page, so students below the fold are covered exactly as "Mark all paid"
   * covers them.
   */
  async function sendAllVouchers() {
    if (summary.unpaid + summary.partial <= 0) {
      setMessage(`Nothing outstanding for ${filters.month} ${filters.year} — no vouchers to send.`);
      return;
    }
    setVoucherBusy(true);
    setError("");
    setMessage("");
    try {
      const params = new URLSearchParams({
        search: filters.search,
        class: filters.className,
        section: filters.section,
        month: filters.month,
        year: filters.year,
        status: filters.status,
        all: "1",
      });
      const response = await fetch(`/api/fees?${params.toString()}`);
      const result = await response.json();
      if (!response.ok) {
        setError(result.error ?? "Unable to load students");
        return;
      }
      const students = (Array.isArray(result.students) ? result.students : []) as Row[];
      // Vouchers ask for what is owed, so a settled row never gets a "please pay".
      const targets = students.filter((row) => row.remaining > 0);
      if (targets.length === 0) {
        setMessage(`Nothing outstanding for ${filters.month} ${filters.year} — no vouchers to send.`);
        return;
      }
      setQueue({
        title: `Fee vouchers — ${filters.month} ${filters.year}`,
        messages: targets.map((row) => ({
          name: row.fullName,
          phone: row.voucherPhone,
          message: buildVoucherMessage({
            schoolName,
            studentName: row.fullName,
            className: row.className,
            section: row.section,
            rollNumber: row.rollNumber,
            voucherNo: row.voucherNo,
            month: filters.month,
            year: filters.year,
            amount: row.remaining,
            fee: row.amount,
            paid: row.paidAmount,
            issuedOn: new Date(),
          }),
        })),
      });
    } catch {
      setError("Unable to connect to the server");
    } finally {
      setVoucherBusy(false);
    }
  }

  function goToPage(next: number) {
    if (next === page) return;
    setLoading(true);
    void load(filters, next);
  }

  if (isDiscountTab) {
    return (
      <main className="app-page min-h-screen bg-slate-100 px-4 py-6 text-slate-900 sm:px-6 lg:px-10 lg:py-8">
        <div className="mx-auto max-w-7xl">
          <BackLink />
          <DiscountWorkspace />
        </div>
      </main>
    );
  }

  return (
    <main className="app-page bg-slate-100 px-4 py-6 text-slate-900 sm:px-6 lg:px-10 lg:py-8">
      <div className="mx-auto max-w-7xl">
        <BackLink />
        <h1 className="mt-6 text-2xl sm:text-3xl font-bold">Fee management</h1>
        <p className="mt-2 text-slate-500">
          Every student in the school is listed with the fee status for the selected month. Search or filter by class,
          section, and fee status, then mark a student paid or unpaid.
        </p>

        <form onSubmit={apply} className="mt-8 grid gap-4 rounded-2xl bg-white p-5 shadow-sm sm:grid-cols-2 lg:grid-cols-4">
          <label className="text-sm font-medium lg:col-span-2">
            Search student
            <input
              value={filters.search}
              onChange={(event) => setFilter("search", event.target.value)}
              placeholder="Name, student ID, CNIC, or roll number"
              className="mt-2 w-full rounded-xl border border-slate-200 px-3 py-2.5"
            />
          </label>
          <label className="text-sm font-medium">
            Class
            <select
              value={filters.className}
              onChange={(event) => setFilter("className", event.target.value)}
              className="mt-2 w-full rounded-xl border border-slate-200 px-3 py-2.5"
            >
              <option value="">All classes</option>
              {classOptions.map((item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
            </select>
          </label>
          <label className="text-sm font-medium">
            Section
            <select
              value={filters.section}
              onChange={(event) => setFilter("section", event.target.value)}
              className="mt-2 w-full rounded-xl border border-slate-200 px-3 py-2.5"
            >
              <option value="">All sections</option>
              {sectionOptions.map((item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
            </select>
          </label>
          <label className="text-sm font-medium">
            Month
            <select
              value={filters.month}
              onChange={(event) => setFilter("month", event.target.value)}
              className="mt-2 w-full rounded-xl border border-slate-200 px-3 py-2.5"
            >
              {months.map((item) => (
                <option key={item}>{item}</option>
              ))}
            </select>
          </label>
          <label className="text-sm font-medium">
            Year
            <input
              type="number"
              value={filters.year}
              onChange={(event) => setFilter("year", event.target.value)}
              className="mt-2 w-full rounded-xl border border-slate-200 px-3 py-2.5"
            />
          </label>
          <label className="text-sm font-medium">
            Fee status
            <select
              value={filters.status}
              onChange={(event) => setFilter("status", event.target.value)}
              className="mt-2 w-full rounded-xl border border-slate-200 px-3 py-2.5"
            >
              <option value="all">All students</option>
              <option value="paid">Paid only</option>
              <option value="partial">Partly paid only</option>
              <option value="unpaid">Unpaid only</option>
            </select>
          </label>
          <div className="flex items-end gap-2">
            <button
              disabled={loading}
              className="min-w-0 flex-1 whitespace-nowrap rounded-xl bg-blue-600 px-3 py-3 text-xs font-semibold text-white disabled:opacity-60"
            >
              {loading ? "Loading..." : "Apply filters"}
            </button>
            <button
              type="button"
              onClick={() => void reset()}
              className="shrink-0 whitespace-nowrap rounded-xl border border-slate-200 px-3 py-3 text-xs font-semibold text-slate-600"
            >
              Reset
            </button>
          </div>
        </form>

        {error && <p className="mt-5 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>}
        {message && <p className="mt-5 rounded-xl bg-emerald-50 px-4 py-3 text-sm text-emerald-700">{message}</p>}

        {/* Counts answer "who has paid"; the money row underneath answers
            "how much was billed, received and still owed" for the current
            filters — Total fees = Collected + Outstanding. */}
        <div className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-4">
          <div className="rounded-2xl bg-white p-4 shadow-sm sm:p-5">
            <p className="text-sm text-slate-500">Students in list</p>
            <p className="mt-2 text-xl font-bold sm:text-2xl">{summary.total}</p>
            <p className="mt-1 text-xs text-slate-400">{summary.shown} match these filters</p>
          </div>
          <div className="rounded-2xl bg-white p-4 shadow-sm sm:p-5">
            <p className="text-sm text-slate-500">Paid</p>
            <p className="mt-2 text-xl font-bold text-emerald-600 sm:text-2xl">{summary.paid}</p>
            <p className="mt-1 text-xs text-slate-400">Fully settled</p>
          </div>
          <div className="rounded-2xl bg-white p-4 shadow-sm sm:p-5">
            <p className="text-sm text-slate-500">Partly paid</p>
            <p className="mt-2 text-xl font-bold text-blue-600 sm:text-2xl">{summary.partial}</p>
            <p className="mt-1 text-xs text-slate-400">Balance still due</p>
          </div>
          <div className="rounded-2xl bg-white p-4 shadow-sm sm:p-5">
            <p className="text-sm text-slate-500">Unpaid</p>
            <p className="mt-2 text-xl font-bold text-amber-600 sm:text-2xl">{summary.unpaid}</p>
            <p className="mt-1 text-xs text-slate-400">Nothing received</p>
          </div>
        </div>
        <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div className="rounded-2xl bg-white p-4 shadow-sm sm:p-5">
            <p className="text-sm text-slate-500">Total fees</p>
            <p className="mt-2 text-xl font-bold sm:text-2xl">{formatMoney(summary.collected + summary.outstanding)}</p>
            <p className="mt-1 text-xs text-slate-400">
              Billed for {filters.month} · {summary.total} students
            </p>
          </div>
          <div className="rounded-2xl bg-white p-4 shadow-sm sm:p-5">
            <p className="text-sm text-slate-500">Collected</p>
            <p className="mt-2 text-xl font-bold text-emerald-600 sm:text-2xl">{formatMoney(summary.collected)}</p>
            <p className="mt-1 text-xs text-slate-400">Received for {filters.month}</p>
          </div>
          <div className="rounded-2xl bg-white p-4 shadow-sm sm:p-5">
            <p className="text-sm text-slate-500">Unpaid</p>
            <p className="mt-2 text-xl font-bold text-rose-600 sm:text-2xl">{formatMoney(summary.outstanding)}</p>
            <p className="mt-1 text-xs text-slate-400">Monthly fee from {formatMoney(monthlyFee)}</p>
          </div>
        </div>

        <section className="mt-6 overflow-hidden rounded-2xl bg-white shadow-sm">
          <div className="flex flex-col justify-between gap-3 border-b border-slate-100 px-4 py-4 sm:flex-row sm:items-center sm:px-6 sm:py-5">
            <div>
              <h2 className="font-semibold">
                Fees for {filters.month} {filters.year}
              </h2>
              <p className="mt-1 text-sm text-slate-500">
                A student with no saved record for this month is shown as unpaid. Open a name to see the full 12 month
                history.
              </p>
            </div>
            <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:items-center sm:gap-3">
              <p className="text-sm text-slate-500">
                {summary.shown} of {summary.total} students shown{total > 0 ? ` · page ${page} of ${pages}` : ""}
              </p>
              {/* Stacked full-width on phones, side by side from sm up. */}
              <div className="flex flex-col gap-2 sm:flex-row">
                <button
                  type="button"
                  onClick={() => void markAllPaid()}
                  disabled={bulkBusy || loading}
                  title="Settle every student the current filters point at"
                  className="w-full whitespace-nowrap rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-emerald-500 disabled:opacity-50 sm:w-auto"
                >
                  {bulkBusy ? "Marking…" : "Mark all paid"}
                </button>
                <button
                  type="button"
                  onClick={() => void sendAllVouchers()}
                  disabled={voucherBusy || loading}
                  title="Queue this month's voucher for every student who still owes"
                  className="w-full whitespace-nowrap rounded-xl border border-emerald-600 px-4 py-2.5 text-sm font-semibold text-emerald-700 hover:bg-emerald-50 disabled:opacity-50 sm:w-auto"
                >
                  {voucherBusy ? "Loading…" : "Send all vouchers"}
                </button>
              </div>
            </div>
          </div>
          {loading ? (
            <SkeletonRows rows={6} className="px-6 py-6" />
          ) : rows.length === 0 ? (
            <div className="px-4 py-16 sm:px-6 sm:py-20 text-center text-sm text-slate-400">No students match the selected filters.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="stack-table w-full text-left text-sm md:min-w-[900px]">
                <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="px-4 py-3 sm:px-6 sm:py-4">Student</th>
                    <th className="px-4 py-3 sm:px-6 sm:py-4">Student ID</th>
                    <th className="px-4 py-3 sm:px-6 sm:py-4">Class</th>
                    <th className="px-4 py-3 sm:px-6 sm:py-4">Roll</th>
                    <th className="px-4 py-3 sm:px-6 sm:py-4">Voucher No</th>
                    <th className="px-4 py-3 sm:px-6 sm:py-4">Amount</th>
                    <th className="px-4 py-3 sm:px-6 sm:py-4">Status</th>
                    <th className="px-4 py-3 sm:px-6 sm:py-4 text-right">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => (
                    <tr key={row.id}>
                      <td data-full className="px-4 py-3 sm:px-6 sm:py-4">
                        <Link
                          href={`/dashboard/students/${row.id}`}
                          className="font-semibold text-blue-700 hover:underline"
                        >
                          {row.fullName}
                        </Link>
                        <p className="mt-1 text-xs text-slate-400">
                          {row.accountStatus === "pending" ? "Pending approval" : row.cnic || "-"}
                        </p>
                      </td>
                      <td data-label="Student ID" className="px-4 py-3 sm:px-6 sm:py-4 text-slate-600">{row.studentId || "-"}</td>
                      <td data-label="Class" className="px-4 py-3 sm:px-6 sm:py-4 text-slate-600">
                        {row.className}-{row.section}
                      </td>
                      <td data-label="Roll" className="px-4 py-3 sm:px-6 sm:py-4 text-slate-600">{row.rollNumber || "-"}</td>
                      <td data-label="Voucher" className="px-4 py-3 sm:px-6 sm:py-4">
                        <span className="whitespace-nowrap rounded-lg bg-slate-100 px-2 py-1 text-xs font-semibold text-slate-600">
                          {row.voucherNo || "-"}
                        </span>
                      </td>
                      {/* Due, received and balance in one block — the numbers the
                          custom payment box and the student portal both quote. */}
                      <td data-label="Fee" data-full className="px-4 py-3 sm:px-6 sm:py-4">
                        <MoneyBreakdown row={row} />
                      </td>
                      <td data-label="Status" data-full className="px-4 py-3 sm:px-6 sm:py-4">
                        <StatusBadge status={row.status} amount={row.amount} />
                      </td>
                      <td data-label="Action" data-full className="px-4 py-3 sm:px-6 sm:py-4">
                        {/* One wrap row: only the moves that apply to this row, plus
                            the voucher icon while money is still owed — left-aligned
                            on the stacked mobile cards, right-aligned on the table. */}
                        <FeeActions
                          studentId={row.id}
                          month={filters.month}
                          year={Number(filters.year) || now.getFullYear()}
                          status={row.status}
                          amount={row.amount}
                          paidAmount={row.paidAmount}
                          receipt={receiptFor(row)}
                          onUpdated={async (update) => {
                            setMessage(
                              update.status === "paid"
                                ? `${row.fullName} marked paid for ${filters.month} ${filters.year}.`
                                : update.status === "partial"
                                  ? `${formatMoney(update.received)} received from ${row.fullName} — ${formatMoney(update.remaining)} still due for ${filters.month} ${filters.year}.`
                                  : `Payment reversed for ${row.fullName} — ${filters.month} ${filters.year} is unpaid again.`,
                            );
                            await load();
                          }}
                          extra={
                            // The voucher quotes the balance after a part-payment;
                            // a settled row never gets a "please pay" icon.
                            row.remaining > 0 ? (
                              <VoucherSendButton
                                schoolName={schoolName}
                                studentName={row.fullName}
                                className={row.className}
                                section={row.section}
                                rollNumber={row.rollNumber}
                                voucherNo={row.voucherNo}
                                phone={row.voucherPhone}
                                month={filters.month}
                                year={filters.year}
                                amount={row.remaining}
                                fee={row.amount}
                                paid={row.paidAmount}
                              />
                            ) : null
                          }
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {!loading && total > 0 && (
            <div className="border-t border-slate-100 px-6 py-4">
              <Pagination page={page} pages={pages} onPageChange={goToPage} />
            </div>
          )}
        </section>
      </div>
      {queue ? (
        <WhatsAppBulkSend title={queue.title} messages={queue.messages} onClose={() => setQueue(null)} />
      ) : null}
    </main>
  );
}
