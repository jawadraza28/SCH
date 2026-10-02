"use client";

/**
 * AppNav — the one navigation used by every signed-in screen (admin, teacher,
 * student). It is rendered once per role from src/app/<role>/layout.tsx, so the
 * menu never has to be repeated inside a page.
 *
 *  · lg and up  → fixed 18rem side rail (always visible, own scroll area)
 *  · below lg   → sticky top bar with a hamburger that opens a slide-in drawer
 *
 * The drawer closes on route change, on Escape, on backdrop tap, and when a link
 * is tapped; page scrolling is locked while it is open. `print:hidden` keeps it
 * out of printed reports (student profile).
 */

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

export type NavItem = {
  label: string;
  href: string;
  /** Match the pathname exactly — for parent/child pairs like /dashboard and /dashboard/students. */
  exact?: boolean;
};

type Props = {
  items: NavItem[];
  userName: string;
  roleLabel: string;
  schoolName?: string;
  schoolLogo?: string;
  /** Where the brand mark returns to (the role's overview page). */
  homeHref: string;
};

/**
 * How well an item matches the current pathname: the href length, or -1 for no
 * match. Longer href = more specific.
 */
function matchScore(pathname: string, item: NavItem) {
  if (item.exact) return pathname === item.href ? item.href.length : -1;
  return pathname === item.href || pathname.startsWith(`${item.href}/`) ? item.href.length : -1;
}

/**
 * Only the most specific item may be active. Without this, parent/child pairs
 * such as "/dashboard/teachers" and "/dashboard/teachers/assign" light up
 * together (the short href is a prefix of the long one).
 */
function activeHref(pathname: string, items: NavItem[]) {
  let best = "";
  let bestScore = -1;
  for (const item of items) {
    const score = matchScore(pathname, item);
    if (score > bestScore) {
      bestScore = score;
      best = item.href;
    }
  }
  return bestScore > -1 ? best : "";
}

/**
 * Nav link. On the desktop rail `fill` makes every tab stretch so the menu
 * shares the rail's height evenly — the tabs fill the sidebar instead of being
 * cramped at the top, and they shrink gracefully (never overflowing). The mobile
 * drawer keeps natural-height tabs for comfortable tapping.
 */
const linkClass = (active: boolean, fill = false) =>
  `relative flex items-center rounded-xl px-4 text-sm transition ${fill ? "min-h-10 max-h-16 flex-1" : "py-3"} ${
    active ? "bg-blue-50 font-semibold text-blue-700" : "font-medium text-slate-600 hover:bg-slate-50 hover:text-slate-900"
  }`;

function NavIcon({ label }: { label: string }) {
  const glyph = label.toLowerCase().includes("student") ? "M4 6h16v12H4zM8 10h8M8 14h5" : label.toLowerCase().includes("teacher") ? "M12 4l8 4-8 4-8-4 8-4Zm-5 7v4c3 2 7 2 10 0v-4" : label.toLowerCase().includes("attendance") ? "M7 3v4M17 3v4M4 9h16M6 13l2 2 4-4" : label.toLowerCase().includes("fee") ? "M6 4h12v16H6zM9 8h6M9 12h6M9 16h4" : label.toLowerCase().includes("setting") ? "M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8Z" : label.toLowerCase().includes("notice") ? "M5 5h14v14H5zM8 9h8M8 13h6" : label.toLowerCase().includes("class") ? "M4 5h16v14H4zM8 9h8M8 13h5" : "M4 12h16M12 4v16";
  return <svg viewBox="0 0 24 24" className="mr-3 h-5 w-5 shrink-0" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={glyph} /></svg>;
}

