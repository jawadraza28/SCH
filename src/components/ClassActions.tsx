"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

/**
 * Edit + delete controls for the class detail page.
 *
 * Deletion is a soft retire (`isActive: false`) so fee, attendance and result
 * history survive it. The API refuses while students are still enrolled, so the
 * server's reason is surfaced verbatim instead of a generic failure.
 */
export default function ClassActions({ id, label }: { id: string; label: string }) {
  const router = useRouter();
  const [deleting, setDeleting] = useState(false);

  async function remove() {
    if (!window.confirm(`Retire ${label}? It disappears from every picker, but existing fee and attendance records are kept.`)) return;
    setDeleting(true);
    try {
      const response = await fetch("/api/classes", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id }) });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) {
        window.alert(result.error ?? "Unable to delete class");
        setDeleting(false);
        return;
      }
      router.push("/dashboard/classes");
      router.refresh();
    } catch {
      window.alert("Unable to connect to the server");
      setDeleting(false);
    }
  }

  return <div className="flex flex-wrap gap-3"><a href={`/dashboard/classes/${id}/edit`} className="rounded-xl border border-slate-200 bg-white px-4 py-3 text-center text-sm font-semibold text-slate-700">Edit class</a><button type="button" onClick={remove} disabled={deleting} className="rounded-xl bg-red-600 px-4 py-3 text-center text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-60">{deleting ? "Deleting..." : "Delete class"}</button></div>;
}
