"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function FinanceGate() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function unlock(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/finance/access", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      const result = await response.json();
      if (!response.ok) {
        setError(result.error ?? "Unable to unlock finance");
        return;
      }
      router.refresh();
    } catch {
      setError("Unable to connect to the server");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="app-page grid min-h-[calc(100vh-3.5rem)] place-items-center bg-slate-100 px-4 py-8 text-slate-900 sm:px-6">
      <section className="w-full max-w-md rounded-3xl border border-slate-200 bg-white p-6 text-center shadow-xl shadow-slate-900/5 sm:p-8">
        <div className="mx-auto grid h-16 w-16 place-items-center rounded-2xl bg-emerald-100 text-emerald-700">
          <svg viewBox="0 0 24 24" className="h-8 w-8" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
            <rect x="5" y="10" width="14" height="10" rx="2" />
            <path d="M8 10V7a4 4 0 0 1 8 0v3M12 14v2" />
          </svg>
        </div>
        <p className="mt-5 text-xs font-bold uppercase tracking-[0.2em] text-emerald-600">Protected area</p>
        <h1 className="mt-2 text-2xl font-bold tracking-tight">Unlock finance</h1>
        <p className="mt-2 text-sm leading-6 text-slate-500">Enter the finance access password to view income, expenses, salaries, and financial reports.</p>
        <form onSubmit={unlock} className="mt-6 text-left">
          <label className="text-sm font-semibold text-slate-700">
            Finance password
            <input
              required
              autoFocus
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-4 py-3 outline-none transition focus:border-emerald-500 focus:ring-4 focus:ring-emerald-100"
              autoComplete="current-password"
            />
          </label>
          {error ? <p role="alert" className="mt-3 rounded-xl bg-red-50 px-3 py-2.5 text-sm text-red-700">{error}</p> : null}
          <button type="submit" disabled={loading} className="mt-5 w-full rounded-xl bg-emerald-600 px-4 py-3 font-semibold text-white shadow-lg shadow-emerald-600/20 transition hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-60">
            {loading ? "Checking…" : "Open finance"}
          </button>
        </form>
        <p className="mt-4 text-xs text-slate-400">The finance unlock expires automatically after 30 minutes.</p>
      </section>
    </main>
  );
}
