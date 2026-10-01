"use client";

 

import Link from "next/link";
import { useEffect, useState } from "react";
import { ListSkeleton } from "@/components/Loaders";
import Pagination from "@/components/Pagination";

type Student = { _id: string; fullName: string; studentId: string; class: string; section: string; accountStatus: string };

const PAGE_SIZE = 10;

export default function StudentRequestsPage() {
  const [students, setStudents] = useState<Student[]>([]);
  const [notice, setNotice] = useState("");
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);
  const [total, setTotal] = useState(0);

  async function load(targetPage: number) {
    try {
      const response = await fetch(`/api/students?status=pending&page=${targetPage}&limit=${PAGE_SIZE}`);
      const result = await response.json();
      if (response.ok) {
        setStudents(result.students ?? []);
        setPages(result.pagination?.pages ?? 1);
        setTotal(result.pagination?.total ?? 0);
      }
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void load(page); }, [page]);

  function goToPage(next: number) {
    if (next === page) return;
    setLoading(true);
    setPage(next);
  }

  async function action(studentId: string, actionName: string) {
    const response = await fetch("/api/students", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ studentId, action: actionName }) });
    const result = await response.json();
    if (response.ok) {
      setNotice(result.temporaryPassword ? `Approved. Temporary password: ${result.temporaryPassword}` : `Student ${actionName}d.`);
      if (students.length === 1 && page > 1) {
        setLoading(true);
        setPage(page - 1);
      } else {
        await load(page);
      }
    } else setNotice(result.error ?? "Unable to update student");
  }

  return (
    <main className="app-page bg-slate-100 px-4 py-6 text-slate-900 sm:px-6 lg:px-10 lg:py-8">
      <div className="mx-auto max-w-5xl">
        <Link href="/dashboard/students" className="text-sm font-medium text-blue-600">← Students</Link>
        <h1 className="mt-6 text-2xl sm:text-3xl font-bold">Student requests</h1>
        <p className="mt-2 text-slate-500">Review students waiting for approval.</p>
        {notice && <p className="mt-5 rounded-xl bg-blue-50 p-4 text-sm text-blue-800">{notice}</p>}
        <section className="mt-8 space-y-3">
          {!loading && total > 0 && (
            <p className="text-sm text-slate-500">{total} pending request{total === 1 ? "" : "s"} · page {page} of {pages}</p>
          )}
          {loading ? (
            <ListSkeleton rows={3} />
          ) : students.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-slate-300 bg-white px-4 py-16 sm:px-6 sm:py-20 text-center text-sm text-slate-400">No pending student requests.</div>
          ) : (
            students.map((student) => (
              <div key={student._id} className="flex flex-col justify-between gap-4 rounded-2xl bg-white p-5 shadow-sm sm:flex-row sm:items-center">
                <div>
                  <p className="font-semibold">{student.fullName}</p>
                  <p className="mt-1 text-sm text-slate-500">{student.studentId} · Class {student.class}-{student.section}</p>
                </div>
                <div className="flex gap-2">
                  <button onClick={() => void action(student._id, "approve")} className="rounded-xl bg-emerald-600 px-4 py-2 text-sm font-semibold text-white">Approve</button>
                  <button onClick={() => void action(student._id, "reject")} className="rounded-xl bg-red-50 px-4 py-2 text-sm font-semibold text-red-700">Reject</button>
                </div>
              </div>
            ))
          )}
        </section>
        {!loading && total > 0 && (
          <div className="mt-5">
            <Pagination page={page} pages={pages} onPageChange={goToPage} />
          </div>
        )}
      </div>
    </main>
  );
}
