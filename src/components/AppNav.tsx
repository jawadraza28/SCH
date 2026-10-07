"use client";

/**
 * AppNav — the one navigation used by every signed-in screen (admin, teacher,
 * student). It is rendered once per role from src/app/<role>/layout.tsx, so the
 * menu never has to be repeated inside a page.
 *
 *  · lg and up  → fixed 18rem side rail (always visible, own scroll area)
 *  · below lg   → sticky top bar + hamburger drawer + bottom quick tabs
 *
 * Groups (Finance, Students, …) open as in-flow dropdowns. Query-string
 * children such as /dashboard/finance?tab=income are treated as real pages, so
 * Custom income / Custom expense / Teacher salary actually switch the tab.
 */

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useMemo, useState } from "react";

export type NavChild = {
  label: string;
  href: string;
  /** Match the pathname exactly — for index-style child pages. */
  exact?: boolean;
};

export type NavItem = {
  label: string;
  href: string;
  /** Match the pathname exactly — for parent/child pairs like /dashboard and /dashboard/students. */
  exact?: boolean;
  /**
   * In-flow dropdown. The parent row toggles the list; children navigate.
   * Query-string children (e.g. ?tab=income) are first-class destinations.
   */
  children?: NavChild[];
  /** Shown in the mobile bottom tab bar (keep to 5 or fewer per role). */
  quick?: boolean;
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

function splitHref(href: string) {
  const index = href.indexOf("?");
  if (index === -1) return { path: href, params: new URLSearchParams() };
  return { path: href.slice(0, index), params: new URLSearchParams(href.slice(index + 1)) };
}

function paramsMatch(needed: URLSearchParams, current: URLSearchParams) {
  for (const [key, value] of needed.entries()) {
    if ((current.get(key) ?? "") !== value) return false;
  }
  return true;
}

function matchScore(pathname: string, search: string, item: NavItem) {
  const current = new URLSearchParams(search);
  const { path, params } = splitHref(item.href);
  if (item.exact) {
    if (pathname !== path) return -1;
    return paramsMatch(params, current) ? path.length + params.toString().length : -1;
  }
  if (pathname === path || pathname.startsWith(`${path}/`)) return path.length;
  return -1;
}

function childIsActive(pathname: string, search: string, child: NavChild) {
  const current = new URLSearchParams(search);
  const { path, params } = splitHref(child.href);
  const tab = params.get("tab");

  if (tab) return pathname === path && (current.get("tab") ?? "") === tab;

  if (child.exact) {
    if (pathname !== path) return false;
    if (![...params.keys()].length) {
      const currentTab = current.get("tab");
      return !currentTab || currentTab === "overview";
    }
    return paramsMatch(params, current);
  }

  return pathname === path || pathname.startsWith(`${path}/`);
}

function activeHref(pathname: string, search: string, items: NavItem[]) {
  let best = "";
  let bestScore = -1;
  for (const item of items) {
    const score = matchScore(pathname, search, item);
    if (score > bestScore) {
      bestScore = score;
      best = item.href;
    }
    for (const child of item.children ?? []) {
      if (!childIsActive(pathname, search, child)) continue;
      const childScore = splitHref(child.href).path.length + 80;
      if (childScore > bestScore) {
        bestScore = childScore;
        best = item.href;
      }
    }
  }
  return bestScore > -1 ? best : "";
}

function currentLabel(pathname: string, search: string, items: NavItem[]) {
  for (const item of items) {
    for (const child of item.children ?? []) {
      if (childIsActive(pathname, search, child)) return child.label;
    }
  }
  const current = activeHref(pathname, search, items);
  return items.find((item) => item.href === current)?.label ?? "Menu";
}

const linkClass = (active: boolean) =>
  `relative flex items-center rounded-xl px-3 py-2.5 text-sm transition-all duration-200 before:absolute before:bottom-2 before:left-0 before:top-2 before:w-1 before:rounded-full before:bg-blue-600 before:transition-all before:duration-200 ${
    active
      ? "bg-blue-50 font-semibold text-blue-700 before:scale-y-100 before:opacity-100"
      : "font-medium text-slate-600 before:scale-y-0 before:opacity-0 hover:bg-slate-50 hover:text-slate-900"
  }`;

function NavIcon({ label, compact }: { label: string; compact?: boolean }) {
  const key = label.toLowerCase();
  const glyph =
    key.includes("finance") || key.includes("salary") || key.includes("income") || key.includes("expense")
      ? "M4 7h16v12H4zM4 11h16M15 15h3"
      : key.includes("analytic")
        ? "M4 19V9M9 19V5M14 19v-6M19 19v-9"
        : key.includes("student")
          ? "M4 6h16v12H4zM8 10h8M8 14h5"
          : key.includes("teacher")
            ? "M12 4l8 4-8 4-8-4 8-4Zm-5 7v4c3 2 7 2 10 0v-4"
            : key.includes("attendance")
              ? "M7 3v4M17 3v4M4 9h16M6 13l2 2 4-4"
              : key.includes("fee")
                ? "M6 4h12v16H6zM9 8h6M9 12h6M9 16h4"
                : key.includes("setting")
                  ? "M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8Z"
                  : key.includes("notice")
                    ? "M5 5h14v14H5zM8 9h8M8 13h6"
                    : key.includes("class")
                      ? "M4 5h16v14H4zM8 9h8M8 13h5"
                      : key.includes("homework")
                        ? "M6 4h9l3 3v13H6zM9 12h6M9 16h4"
                        : key.includes("result") || key.includes("performance")
                          ? "M4 19V8l6-3 6 3v11M10 19V5"
                          : key.includes("timetable")
                            ? "M5 5h14v14H5zM5 10h14M10 5v14"
                            : key.includes("profile")
                              ? "M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8ZM6 20a6 6 0 0 1 12 0"
                              : key.includes("exam")
                                ? "M5 4h10l4 4v12H5zM9 13h6M9 17h4"
                                : "M4 12h16M12 4v16";
  return (
    <svg viewBox="0 0 24 24" className={`${compact ? "h-5 w-5" : "mr-3 h-5 w-5"} shrink-0`} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={glyph} />
    </svg>
  );
}

function AppNavFrame({ items, userName, roleLabel, schoolName = "School", schoolLogo, homeHref, search }: Props & { search: string }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [openedOn, setOpenedOn] = useState(pathname);
  const drawerOpen = open && openedOn === pathname;
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [filter, setFilter] = useState("");

  function openDrawer() {
    setOpenedOn(pathname);
    setOpen(true);
  }

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

  const needle = filter.trim().toLowerCase();
  const visibleItems = useMemo(() => {
    if (!needle) return items;
    return items.filter((item) => {
      if (item.label.toLowerCase().includes(needle)) return true;
      return Boolean(item.children?.some((child) => child.label.toLowerCase().includes(needle)));
    });
  }, [items, needle]);

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
        <span className="grid h-10 w-10 shrink-0 place-items-center overflow-hidden rounded-xl bg-blue-600 text-lg text-white">
          {schoolLogo ? <img src={schoolLogo} alt="" className="h-full w-full object-cover" /> : schoolName.charAt(0).toUpperCase()}
        </span>
        <span className={`min-w-0 truncate ${compact ? "" : "hidden lg:inline"}`}>{schoolName}</span>
      </Link>
    );
  }

  function links(onNavigate: () => void) {
    const current = activeHref(pathname, search, items);
    return (
      <nav className="flex flex-col gap-1" aria-label="Main navigation">
        {visibleItems.length === 0 ? (
          <p className="px-3 py-4 text-sm text-slate-500">No matching pages.</p>
        ) : (
          visibleItems.map((item) => {
            const groupActive = item.href === current || Boolean(item.children?.some((child) => childIsActive(pathname, search, child)));
            const searching = Boolean(needle);
            const isOpen = searching || (expanded[item.href] ?? groupActive);

            if (!item.children) {
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={onNavigate}
                  aria-current={item.href === current ? "page" : undefined}
                  className={linkClass(item.href === current)}
                >
                  <NavIcon label={item.label} />
                  <span className="min-w-0 flex-1 truncate">{item.label}</span>
                </Link>
              );
            }

            const panelId = `nav-group-${item.href.replace(/[^a-z0-9]+/gi, "-")}`;
            return (
              <div key={item.href} className="nav-group">
                <button
                  type="button"
                  onClick={() => setExpanded((previous) => ({ ...previous, [item.href]: !isOpen }))}
                  aria-expanded={isOpen}
                  aria-controls={panelId}
                  className={`${linkClass(groupActive)} w-full`}
                >
                  <NavIcon label={item.label} />
                  <span className="min-w-0 flex-1 truncate text-left">{item.label}</span>
                  <svg
                    viewBox="0 0 24 24"
                    className={`ml-1 h-4 w-4 shrink-0 text-slate-400 transition-transform duration-300 ease-out ${isOpen ? "rotate-180 text-blue-600" : "rotate-0"}`}
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden="true"
                  >
                    <path d="M6 9l6 6 6-6" />
                  </svg>
                </button>
                <div id={panelId} className={`nav-collapse ${isOpen ? "is-open" : ""}`} inert={!isOpen}>
                  <div className="nav-collapse__inner">
                    <div className="ml-5 mt-1 flex flex-col gap-0.5 border-l-2 border-blue-100 pb-1.5 pl-2">
                      {item.children.map((child, index) => {
                        const active = childIsActive(pathname, search, child);
                        return (
                          <Link
                            key={`${child.href}-${child.label}`}
                            href={child.href}
                            scroll={false}
                            onClick={onNavigate}
                            aria-current={active ? "page" : undefined}
                            style={{ transitionDelay: isOpen ? `${index * 35}ms` : "0ms" }}
                            className={`nav-child flex items-center rounded-lg px-3 py-2 text-[0.8rem] transition-all duration-200 ${
                              isOpen ? "translate-x-0 opacity-100" : "-translate-x-2 opacity-0"
                            } ${
                              active
                                ? "bg-blue-50 font-semibold text-blue-700"
                                : "font-medium text-slate-500 hover:translate-x-0.5 hover:bg-slate-50 hover:text-slate-800"
                            }`}
                          >
                            <span className={`mr-2 h-1.5 w-1.5 shrink-0 rounded-full ${active ? "bg-blue-600" : "bg-slate-300"}`} />
                            <span className="min-w-0 flex-1 leading-snug">{child.label}</span>
                          </Link>
                        );
                      })}
                    </div>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </nav>
    );
  }

  function searchField() {
    return (
      <label className="relative mt-4 block">
        <span className="sr-only">Search pages</span>
        <svg viewBox="0 0 24 24" className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
          <circle cx="11" cy="11" r="7" />
          <path d="M20 20l-3-3" />
        </svg>
        <input
          value={filter}
          onChange={(event) => setFilter(event.target.value)}
          placeholder="Search pages…"
          className="w-full rounded-xl border border-slate-200 bg-white py-2.5 pl-9 pr-3 text-sm text-slate-800 outline-none placeholder:text-slate-400 focus:border-blue-500"
        />
      </label>
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

  const title = currentLabel(pathname, search, items);
  const quickItems = items.filter((item) => item.quick).slice(0, 5);

  return (
    <>
      <header className="print:hidden sticky top-0 z-40 flex h-14 items-center gap-3 border-b border-slate-200 bg-white/95 px-3 pt-[env(safe-area-inset-top)] backdrop-blur lg:hidden">
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
        <p className="ml-auto min-w-0 truncate text-right text-xs font-semibold text-slate-500">{title}</p>
      </header>

      <aside className="print:hidden fixed inset-y-0 left-0 z-30 hidden w-72 flex-col border-r border-slate-200 bg-white px-4 py-6 lg:flex">
        {brand(false)}
        <div className="mt-5">{signedIn}</div>
        {searchField()}
        <div className="mt-4 flex min-h-0 flex-1 flex-col overflow-y-auto pr-1">{links(() => undefined)}</div>
        <div className="pt-4">{signOut(true)}</div>
      </aside>

      {drawerOpen && (
        <>
          <div className="app-nav-backdrop print:hidden fixed inset-0 z-[55] bg-slate-950/50 lg:hidden" onClick={() => setOpen(false)} aria-hidden="true" />
          <div
            id="app-nav-drawer"
            role="dialog"
            aria-modal="true"
            aria-label="Main navigation"
            className="app-nav-drawer print:hidden fixed inset-y-0 left-0 z-[60] flex w-[min(92%,20rem)] max-w-xs flex-col border-r border-slate-200 bg-white px-4 py-5 lg:hidden"
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
            <div className="mt-5">{signedIn}</div>
            {searchField()}
            <div className="mt-4 min-h-0 flex-1 overflow-y-auto pr-1">{links(() => setOpen(false))}</div>
            <div className="pt-4">{signOut(true)}</div>
          </div>
        </>
      )}

      {quickItems.length > 1 ? (
        <nav className="app-bottom-nav print:hidden fixed inset-x-0 bottom-0 z-40 border-t border-slate-200 bg-white/95 px-1 pb-[env(safe-area-inset-bottom)] pt-1 backdrop-blur lg:hidden" aria-label="Quick navigation">
          <div className="mx-auto grid max-w-lg" style={{ gridTemplateColumns: `repeat(${quickItems.length}, minmax(0, 1fr))` }}>
            {quickItems.map((item) => {
              const active = item.href === currentHref(pathname, search, items, item);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  aria-current={active ? "page" : undefined}
                  className={`flex min-w-0 flex-col items-center gap-0.5 rounded-xl px-1 py-2 text-[0.65rem] font-semibold leading-tight ${
                    active ? "text-blue-700" : "text-slate-500"
                  }`}
                >
                  <span className={`grid h-8 w-8 place-items-center rounded-xl ${active ? "bg-blue-50" : ""}`}>
                    <NavIcon label={item.label} compact />
                  </span>
                  <span className="w-full truncate text-center">{item.label}</span>
                </Link>
              );
            })}
          </div>
        </nav>
      ) : null}
    </>
  );
}

function currentHref(pathname: string, search: string, items: NavItem[], item: NavItem) {
  const current = activeHref(pathname, search, items);
  return current === item.href;
}

function AppNavWithSearch(props: Props) {
  const searchParams = useSearchParams();
  return <AppNavFrame {...props} search={searchParams.toString()} />;
}

export default function AppNav(props: Props) {
  return (
    <Suspense fallback={<AppNavFrame {...props} search="" />}>
      <AppNavWithSearch {...props} />
    </Suspense>
  );
}
