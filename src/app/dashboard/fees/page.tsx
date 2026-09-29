"use client";

/* eslint-disable react-hooks/set-state-in-effect, react-hooks/exhaustive-deps */

import Link from "next/link";
import { FormEvent, useEffect, useMemo, useState } from "react";
import FeeActions from "@/components/FeeActions";
import { SkeletonRows } from "@/components/Loaders";
import Pagination from "@/components/Pagination";

type Row = {
  id: string;
  fullName: string;
  studentId: string;
  cnic: string;
  className: string;
  section: string;
  rollNumber: string;
  accountStatus: string;
  amount: number;
  status: "paid" | "unpaid";
  paidDate: string | null;
};

type Summary = { total: number; paid: number; unpaid: number; shown: number };
type Filters = { search: string; className: string; section: string; month: string; year: string; status: string };

const months = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

// Orders "1, 2, ... 9, 10" instead of the plain string order "1, 10, 2".
function compareLabels(a: string, b: string) {
  const left = Number(a);
  const right = Number(b);
  if (Number.isFinite(left) && Number.isFinite(right)) return left - right;
  return a.localeCompare(b);
}

export default function FeesPage() {
  const now = new Date();
  const currentYear = String(now.getFullYear());
  const defaults: Filters = { search: "", className: "", section: "", month: months[now.getMonth()], year: currentYear, status: "all" };

  const [filters, setFilters] = useState<Filters>(defaults);
  const [rows, setRows] = useState<Row[]>([]);
  const [classSections, setClassSections] = useState<string[]>([]);
  const [summary, setSummary] = useState<Summary>({ total: 0, paid: 0, unpaid: 0, shown: 0 });
  const [monthlyFee, setMonthlyFee] = useState(0);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(true);
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
      setSummary(result.summary ?? { total: 0, paid: 0, unpaid: 0, shown: 0 });
      setMonthlyFee(Number(result.monthlyFee ?? 0));
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

  function goToPage(next: number) {
    if (next === page) return;
    setLoading(true);
    void load(filters, next);
  }

  return (
    <main className="min-h-screen bg-slate-100 px-6 py-8 text-slate-900 sm:px-10">
      <div className="mx-auto max-w-7xl">
        <Link href="/dashboard" className="text-sm font-medium text-blue-600">
          ← Dashboard
        </Link>
        <h1 className="mt-6 text-3xl font-bold">Fee management</h1>
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
              <option value="unpaid">Unpaid only</option>
            </select>
          </label>
          <div className="flex items-end gap-2">
            <button
              disabled={loading}
              className="w-full rounded-xl bg-blue-600 px-4 py-3 text-sm font-semibold text-white disabled:opacity-60"
            >
              {loading ? "Loading..." : "Apply filters"}
            </button>
            <button
              type="button"
              onClick={() => void reset()}
              className="rounded-xl border border-slate-200 px-4 py-3 text-sm font-semibold text-slate-600"
            >
              Reset
            </button>
          </div>
        </form>

        {error && <p className="mt-5 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>}
        {message && <p className="mt-5 rounded-xl bg-emerald-50 px-4 py-3 text-sm text-emerald-700">{message}</p>}

        <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div className="rounded-2xl bg-white p-5 shadow-sm">
            <p className="text-sm text-slate-500">Students in list</p>
            <p className="mt-2 text-3xl font-bold">{summary.total}</p>
          </div>
          <div className="rounded-2xl bg-white p-5 shadow-sm">
            <p className="text-sm text-slate-500">Paid</p>
            <p className="mt-2 text-3xl font-bold text-emerald-600">{summary.paid}</p>
          </div>
          <div className="rounded-2xl bg-white p-5 shadow-sm">
            <p className="text-sm text-slate-500">Unpaid</p>
            <p className="mt-2 text-3xl font-bold text-red-600">{summary.unpaid}</p>
          </div>
          <div className="rounded-2xl bg-white p-5 shadow-sm">
            <p className="text-sm text-slate-500">Monthly fee</p>
            <p className="mt-2 text-3xl font-bold">{monthlyFee}</p>
          </div>
        </div>

        <section className="mt-6 overflow-hidden rounded-2xl bg-white shadow-sm">
          <div className="flex flex-col justify-between gap-2 border-b border-slate-100 px-6 py-4 sm:flex-row sm:items-center">
            <div>
              <h2 className="font-semibold">
                Fees for {filters.month} {filters.year}
              </h2>
              <p className="mt-1 text-sm text-slate-500">
                A student with no saved record for this month is shown as unpaid. Open a name to see the full 12 month
                history.
              </p>
            </div>
            <p className="text-sm text-slate-500">
              {summary.shown} of {summary.total} students shown{total > 0 ? ` · page ${page} of ${pages}` : ""}
            </p>
          </div>
          {loading ? (
            <SkeletonRows rows={6} className="px-6 py-6" />
          ) : rows.length === 0 ? (
            <div className="px-6 py-20 text-center text-sm text-slate-400">No students match the selected filters.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[900px] text-left text-sm">
                <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="px-6 py-4">Student</th>
                    <th className="px-6 py-4">Student ID</th>
                    <th className="px-6 py-4">Class</th>
                    <th className="px-6 py-4">Roll</th>
                    <th className="px-6 py-4">Amount</th>
                    <th className="px-6 py-4">Status</th>
                    <th className="px-6 py-4 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {rows.map((row) => (
                    <tr key={row.id}>
                      <td className="px-6 py-4">
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
                      <td className="px-6 py-4 text-slate-600">{row.studentId || "-"}</td>
                      <td className="px-6 py-4 text-slate-600">
                        {row.className}-{row.section}
                      </td>
                      <td className="px-6 py-4 text-slate-600">{row.rollNumber || "-"}</td>
                      <td className="px-6 py-4 text-slate-600">{row.amount}</td>
                      <td className="px-6 py-4">
                        <span
                          className={
                            row.status === "paid"
                              ? "rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700"
                              : "rounded-full bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-700"
                          }
                        >
                          {row.status === "paid" ? "Paid" : "Unpaid"}
                        </span>
                        {row.paidDate ? (
                          <p className="mt-1 text-xs text-slate-400">
                            Paid on {new Date(row.paidDate).toLocaleDateString()}
                          </p>
                        ) : null}
                      </td>
                      <td className="px-6 py-4">
                        <FeeActions
                          studentId={row.id}
                          month={filters.month}
                          year={Number(filters.year) || now.getFullYear()}
                          status={row.status}
                          onUpdated={async () => {
                            setMessage(`${row.fullName} marked ${row.status === "paid" ? "unpaid" : "paid"} for ${filters.month} ${filters.year}.`);
                            await load();
                          }}
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
    </main>
  );
}
