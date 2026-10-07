"use client";

/* eslint-disable react-hooks/set-state-in-effect */

// Fetching on mount and on filter change is the established pattern in this
// app (see dashboard/fees). The alternative — deriving rows during render —
// would fire a request per render, which is worse.

/**
 * FinanceWorkspace — the tab shell around the admin money screens.
 *
 * Four views over one ledger (src/lib/finance.ts):
 *   Overview   balance, income-vs-expense chart, category donuts (server-rendered)
 *   Income     every rupee in, with filters and an add form
 *   Expenses   every rupee out, same
 *   Salaries   who has been paid this month; marking one paid writes an expense
 *
 * The page arrives seeded with `initial` so the first tab needs no fetch, and
 * only the ledger tabs re-query when their filters change.
 */

import { useCallback, useEffect, useState, type ReactNode } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import LedgerPanel, { type LedgerFilters } from "./LedgerPanel";
import SalaryPanel from "./SalaryPanel";

export type FinanceEntry = {
  _id: string;
  type: "income" | "expense";
  category: string;
  title: string;
  note: string;
  amount: number;
  date: string;
  source: "auto" | "manual";
  classSection: string;
  student: { fullName: string; class: string; section: string; rollNumber: string } | null;
  teacher: { name: string; subject: string } | null;
};

export type FinancePayload = {
  entries: FinanceEntry[];
  summary: { income: number; expense: number; incomeCount: number; expenseCount: number; balance: number };
  categories: Array<{ category: string; type: "income" | "expense"; total: number; count: number }>;
  classSections: string[];
  categoryOptions: { income: readonly string[]; expense: readonly string[] };
  pagination: { page: number; pages: number; total: number; limit: number };
};

const TABS = [
  { key: "overview", label: "Overview" },
  { key: "income", label: "Income" },
  { key: "expenses", label: "Expenses" },
  { key: "salaries", label: "Teacher salaries" },
] as const;

type TabKey = (typeof TABS)[number]["key"];

const EMPTY_FILTERS: LedgerFilters = {
  search: "",
  category: "",
  classSection: "",
  from: "",
  to: "",
  source: "",
  month: "",
};

/** Builds a query string, dropping empty values so the URL stays readable. */
function buildQuery(filters: LedgerFilters, page: number, limit: number) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(filters)) if (value) params.set(key, value);
  if (page > 1) params.set("page", String(page));
  if (limit !== 20) params.set("limit", String(limit));
  return params.toString();
}

export default function FinanceWorkspace({
  initial,
  overview,
  initialTab = "overview",
  initialMonth = "",
}: {
  initial: FinancePayload;
  overview: ReactNode;
  /** Lets a deep link open straight onto a tab, e.g. from the salary history. */
  initialTab?: TabKey;
  /** `YYYY-MM`, pre-applied to the ledger month filter. */
  initialMonth?: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const rawTab = searchParams.get("tab") ?? initialTab;
  const tab: TabKey = TABS.some((item) => item.key === rawTab) ? (rawTab as TabKey) : "overview";
  const [filters, setFilters] = useState<LedgerFilters>({ ...EMPTY_FILTERS, month: initialMonth });
  const [data, setData] = useState<FinancePayload>(initial);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  function selectTab(next: TabKey) {
    const params = new URLSearchParams(searchParams.toString());
    if (next === "overview") params.delete("tab");
    else params.set("tab", next);
    if (next !== "expenses") params.delete("month");
    const query = params.toString();
    router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
    // Filters belong to one tab; carrying them across would silently hide rows.
    setFilters(EMPTY_FILTERS);
    setMessage("");
    setError("");
  }

  const load = useCallback(
    async (nextPage: number) => {
      setLoading(true);
      setError("");
      try {
        const response = await fetch(`/api/finance?${buildQuery(filters, nextPage, 20)}`);
        const result = await response.json();
        if (!response.ok) {
          setError(result.error ?? "Unable to load records");
          return;
        }
        setData(result);
      } catch {
        setError("Unable to connect to the server");
      } finally {
        setLoading(false);
      }
    },
    [filters],
  );

  // The overview renders on the server, so it is deliberately not refetched.
  useEffect(() => {
    if (tab === "overview" || tab === "salaries") return;
    void load(1);
  }, [tab, load]);

  return (
    <div>
      <div
        role="tablist"
        aria-label="Finance sections"
        className="no-scrollbar mb-5 flex gap-1 overflow-x-auto rounded-2xl border border-slate-200 bg-white p-1.5 shadow-sm"
      >
        {TABS.map((item) => (
          <button
            key={item.key}
            type="button"
            role="tab"
            onClick={() => selectTab(item.key)}
            aria-selected={tab === item.key}
            className={`shrink-0 rounded-xl px-4 py-2.5 text-xs font-semibold transition-all duration-300 sm:px-5 sm:text-sm ${
              tab === item.key
                ? "bg-blue-600 text-white shadow-md shadow-blue-600/25"
                : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"
            }`}
          >
            {item.label}
          </button>
        ))}
      </div>

      {/* Keyed on the tab so each switch remounts the panel and replays the fade-up. */}
      <div role="tabpanel">
        <div key={tab} className="tab-enter">
          {tab === "overview" ? (
            overview
          ) : tab === "salaries" ? (
            <SalaryPanel />
          ) : (
            <LedgerPanel
              type={tab}
              filters={filters}
              updateFilter={(key, value) => setFilters((current) => ({ ...current, [key]: value }))}
              clearFilters={() => setFilters(EMPTY_FILTERS)}
              categoryOptions={tab === "income" ? data.categoryOptions.income : data.categoryOptions.expense}
              data={data}
              loading={loading}
              error={error}
              message={message}
              setMessage={setMessage}
              onChanged={() => void load(1)}
              onPage={(page) => void load(page)}
              onOpenSalaries={() => selectTab("salaries")}
            />
          )}
        </div>
      </div>
    </div>
  );
}