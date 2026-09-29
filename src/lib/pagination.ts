// Shared helpers for loading lists in pages (one page of rows at a time instead
// of whole collections, so MongoDB responds much faster on large schools).

export const DEFAULT_PAGE_SIZE = 20;
export const MAX_PAGE_SIZE = 100;

/** First valid page for `?page=...` (1 when missing or invalid). */
export function parsePageNumber(raw: string | null | undefined): number {
  const value = Number.parseInt(raw ?? "", 10);
  return Number.isFinite(value) && value > 0 ? value : 1;
}

/** Row limit for `?limit=...`, clamped between 1 and MAX_PAGE_SIZE. */
export function parsePageSize(raw: string | null | undefined, fallback = DEFAULT_PAGE_SIZE): number {
  const value = Number.parseInt(raw ?? "", 10);
  if (!Number.isFinite(value) || value <= 0) return fallback;
  return Math.min(value, MAX_PAGE_SIZE);
}

/** Total pages for a result set (always at least 1). */
export function countPages(total: number, limit: number): number {
  return Math.max(1, Math.ceil(total / Math.max(1, limit)));
}

/** Keeps the requested page inside the valid range after filtering. */
export function clampPage(page: number, pages: number): number {
  return Math.min(Math.max(1, page), Math.max(1, pages));
}

export type PageItem = number | "gap";

/**
 * Compact page-number window with gap markers, e.g.
 * [1, "gap", 4, 5, 6, 7, "gap", 20].
 */
export function pageWindow(page: number, pages: number): PageItem[] {
  if (pages <= 7) return Array.from({ length: pages }, (_, index) => index + 1);
  const wanted = new Set<number>([1, pages, page - 1, page, page + 1]);
  if (page <= 3) [2, 3, 4].forEach((number) => wanted.add(number));
  if (page >= pages - 2) [pages - 3, pages - 2, pages - 1].forEach((number) => wanted.add(number));
  const sorted = [...wanted].filter((number) => number >= 1 && number <= pages).sort((a, b) => a - b);
  const items: PageItem[] = [];
  let previous = 0;
  for (const number of sorted) {
    if (previous && number - previous > 1) items.push("gap");
    items.push(number);
    previous = number;
  }
  return items;
}

/** "21-40" style label for the rows currently visible. */
export function rangeLabel(page: number, limit: number, total: number): string {
  if (total <= 0) return "";
  const from = (page - 1) * limit + 1;
  const to = Math.min(total, page * limit);
  return `${from}-${to}`;
}
