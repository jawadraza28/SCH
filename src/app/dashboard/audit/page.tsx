"use client";

 

import { useEffect, useState } from "react";
import { SkeletonRows } from "@/components/Loaders";
import Pagination from "@/components/Pagination";
import BackLink from "@/components/BackLink";

type Log = { _id: string; action: string; targetType: string; details?: string; timestamp: string; user?: { name?: string } };

const PAGE_SIZE = 20;

export default function AuditPage() {
  const [logs, setLogs] = useState<Log[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);
  const [total, setTotal] = useState(0);

  useEffect(() => {
    fetch(`/api/audit?page=${page}&limit=${PAGE_SIZE}`)
      .then(async (response) => {
        const result = await response.json();
        if (!response.ok) throw new Error(result.error ?? "Unable to load audit history");
        setLogs(result.logs ?? []);
        setPages(result.pagination?.pages ?? 1);
        setTotal(result.pagination?.total ?? 0);
      })
      .catch((cause) => setError(cause instanceof Error ? cause.message : "Unable to connect to the server"))
      .finally(() => setLoading(false));
  }, [page]);

  function goToPage(next: number) {
    if (next === page) return;
    setLoading(true);
    setError("");
    setPage(next);
  }

  return (
    <main className="app-page bg-slate-100 px-4 py-6 text-slate-900 sm:px-6 lg:px-10 lg:py-8">
      <div className="mx-auto max-w-7xl">
        <BackLink />
        <h1 className="mt-6 text-2xl sm:text-3xl font-bold">Audit history</h1>
        <p className="mt-2 text-slate-500">Important changes made in this school deployment.</p>
        {error && <p className="mt-5 rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</p>}
        <section className="mt-8 overflow-hidden rounded-2xl bg-white shadow-sm">
          {loading ? (
            <SkeletonRows rows={5} className="px-6 py-6" />
          ) : logs.length === 0 ? (
            <div className="px-4 py-16 sm:px-6 sm:py-20 text-center text-sm text-slate-400">No audit activity yet.</div>
          ) : (
            <div className="divide-y divide-slate-100">
              {logs.map((log) => (
                <article key={log._id} className="flex flex-col justify-between gap-2 px-6 py-4 sm:flex-row">
                  <div>
                    <p className="font-medium capitalize">{log.action.replaceAll("_", " ")}</p>
                    <p className="mt-1 text-sm text-slate-500">{log.details || log.targetType}</p>
                  </div>
                  <p className="text-xs text-slate-400">{log.user?.name ?? "System"} · {new Date(log.timestamp).toLocaleString()}</p>
                </article>
              ))}
            </div>
          )}
          {!loading && total > 0 && (
            <div className="border-t border-slate-100 px-6 py-4">
              <p className="mb-3 text-xs text-slate-400">{total} entries · page {page} of {pages}</p>
              <Pagination page={page} pages={pages} onPageChange={goToPage} />
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
