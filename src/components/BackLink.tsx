import Link from "next/link";

export default function BackLink({ href = "/dashboard", children = "Back to dashboard" }: { href?: string; children?: React.ReactNode }) {
  return (
    <Link href={href} aria-label={typeof children === "string" ? children : "Go back"} className="group inline-flex min-h-11 items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-600 shadow-sm transition hover:-translate-x-0.5 hover:border-blue-200 hover:bg-blue-50 hover:text-blue-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 sm:px-3.5">
      <span className="grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-slate-100 text-slate-500 transition group-hover:bg-blue-100 group-hover:text-blue-700">
        <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><path d="M19 12H5M12 19l-7-7 7-7" /></svg>
      </span>
      <span className="truncate">{children}</span>
    </Link>
  );
}