export default function AppNav({ items, userName, roleLabel, schoolName = "School", schoolLogo, homeHref }: Props) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  /*
   * The drawer also remembers the route it was opened on: as soon as the route
   * changes it is gone. Deriving that from the pathname is deliberate — closing
   * it from an effect meant calling setState inside useEffect, which React now
   * reports as a cascading render (react-hooks/set-state-in-effect).
   */
  const [openedOn, setOpenedOn] = useState(pathname);
  const drawerOpen = open && openedOn === pathname;

  function openDrawer() {
    setOpenedOn(pathname);
    setOpen(true);
  }

  /* Escape closes it, and the page under it cannot scroll while it is open. */
  useEffect(() => {
    if (!drawerOpen) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, [drawerOpen]);

  const signedIn = (
    <div className="rounded-2xl bg-slate-50 px-3 py-2.5">
      <p className="text-[0.65rem] font-semibold uppercase tracking-[0.18em] text-slate-400">Signed in as</p>
      <p className="mt-1 break-words text-sm font-semibold leading-tight text-slate-800">{userName}</p>
      <p className="mt-0.5 text-xs capitalize leading-tight text-slate-500">{roleLabel}</p>
    </div>
  );

  function brand(compact: boolean) {
    return (
      <Link href={homeHref} className="flex min-w-0 items-center gap-3 text-sm font-bold tracking-wide text-slate-800">
        <span className="grid h-10 w-10 shrink-0 place-items-center overflow-hidden rounded-xl bg-blue-600 text-lg text-white">{schoolLogo ? <img src={schoolLogo} alt="" className="h-full w-full object-cover" /> : schoolName.charAt(0).toUpperCase()}</span>
        <span className={compact ? "" : "hidden lg:inline"}>{schoolName}</span>
      </Link>
    );
  }

  function links(onNavigate: () => void, fill = false) {
    const current = activeHref(pathname, items);
    return (
      <nav className={fill ? "flex flex-1 flex-col gap-1" : "space-y-1"} aria-label="Main navigation">
        {items.map((item) => {
          const active = item.href === current;
          return (
            <Link key={item.href} href={item.href} onClick={onNavigate} aria-current={active ? "page" : undefined} className={linkClass(active, fill)}>
              <NavIcon label={item.label} />
              <span className="min-w-0 flex-1 truncate">{item.label}</span>
            </Link>
          );
        })}
      </nav>
    );
  }

  function signOut(fullWidth: boolean) {
    return (
      <a
        href="/api/auth/logout"
        onClick={() => setOpen(false)}
        className={`shrink-0 rounded-xl border border-slate-200 px-4 py-2.5 text-center text-sm font-medium text-slate-600 hover:bg-slate-50 hover:text-slate-900 ${fullWidth ? "w-full" : ""}`}
      >
        Sign out
      </a>
    );
  }

  return (
    <>
      {/* --- Mobile / tablet: sticky bar carrying the hamburger --------------- */}
      <header className="print:hidden sticky top-0 z-40 flex h-14 items-center gap-3 border-b border-slate-200 bg-white px-4 lg:hidden">
        <button
          type="button"
          onClick={openDrawer}
          aria-expanded={drawerOpen}
          aria-controls="app-nav-drawer"
          aria-label="Open navigation menu"
          className="grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-slate-200 text-slate-700 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
        >
          <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
            <path d="M4 7h16M4 12h16M4 17h16" />
          </svg>
        </button>
        {brand(true)}
      </header>

      {/* --- Desktop: fixed side rail --------------------------------------- */}
      <aside className="print:hidden fixed inset-y-0 left-0 z-30 hidden w-72 flex-col border-r border-slate-200 bg-white px-5 py-6 lg:flex">
        {brand(false)}
        <div className="mt-5">{signedIn}</div>
        <div className="mt-4 flex min-h-0 flex-1 flex-col overflow-y-auto pr-1">{links(() => undefined, true)}</div>
        <div className="pt-4">{signOut(true)}</div>
      </aside>

      {/* --- Drawer: mounted only while open, so it can never push layout ---- */}
      {drawerOpen && (
        <>
          <div className="app-nav-backdrop print:hidden fixed inset-0 z-[55] bg-slate-950/50 lg:hidden" onClick={() => setOpen(false)} aria-hidden="true" />
          <div
            id="app-nav-drawer"
            role="dialog"
            aria-modal="true"
            aria-label="Main navigation"
            className="app-nav-drawer print:hidden fixed inset-y-0 left-0 z-[60] flex w-[86%] max-w-xs flex-col border-r border-slate-200 bg-white px-5 py-6 lg:hidden"
          >
            <div className="flex items-center justify-between gap-3">
              {brand(true)}
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Close navigation menu"
                className="grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-slate-200 text-slate-700 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
              >
                <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
                  <path d="M6 6l12 12M18 6L6 18" />
                </svg>
              </button>
            </div>
            <div className="mt-6">{signedIn}</div>
            <div className="mt-6 min-h-0 flex-1 overflow-y-auto pr-1">{links(() => setOpen(false))}</div>
            <div className="pt-6">{signOut(true)}</div>
          </div>
        </>
      )}
    </>
  );
}
