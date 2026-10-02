import Link from "next/link";

export default function FilterChips({ items, clearHref }: { items: Array<{ label: string; value: string }>; clearHref: string }) {
  if (!items.length) return null;
  return (
    <div className="mt-4 flex flex-wrap items-center gap-2" aria-label="Active filters">
      <span className="text-xs font-semibold uppercase tracking-wide text-slate-400">Active filters</span>
      {items.map((item) => <span key={`${item.label}-${item.value}`} className="rounded-full border border-blue-200 bg-blue-50 px-3 py-1 text-xs font-semibold text-blue-700">{item.label}: {item.value}</span>)}
      <Link href={clearHref} className="rounded-full px-3 py-1 text-xs font-semibold text-slate-500 underline-offset-2 hover:text-slate-900 hover:underline">Clear all</Link>
    </div>
  );
}
