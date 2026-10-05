"use client";

import { useState } from "react";

type BehaviorEntry = {
  _id: string;
  rating: "excellent" | "improving" | "needs_attention";
  note: string;
  observedAt: string;
  teacher: string;
};

const ratingMeta = {
  excellent: {
    label: "Excellent",
    badge: "bg-emerald-100 text-emerald-800 border-emerald-200",
  },
  improving: {
    label: "Improving",
    badge: "bg-amber-100 text-amber-800 border-amber-200",
  },
  needs_attention: {
    label: "Needs Attention",
    badge: "bg-rose-100 text-rose-800 border-rose-200",
  },
} as const;

export default function StudentBehaviorPanel({
  studentId,
  initialRecords,
}: {
  studentId: string;
  initialRecords: BehaviorEntry[];
}) {
  const [rating, setRating] = useState<BehaviorEntry["rating"]>("improving");
  const [note, setNote] = useState("");
  const [loading, setLoading] = useState(false);
  const [records, setRecords] = useState<BehaviorEntry[]>(initialRecords);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);

    try {
      const response = await fetch(`/api/students/${studentId}/behavior`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rating, note }),
      });
      const data = await response.json();
      if (!response.ok || !data?.record) {
        throw new Error(data?.error ?? "Unable to save behavior.");
      }
      const nextRecord: BehaviorEntry = {
        _id: data.record._id,
        rating: data.record.rating,
        note: data.record.note ?? "",
        observedAt: data.record.observedAt,
        teacher: data.record.teacherName ?? "Teacher",
      };
      setRecords((prev) => [nextRecord, ...prev].slice(0, 6));
      setNote("");
      setRating("improving");
    } catch (error) {
      console.error(error);
      window.alert(error instanceof Error ? error.message : "Unable to save behavior.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="rounded-2xl bg-white shadow-sm">
      <div className="border-b border-slate-100 px-6 py-5">
        <h2 className="text-lg font-semibold text-slate-900">Student behavior</h2>
      </div>
      <div className="grid gap-5 p-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
        <form onSubmit={handleSubmit} className="space-y-4 rounded-2xl border border-slate-200 bg-slate-50 p-4">
          <div>
            <label className="text-sm font-medium text-slate-700">Progress level</label>
            <select
              value={rating}
              onChange={(event) => setRating(event.target.value as BehaviorEntry["rating"])}
              className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-3 py-3 text-sm outline-none focus:border-blue-500"
            >
              <option value="excellent">Excellent</option>
              <option value="improving">Improving</option>
              <option value="needs_attention">Needs Attention</option>
            </select>
          </div>

          <div>
            <label className="text-sm font-medium text-slate-700">Teacher note</label>
            <textarea
              value={note}
              onChange={(event) => setNote(event.target.value)}
              rows={4}
              placeholder="Add a note about behavior, participation, or discipline..."
              className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-3 py-3 text-sm outline-none focus:border-blue-500"
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-xl bg-blue-600 px-4 py-3 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:bg-blue-300"
          >
            {loading ? "Saving..." : "Save behavior"}
          </button>
        </form>

        <div className="space-y-3">
          <p className="text-sm font-medium text-slate-700">Recent behavior notes</p>
          {records.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 p-4 text-sm text-slate-400">
              No behavior notes yet.
            </div>
          ) : (
            records.map((record) => (
              <div key={record._id} className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                <div className="flex items-center justify-between gap-3">
                  <span className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold ${ratingMeta[record.rating].badge}`}>
                    {ratingMeta[record.rating].label}
                  </span>
                  <span className="text-[11px] uppercase tracking-wide text-slate-400">{record.teacher}</span>
                </div>
                <p className="mt-3 text-sm text-slate-600">{record.note || "No written note provided."}</p>
                <p className="mt-2 text-xs text-slate-400">{new Date(record.observedAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}</p>
              </div>
            ))
          )}
        </div>
      </div>
    </section>
  );
}
