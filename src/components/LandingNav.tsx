"use client";

import Link from "next/link";
import { useState } from "react";

type Props = {
  schoolName: string;
  /** Cloudinary logo from school settings; falls back to the bundled mark. */
  logo?: string;
};

export default function LandingNav({ schoolName, logo }: Props) {
  const [open, setOpen] = useState(false);

  return (
    <nav className="landing-nav relative z-20 w-full border-b border-white/10 px-4 py-3 sm:px-8 sm:py-4">
      <div className="mx-auto flex max-w-7xl items-center justify-between gap-4">
        <Link href="/" className="flex min-w-0 items-center gap-3 text-sm font-bold tracking-wide">
          <span className="grid h-10 w-10 shrink-0 place-items-center overflow-hidden rounded-xl bg-blue-500 text-lg">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={logo || "/logo.png"} alt="" className="h-full w-full object-cover" />
          </span>
          <span className="truncate">{schoolName}</span>
        </Link>
        <div className="hidden items-center gap-1 sm:flex sm:gap-2">
          <a href="#about" className="landing-nav-link px-3 py-2 text-sm font-medium">About</a>
          <a href="#highlights" className="landing-nav-link px-3 py-2 text-sm font-medium">Why us</a>
          <a href="#news" className="landing-nav-link px-3 py-2 text-sm font-medium">News</a>
          <a href="#gallery" className="landing-nav-link px-3 py-2 text-sm font-medium">Gallery</a>
          <Link href="/about-us" className="landing-nav-link px-3 py-2 text-sm font-medium">About us</Link>
          <Link href="/contact" className="px-3 py-2 text-sm font-medium text-slate-300 hover:text-white">Contact</Link>
          <Link href="/login" className="rounded-xl bg-white px-4 py-2.5 text-sm font-semibold text-slate-900 hover:bg-blue-50">Sign in</Link>
        </div>
        <button
          type="button"
          onClick={() => setOpen((current) => !current)}
          aria-expanded={open}
          aria-controls="landing-mobile-menu"
          aria-label={open ? "Close navigation menu" : "Open navigation menu"}
          className="grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-white/15 text-slate-100 hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 sm:hidden"
        >
          {open ? (
            <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" /></svg>
          ) : (
            <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><path d="M4 7h16M4 12h16M4 17h16" /></svg>
          )}
        </button>
      </div>
      {open && (
        <div id="landing-mobile-menu" className="landing-mobile-menu mt-3 rounded-2xl p-2 shadow-2xl backdrop-blur sm:hidden">
          <a href="#about" onClick={() => setOpen(false)} className="landing-mobile-link block rounded-xl px-4 py-3 text-sm font-medium">About</a>
          <a href="#highlights" onClick={() => setOpen(false)} className="landing-mobile-link block rounded-xl px-4 py-3 text-sm font-medium">Why us</a>
          <a href="#news" onClick={() => setOpen(false)} className="landing-mobile-link block rounded-xl px-4 py-3 text-sm font-medium">News</a>
          <a href="#gallery" onClick={() => setOpen(false)} className="landing-mobile-link block rounded-xl px-4 py-3 text-sm font-medium">Gallery</a>
          <Link href="/about-us" onClick={() => setOpen(false)} className="landing-mobile-link block rounded-xl px-4 py-3 text-sm font-medium">About us</Link>
          <Link href="/contact" onClick={() => setOpen(false)} className="landing-mobile-link block rounded-xl px-4 py-3 text-sm font-medium">Contact</Link>
          <Link href="/login" onClick={() => setOpen(false)} className="landing-mobile-signin mt-1 block rounded-xl px-4 py-3 text-center text-sm font-semibold">Sign in</Link>
        </div>
      )}
    </nav>
  );
}
