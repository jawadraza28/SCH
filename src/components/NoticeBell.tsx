"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";

type Notice = { _id: string; title: string; description: string; type: string; publishDate?: string };

export default function NoticeBell({ href }: { href: string }) {
  const [notices, setNotices] = useState<Notice[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function close(event: MouseEvent) {
      if (!ref.current?.contains(event.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, []);

  async function toggle() {
    if (!open && notices.length === 0) {
      setLoading(true);
      try {
        const response = await fetch("/api/notices?limit=5", { cache: "no-store" });
        const result = await response.json();
        if (response.ok) setNotices(Array.isArray(result.notices) ? result.notices : []);
      } finally {
        setLoading(false);
      }
    }
    setOpen((current) => !current);
  }

  return (
    <div ref={ref} className="relative">
      <button type="button" onClick={() => void toggle()} aria-expanded={open} aria-label="Open notices" className="app-nav-notice-button relative grid h-10 w-10 place-items-center rounded-2xl border border-slate-200 bg-white text-slate-600 shadow-sm transition hover:-translate-y-0.5 hover:text-blue-600">
        <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4" />
        </svg>
        {notices.length > 0 ? <span className="absolute right-1 top-1 h-2 w-2 rounded-full bg-blue-600 ring-2 ring-white" /> : null}
      </button>
      {open ? (
        <div className="app-nav-notice-popover absolute right-0 top-12 z-[80] w-[min(22rem,calc(100vw-1rem))] overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl">
          <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
            <div><p className="text-sm font-bold text-slate-900">Latest notices</p><p className="text-xs text-slate-500">School updates for you</p></div>
            <Link href={href} className="text-xs font-semibold text-blue-600" onClick={() => setOpen(false)}>View all</Link>
          </div>
          <div className="max-h-80 overflow-y-auto p-2">
            {loading ? <p className="px-3 py-8 text-center text-sm text-slate-400">Loading notices…</p> : notices.length === 0 ? <p className="px-3 py-8 text-center text-sm text-slate-400">No new notices.</p> : notices.map((notice) => (
              <Link key={notice._id} href={href} onClick={() => setOpen(false)} className="block rounded-xl px-3 py-3 hover:bg-slate-50">
                <div className="flex items-center justify-between gap-2"><span className="rounded-md bg-blue-50 px-2 py-1 text-[0.65rem] font-bold uppercase text-blue-700">{notice.type}</span><time className="text-[0.65rem] text-slate-400">{notice.publishDate ? new Date(notice.publishDate).toLocaleDateString() : ""}</time></div>
                <p className="mt-2 text-sm font-semibold text-slate-800">{notice.title}</p>
                <p className="mt-1 line-clamp-2 text-xs leading-5 text-slate-500">{notice.description}</p>
              </Link>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}
