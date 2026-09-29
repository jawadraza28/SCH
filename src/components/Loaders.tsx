/**
 * Shared loading UI: shimmer skeletons shown while data is fetched from the
 * database, plus a full-page loader used by the route-level loading.tsx files.
 *
 * Server-safe (no hooks) so it can be imported from loading.tsx files too.
 * All colors come from theme variables, so every loader adapts to all 7 themes.
 */

/** Small inline spinner (uses currentColor — works on any button/label). */
export function Spinner({ className = "" }: { className?: string }) {
  return <span className={`spinner ${className}`} aria-hidden="true" />;
}

/** Shimmering placeholder block. Size it with Tailwind (h-*, w-*, rounded-*). */
export function Skeleton({ className = "" }: { className?: string }) {
  return <span className={`skeleton ${className}`} aria-hidden="true" />;
}

/** Centered full-page loader for route transitions (used by loading.tsx). */
export function PageLoader({ label = "Loading" }: { label?: string }) {
  return (
    <div className="grid min-h-screen place-items-center bg-slate-100 px-4">
      <div className="flex flex-col items-center gap-4">
        <span className="grid h-14 w-14 place-items-center rounded-2xl bg-white shadow-lg">
          <Spinner className="spinner-lg" />
        </span>
        <p className="text-sm font-semibold text-slate-500">{label}…</p>
      </div>
    </div>
  );
}

/** Skeleton in the shape of a data table (used inside a card). */
export function TableSkeleton({ rows = 6, className = "" }: { rows?: number; className?: string }) {
  return (
    <section className={`overflow-hidden rounded-2xl bg-white shadow-sm ${className}`}>
      <div className="flex items-center justify-between gap-4 border-b border-slate-100 px-6 py-4">
        <Skeleton className="h-4 w-44 rounded-full" />
        <Skeleton className="h-8 w-28 rounded-lg" />
      </div>
      <div className="divide-y divide-slate-100">
        {Array.from({ length: rows }).map((_, index) => (
          <div key={index} className="flex items-center gap-4 px-6 py-4">
            <Skeleton className="h-9 w-9 shrink-0 rounded-full" />
            <div className="min-w-0 flex-1 space-y-2">
              <Skeleton className="h-3.5 w-1/3 rounded-full" />
              <Skeleton className="h-3 w-1/4 rounded-full" />
            </div>
            <Skeleton className="h-6 w-16 rounded-full" />
          </div>
        ))}
      </div>
    </section>
  );
}

/** Skeleton in the shape of a stacked card list. */
export function ListSkeleton({ rows = 4, className = "" }: { rows?: number; className?: string }) {
  return (
    <div className={`space-y-3 ${className}`}>
      {Array.from({ length: rows }).map((_, index) => (
        <div key={index} className="rounded-2xl bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between gap-4">
            <div className="min-w-0 flex-1 space-y-2">
              <Skeleton className="h-4 w-44 max-w-full rounded-full" />
              <Skeleton className="h-3 w-64 max-w-full rounded-full" />
            </div>
            <div className="hidden shrink-0 gap-2 sm:flex">
              <Skeleton className="h-9 w-20 rounded-xl" />
              <Skeleton className="h-9 w-20 rounded-xl" />
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

/** Skeleton in the shape of an edit/create form card. */
export function FormSkeleton({ fields = 5, className = "" }: { fields?: number; className?: string }) {
  return (
    <div className={`rounded-2xl bg-white p-6 shadow-sm sm:p-8 ${className}`}>
      <Skeleton className="h-5 w-40 rounded-full" />
      <div className="mt-6 grid gap-5 sm:grid-cols-2">
        {Array.from({ length: fields * 2 }).map((_, index) => (
          <div key={index} className={`space-y-2 ${index === 0 ? "sm:col-span-2" : ""}`}>
            <Skeleton className="h-3.5 w-24 rounded-full" />
            <Skeleton className="h-11 w-full rounded-xl" />
          </div>
        ))}
      </div>
      <Skeleton className="mt-6 h-11 w-36 rounded-xl" />
    </div>
  );
}

/** Bare skeleton rows for use *inside* an existing card/section. */
export function SkeletonRows({ rows = 5, className = "" }: { rows?: number; className?: string }) {
  return (
    <div className={`space-y-5 ${className}`}>
      {Array.from({ length: rows }).map((_, index) => (
        <div key={index} className="flex items-center gap-4">
          <Skeleton className="h-9 w-9 shrink-0 rounded-full" />
          <div className="min-w-0 flex-1 space-y-2">
            <Skeleton className="h-3.5 w-1/3 rounded-full" />
            <Skeleton className="h-3 w-1/2 rounded-full" />
          </div>
          <Skeleton className="h-6 w-16 rounded-full" />
        </div>
      ))}
    </div>
  );
}
