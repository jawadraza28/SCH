"use client";

/**
 * LedgerPanel — the shared body of the Income and Expenses tabs.
 *
 * One component serves both directions so the filters, the table and the add
 * form can never drift apart; only the type and the category list differ.
 */

import { useState } from "react";
import Pagination from "@/components/Pagination";
import { formatCount, formatMoney } from "@/components/charts/palette";
import type { FinancePayload } from "./FinanceWorkspace";

export type LedgerFilters = { search: string; category: string; classSection: string; from: string; to: string; source: string };

/** One small money tile in the strip above the table. */
export function MoneyTile({ label, value, hint, tone }: { label: string; value: number | string; hint: string; tone: string }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex items-center gap-3">
        <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${tone}`} aria-hidden="true" />
        <p className="text-sm text-slate-500">{label}</p>
      </div>
      <p className="mt-3 text-2xl font-bold tabular-nums text-slate-900 sm:text-3xl">{value}</p>
      <p className="mt-1 text-xs text-slate-400">{hint}</p>
    </div>
  );
}

/** Marks a row as written by the fees/salary flow or typed in by hand. */
export function SourcePill({ source }: { source: "auto" | "manual" }) {
  return source === "auto" ? (
    <span className="inline-block whitespace-nowrap rounded-full bg-blue-50 px-2.5 py-1 text-xs font-semibold text-blue-700">Automatic</span>
  ) : (
    <span className="inline-block whitespace-nowrap rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-600">Manual</span>
  );
}

export default function LedgerPanel({
  type,
  filters,
  updateFilter,
  clearFilters,
  categoryOptions,
  data,
  loading,
  error,
  message,
  setMessage,
  onChanged,
  onPage,
}: {
  type: "income" | "expenses";
  filters: LedgerFilters;
  updateFilter: (key: keyof LedgerFilters, value: string) => void;
  clearFilters: () => void;
  categoryOptions: readonly string[];
  data: FinancePayload;
  loading: boolean;
  error: string;
  message: string;
  setMessage: (value: string) => void;
  onChanged: () => void;
  onPage: (page: number) => void;
}) {
  const entryType = type === "income" ? "income" : "expense";
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState("");
  const [form, setForm] = useState({
    category: categoryOptions[0] ?? "",
    title: "",
    amount: "",
    date: new Date().toISOString().slice(0, 10),
    classSection: "",
    note: "",
  });

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setSaving(true);
    setFormError("");
    try {
      const response = await fetch("/api/finance", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, type: entryType, amount: Number(form.amount) }),
      });
      const result = await response.json();
      if (!response.ok) {
        setMessage("");
        setFormError(result.error ?? "Unable to add the record");
        return;
      }
      setForm((current) => ({ ...current, title: "", amount: "", note: "" }));
      setMessage(`Added ${type} of ${formatMoney(Number(form.amount))}.`);
      setOpen(false);
      onChanged();
    } catch {
      setFormError("Unable to connect to the server");
    } finally {
      setSaving(false);
    }
  }
const rows = data.entries;
  const hasFilters = Object.values(filters).some(Boolean);
  const field = "mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5";

  return (
    <div className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <MoneyTile label="Total income" value={formatMoney(data.summary.income)} hint={`${formatCount(data.summary.incomeCount)} records`} tone="bg-emerald-500" />
        <MoneyTile label="Total expenses" value={formatMoney(data.summary.expense)} hint={`${formatCount(data.summary.expenseCount)} records`} tone="bg-rose-500" />
        <MoneyTile
          label="Balance"
          value={formatMoney(data.summary.balance)}
          hint={data.summary.balance >= 0 ? "Surplus for this selection" : "Deficit for this selection"}
          tone={data.summary.balance >= 0 ? "bg-blue-500" : "bg-amber-500"}
        />
        <MoneyTile label="Matching records" value={formatCount(data.pagination.total)} hint="Rows in the current filter" tone="bg-violet-500" />
      </div>

      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-100 p-5 sm:p-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="font-semibold text-slate-900">{type === "income" ? "Income records" : "Expense records"}</h2>
              <p className="mt-1 text-sm text-slate-500">
                Every {type === "income" ? "payment received" : "payment made"}, including the rows created automatically from fees and salaries.
              </p>
            </div>
            <button type="button" onClick={() => setOpen((value) => !value)} className="rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-500">
              {open ? "Close" : `+ Add ${type}`}
            </button>
          </div>

          {open ? (
            <form onSubmit={submit} className="mt-5 grid gap-4 rounded-xl bg-slate-50 p-4 sm:grid-cols-2 lg:grid-cols-3">
              <label className="text-sm font-medium text-slate-600">
                Category
                <select value={form.category} onChange={(event) => setForm((c) => ({ ...c, category: event.target.value }))} className={`${field} bg-white`}>
                  {categoryOptions.map((option) => <option key={option} value={option}>{option}</option>)}
                </select>
              </label>
              <label className="text-sm font-medium text-slate-600">
                Amount
                <input required min="1" step="1" type="number" value={form.amount} onChange={(event) => setForm((c) => ({ ...c, amount: event.target.value }))} className={field} />
              </label>
              <label className="text-sm font-medium text-slate-600">
                Date
                <input required type="date" value={form.date} onChange={(event) => setForm((c) => ({ ...c, date: event.target.value }))} className={field} />
              </label>
              <label className="text-sm font-medium text-slate-600">
                Description
                <input required value={form.title} onChange={(event) => setForm((c) => ({ ...c, title: event.target.value }))} placeholder={type === "income" ? "Donation from a parent" : "Electricity bill"} className={field} />
              </label>
              <label className="text-sm font-medium text-slate-600">
                Class (optional)
                <select value={form.classSection} onChange={(event) => setForm((c) => ({ ...c, classSection: event.target.value }))} className={`${field} bg-white`}>
                  <option value="">Not class specific</option>
                  {data.classSections.map((item) => <option key={item} value={item}>{item}</option>)}
                </select>
              </label>
              <label className="text-sm font-medium text-slate-600">
                Note (optional)
                <input value={form.note} onChange={(event) => setForm((c) => ({ ...c, note: event.target.value }))} className={field} />
              </label>
              <div className="sm:col-span-2 lg:col-span-3">
                {formError ? <p className="mb-3 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">{formError}</p> : null}
                <button disabled={saving} className="rounded-xl bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-60">
                  {saving ? "Saving..." : `Save ${type}`}
                </button>
              </div>
            </form>
          ) : null}
<div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <label className="text-sm font-medium text-slate-600">
              Search
              <input value={filters.search} onChange={(event) => updateFilter("search", event.target.value)} placeholder="Description" className={field} />
            </label>
            <label className="text-sm font-medium text-slate-600">
              Category
              <select value={filters.category} onChange={(event) => updateFilter("category", event.target.value)} className={`${field} bg-white`}>
                <option value="">All categories</option>
                {categoryOptions.map((option) => <option key={option} value={option}>{option}</option>)}
              </select>
            </label>
            <label className="text-sm font-medium text-slate-600">
              Class
              <select value={filters.classSection} onChange={(event) => updateFilter("classSection", event.target.value)} className={`${field} bg-white`}>
                <option value="">All classes</option>
                {data.classSections.map((item) => <option key={item} value={item}>{item}</option>)}
              </select>
            </label>
            <label className="text-sm font-medium text-slate-600">
              From
              <input type="date" value={filters.from} onChange={(event) => updateFilter("from", event.target.value)} className={field} />
            </label>
            <label className="text-sm font-medium text-slate-600">
              To
              <input type="date" value={filters.to} onChange={(event) => updateFilter("to", event.target.value)} className={field} />
            </label>
            <label className="text-sm font-medium text-slate-600">
              Source
              <select value={filters.source} onChange={(event) => updateFilter("source", event.target.value)} className={`${field} bg-white`}>
                <option value="">All sources</option>
                <option value="auto">Automatic (fees / salaries)</option>
                <option value="manual">Manual</option>
              </select>
            </label>
          </div>

          {hasFilters ? (
            <button type="button" onClick={clearFilters} className="mt-4 text-sm font-semibold text-blue-600 hover:underline">
              Clear all filters
            </button>
          ) : null}

          {message ? <p className="mt-4 rounded-xl bg-emerald-50 px-4 py-3 text-sm text-emerald-700">{message}</p> : null}
          {error ? <p className="mt-4 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p> : null}
        </div>

        <div className="overflow-x-auto">
          {loading ? (
            <p className="px-6 py-10 text-center text-sm text-slate-400">Loading records…</p>
          ) : rows.length ? (
            <table className="w-full min-w-[760px] text-left text-sm">
              <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-6 py-3 font-semibold">Date</th>
                  <th className="px-6 py-3 font-semibold">Description</th>
                  <th className="px-6 py-3 font-semibold">Category</th>
                  <th className="px-6 py-3 font-semibold">Class</th>
                  <th className="px-6 py-3 font-semibold">Source</th>
                  <th className="px-6 py-3 text-right font-semibold">Amount</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {rows.map((entry) => (
                  <tr key={entry._id}>
                    <td className="whitespace-nowrap px-6 py-3 text-slate-600">{new Date(entry.date).toLocaleDateString()}</td>
                    <td className="px-6 py-3">
                      <p className="font-semibold text-slate-900">{entry.title}</p>
                      {entry.note ? <p className="mt-0.5 text-xs text-slate-400">{entry.note}</p> : null}
                      {entry.student ? (
                        <p className="mt-0.5 text-xs text-slate-400">
                          {entry.student.fullName} · Roll {entry.student.rollNumber || "-"}
                        </p>
                      ) : null}
                      {entry.teacher ? <p className="mt-0.5 text-xs text-slate-400">{entry.teacher.name}</p> : null}
                    </td>
                    <td className="px-6 py-3 text-slate-600">{entry.category}</td>
                    <td className="px-6 py-3 text-slate-600">{entry.classSection || "-"}</td>
                    <td className="px-6 py-3"><SourcePill source={entry.source} /></td>
                    <td className={`whitespace-nowrap px-6 py-3 text-right font-semibold tabular-nums ${entry.type === "income" ? "text-emerald-600" : "text-rose-600"}`}>
                      {entry.type === "income" ? "+" : "-"}{formatMoney(entry.amount)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p className="px-6 py-10 text-center text-sm text-slate-400">No {type} records match this filter.</p>
          )}
        </div>

        {data.pagination.pages > 1 ? (
          <div className="border-t border-slate-100 px-6 py-4">
            <Pagination page={data.pagination.page} pages={data.pagination.pages} onPageChange={onPage} />
          </div>
        ) : null}
      </section>
    </div>
  );
}