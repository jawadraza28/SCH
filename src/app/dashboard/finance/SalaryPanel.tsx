"use client";

/* eslint-disable react-hooks/set-state-in-effect */

/**
 * SalaryPanel — who has been paid, month by month.
 *
 * Every teacher appears with a default UNPAID status whether or not a record
 * exists yet, so the tab always shows the whole staff. Marking one paid writes
 * the matching expense on the server; marking it unpaid removes it again.
 *
 * Only the last twelve months are offered, which is exactly the window the
 * one-year retention keeps — older months are deleted from the database.
 */

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { formatCount, formatMoney } from "@/components/charts/palette";
import { MoneyTile } from "./LedgerPanel";

type SalaryMonth = { month: string; year: number; key: string };

type SalaryRow = {
  teacherId: string;
  name: string;
  subject: string;
  salary: number;
  status: "paid" | "unpaid";
  paidDate: string | null;
  recordId: string | null;
};

type SalaryPayload = {
  month: string;
  year: number;
  months: SalaryMonth[];
  rows: SalaryRow[];
  summary: { paid: number; unpaid: number; teachers: number };
  history: Array<{ month: string; year: number; key: string; value: string; paid: number; unpaid: number }>;
};

export default function SalaryPanel() {
  const [data, setData] = useState<SalaryPayload | null>(null);
  const [month, setMonth] = useState("");
  const [year, setYear] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState("");
  const [message, setMessage] = useState("");

  const load = useCallback(async (target?: { month: string; year: number }) => {
    setLoading(true);
    setError("");
    try {
      const query = new URLSearchParams();
      if (target) {
        query.set("month", target.month);
        query.set("year", String(target.year));
      }
      const response = await fetch(`/api/salaries?${query.toString()}`);
      const result = await response.json();
      if (!response.ok) {
        setError(result.error ?? "Unable to load salaries");
        return;
      }
      setData(result);
      setMonth(result.month);
      setYear(result.year);
    } catch {
      setError("Unable to connect to the server");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function toggle(row: SalaryRow, status: "paid" | "unpaid") {
    setBusy(row.teacherId);
    setMessage("");
    try {
      const response = await fetch("/api/salaries", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ teacherId: row.teacherId, month, year, status }),
      });
      const result = await response.json();
      if (!response.ok) {
        setError(result.error ?? "Unable to update the salary");
        return;
      }
      setMessage(
        status === "paid"
          ? `${row.name}'s salary for ${month} ${year} marked paid and added to expenses.`
          : `${row.name}'s salary marked unpaid and removed from expenses.`,
      );
      await load({ month, year });
    } catch {
      setError("Unable to connect to the server");
    } finally {
      setBusy("");
    }
  }

  const field = "mt-1 block rounded-xl border border-slate-200 bg-white px-3 py-2.5";
  const rows = data?.rows ?? [];
  const summary = data?.summary;
return (
    <div className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <MoneyTile label="Teachers" value={formatCount(summary?.teachers ?? 0)} hint={month ? `${month} ${year}` : "Loading…"} tone="bg-blue-500" />
        <MoneyTile label="Salaries paid" value={formatMoney(summary?.paid ?? 0)} hint="Recorded as expenses" tone="bg-emerald-500" />
        <MoneyTile label="Still unpaid" value={formatMoney(summary?.unpaid ?? 0)} hint="Not yet in the expense tab" tone="bg-amber-500" />
        <MoneyTile label="Monthly payroll" value={formatMoney((summary?.paid ?? 0) + (summary?.unpaid ?? 0))} hint="Total for the month" tone="bg-violet-500" />
      </div>

      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-100 p-5 sm:p-6">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <h2 className="font-semibold text-slate-900">Teacher salaries</h2>
              <p className="mt-1 text-sm text-slate-500">
                Marking a salary paid adds it to the expense tab automatically. Only the last year is kept.
              </p>
            </div>
            <label className="text-sm font-medium text-slate-600">
              Month
              <select
                value={month ? `${month}-${year}` : ""}
                onChange={(event) => {
                  const [nextMonth, nextYear] = event.target.value.split("-");
                  setMessage("");
                  void load({ month: nextMonth, year: Number(nextYear) });
                }}
                className={field}
              >
                {(data?.months ?? []).map((item) => (
                  <option key={item.key} value={item.key}>{item.key}</option>
                ))}
              </select>
            </label>
          </div>
          {message ? <p className="mt-4 rounded-xl bg-emerald-50 px-4 py-3 text-sm text-emerald-700">{message}</p> : null}
          {error ? <p className="mt-4 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p> : null}
        </div>

        <div className="overflow-x-auto">
          {loading ? (
            <p className="px-6 py-10 text-center text-sm text-slate-400">Loading salaries…</p>
          ) : rows.length ? (
            <table className="w-full min-w-[640px] text-left text-sm">
              <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-6 py-3 font-semibold">Teacher</th>
                  <th className="px-6 py-3 font-semibold">Subject</th>
                  <th className="px-6 py-3 text-right font-semibold">Salary</th>
                  <th className="px-6 py-3 font-semibold">Paid on</th>
                  <th className="px-6 py-3 font-semibold">Status</th>
                  <th className="px-6 py-3 text-right font-semibold">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {rows.map((row) => (
                  <tr key={row.teacherId}>
                    <td className="px-6 py-3 font-semibold text-slate-900">{row.name}</td>
                    <td className="px-6 py-3 text-slate-600">{row.subject || "-"}</td>
                    <td className="px-6 py-3 text-right font-semibold tabular-nums text-slate-900">{formatMoney(row.salary)}</td>
                    <td className="px-6 py-3 text-slate-600">{row.paidDate ? new Date(row.paidDate).toLocaleDateString() : "-"}</td>
                    <td className="px-6 py-3">
                      <span
                        className={`whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-semibold ${
                          row.status === "paid" ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"
                        }`}
                      >
                        {row.status === "paid" ? "Paid" : "Unpaid"}
                      </span>
                    </td>
                    <td className="px-6 py-3">
                      <div className="flex justify-end gap-2">
                        <button
                          type="button"
                          disabled={busy === row.teacherId || row.status === "paid"}
                          onClick={() => void toggle(row, "paid")}
                          className="whitespace-nowrap rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-40"
                        >
                          Mark paid
                        </button>
                        <button
                          type="button"
                          disabled={busy === row.teacherId || row.status === "unpaid"}
                          onClick={() => void toggle(row, "unpaid")}
                          className="whitespace-nowrap rounded-lg bg-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-700 disabled:opacity-40"
                        >
                          Mark unpaid
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p className="px-6 py-10 text-center text-sm text-slate-400">No teachers found. Add a teacher to start tracking salaries.</p>
          )}
        </div>
      </section>

      {/* Month-wise payroll across the retained year, so a bad month is obvious
          at a glance and each row links straight to that month's expenses. */}
      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-100 p-5 sm:p-6">
          <h2 className="font-semibold text-slate-900">Payroll by month</h2>
          <p className="mt-1 text-sm text-slate-500">
            Paid and unpaid salary totals for each month kept. Choosing a month above loads its teachers.
          </p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[560px] text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-6 py-3 font-semibold">Month</th>
                <th className="px-6 py-3 text-right font-semibold">Paid</th>
                <th className="px-6 py-3 text-right font-semibold">Unpaid</th>
                <th className="px-6 py-3 text-right font-semibold">Total</th>
                <th className="px-6 py-3 text-right font-semibold">Expenses</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {(data?.history ?? []).map((item) => {
                const isCurrent = item.month === month && item.year === year;
                return (
                  <tr key={item.key} className={isCurrent ? "bg-blue-50/50" : undefined}>
                    <td className="px-6 py-3">
                      <span className="font-semibold text-slate-900">{item.key}</span>
                      {isCurrent ? (
                        <span className="ml-2 rounded-full bg-blue-100 px-2 py-0.5 text-xs font-semibold text-blue-700">Showing</span>
                      ) : null}
                    </td>
                    <td className="px-6 py-3 text-right font-semibold tabular-nums text-emerald-600">{formatMoney(item.paid)}</td>
                    <td className="px-6 py-3 text-right font-semibold tabular-nums text-amber-600">{formatMoney(item.unpaid)}</td>
                    <td className="px-6 py-3 text-right font-semibold tabular-nums text-slate-900">{formatMoney(item.paid + item.unpaid)}</td>
                    <td className="px-6 py-3 text-right">
                      <Link
                        href={`/dashboard/finance?tab=expenses&month=${item.value}`}
                        className="whitespace-nowrap text-sm font-semibold text-blue-600 hover:underline"
                      >
                        View →
                      </Link>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}