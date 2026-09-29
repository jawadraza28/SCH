import Link from "next/link";
import type { ReactNode } from "react";
import { pageWindow } from "@/lib/pagination";

type Props = {
  page: number;
  pages: number;
  /** Client pages: called with the target page number. */
  onPageChange?: (page: number) => void;
  /** Server pages: builds the URL for the target page. */
  hrefFor?: (page: number) => string;
  className?: string;
};

const base = "inline-flex h-9 min-w-9 items-center justify-center rounded-lg border px-3 text-sm font-semibold transition-colors";
const idle = "border-slate-200 bg-white text-slate-600 hover:border-blue-300 hover:text-blue-700";
const current = "border-blue-600 bg-blue-600 text-white";
const off = "border-slate-100 bg-white text-slate-300";

// Shared pager for server pages (hrefFor builds ?page=... links) and client
// pages (onPageChange refetches). Renders nothing when everything fits on one page.
export default function Pagination({ page, pages, onPageChange, hrefFor, className = "" }: Props) {
  if (pages <= 1) return null;
  const items = pageWindow(page, pages);

  function control(target: number, content: ReactNode, options?: { active?: boolean; disabled?: boolean; label?: string }) {
    const isCurrent = options?.active ?? false;
    const isDisabled = options?.disabled ?? false;
    const classes = `${base} ${isDisabled ? off : isCurrent ? current : idle}`;
    const attrs = { "aria-label": options?.label, "aria-current": isCurrent ? "page" : undefined } as const;
    if (!isDisabled && onPageChange) {
      return <button type="button" className={classes} onClick={() => onPageChange(target)} {...attrs}>{content}</button>;
    }
    if (!isDisabled && hrefFor) {
      return <Link href={hrefFor(target)} className={classes} prefetch={false} {...attrs}>{content}</Link>;
    }
    return <span className={classes} {...attrs}>{content}</span>;
  }

  return (
    <nav aria-label="Pagination" className={`flex flex-wrap items-center justify-end gap-2 ${className}`}>
      {control(page - 1, "Prev", { disabled: page <= 1, label: "Previous page" })}
      {items.map((item, index) =>
        item === "gap" ? (
          <span key={`gap-${index}`} className="px-1 text-sm text-slate-400" aria-hidden="true">…</span>
        ) : (
          <span key={item}>{control(item, String(item), { active: item === page, label: `Page ${item}` })}</span>
        ),
      )}
      {control(page + 1, "Next", { disabled: page >= pages, label: "Next page" })}
    </nav>
  );
}
