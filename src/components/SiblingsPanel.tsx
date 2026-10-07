"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

type Sibling = { _id: string; fullName: string; studentId?: string; class?: string; section?: string; rollNumber?: string };

export default function SiblingsPanel({ studentId, basePath }: { studentId: string; basePath: string }) {
  const [siblings, setSiblings] = useState<Sibling[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    fetch(`/api/students/${studentId}/siblings`, { cache: "no-store" })
      .then((response) => response.ok ? response.json() : { siblings: [] })
      .then((result) => setSiblings(Array.isArray(result.siblings) ? result.siblings : []))
      .catch(() => setSiblings([]))
      .finally(() => setLoaded(true));
  }, [studentId]);

  if (!loaded || siblings.length === 0) return null;
  return (
    <section className="border-t border-slate-100 px-5 py-6 sm:px-8">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-blue-600">Family</p>
          <h2 className="mt-1 text-lg font-bold text-slate-900">Siblings in this school</h2>
        </div>
        <p className="text-xs text-slate-400">Matched by parent CNIC</p>
      </div>
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        {siblings.map((sibling) => (
          <Link key={sibling._id} href={basePath === "/student/profile" ? `${basePath}?sibling=${encodeURIComponent(sibling._id)}` : `${basePath}/${sibling._id}`} className="group flex items-center gap-3 rounded-2xl border border-slate-200 bg-slate-50 p-3 transition hover:-translate-y-0.5 hover:border-blue-200 hover:bg-blue-50">
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-blue-100 font-bold text-blue-700">{sibling.fullName.charAt(0).toUpperCase()}</span>
            <span className="min-w-0">
              <span className="block truncate text-sm font-semibold text-slate-800 group-hover:text-blue-700">{sibling.fullName}</span>
              <span className="mt-0.5 block text-xs text-slate-500">{sibling.studentId || "Student"} · {sibling.class}-{sibling.section} · Roll {sibling.rollNumber || "-"}</span>
            </span>
          </Link>
        ))}
      </div>
    </section>
  );
}
