"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type Props = {
  studentId: string;
  month: string;
  year: number;
  status: "paid" | "unpaid";
  /** Called after a successful update. Defaults to refreshing server data. */
  onUpdated?: () => void | Promise<void>;
};

export default function FeeActions({ studentId, month, year, status, onUpdated }: Props) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function update(action: "paid" | "unpaid") {
    setSaving(true);
    setError("");
    try {
      const response = await fetch("/api/fees", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ studentId, month, year, action }),
      });
      const result = await response.json();
      if (!response.ok) setError(result.error ?? "Unable to update fee");
      else if (onUpdated) await onUpdated();
      else router.refresh();
    } catch {
      setError("Unable to connect to the server");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <div className="flex gap-2">
        <button
          type="button"
          disabled={saving || status === "paid"}
          onClick={() => update("paid")}
          className="min-w-[5.75rem] whitespace-nowrap rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-40"
        >
          Mark paid
        </button>
        <button
          type="button"
          disabled={saving || status === "unpaid"}
          onClick={() => update("unpaid")}
          className="min-w-[5.75rem] whitespace-nowrap rounded-lg bg-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-700 disabled:opacity-40"
        >
          Mark unpaid
        </button>
      </div>
      {error && <p className="text-right text-xs text-red-600">{error}</p>}
    </div>
  );
}
