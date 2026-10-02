"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export default function DeleteButton({ endpoint, label = "Delete" }: { endpoint: string; label?: string }) {
  const router = useRouter();
  const [deleting, setDeleting] = useState(false);
  async function remove() {
    if (!window.confirm("This permanently deletes the record and its related account data. Continue?")) return;
    setDeleting(true);
    const response = await fetch(endpoint, { method: "DELETE" });
    const result = await response.json();
    if (!response.ok) {
      window.alert(result.error ?? "Unable to delete record");
      setDeleting(false);
      return;
    }
    router.refresh();
  }
  return <button type="button" onClick={remove} disabled={deleting} className="rounded-lg bg-red-50 px-3 py-2 text-xs font-semibold text-red-700 hover:bg-red-100 disabled:opacity-60">{deleting ? "Deleting..." : label}</button>;
}
