"use client";

/**
 * Shared retryable error screen.
 *
 * Every error boundary in the app renders this — the app-level
 * `app/error.tsx`, the root `app/global-error.tsx`, and the
 * dashboard/student/teacher route boundaries — so a transient MongoDB/Atlas or
 * Vercel outage shows a recoverable screen instead of a raw server error page.
 *
 * `retry` is the Next.js 16 error-boundary prop: it re-fetches and re-renders
 * the failed segment (internally `router.refresh()`), which is what actually
 * recovers a request that failed because the database was still waking up. The
 * second button performs a hard reload for when the RSC payload itself is stale.
 */
export function ErrorState({
  title = "This page is temporarily unavailable",
  message = "The school database may be waking up or briefly reconnecting. Try again in a moment.",
  retry,
}: {
  title?: string;
  message?: string;
  retry?: () => void;
}) {
  return (
    <main
      role="alert"
      className="flex min-h-screen items-center justify-center bg-slate-100 px-6 text-slate-900"
    >
      <section className="w-full max-w-md rounded-3xl border border-slate-200 bg-white p-8 text-center shadow-sm">
        <div className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-amber-50 text-2xl font-bold text-amber-600">
          !
        </div>
        <h1 className="mt-5 text-2xl font-bold">{title}</h1>
        <p className="mt-3 text-sm leading-6 text-slate-500">{message}</p>
        <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:justify-center">
          {retry ? (
            <button
              type="button"
              onClick={() => retry()}
              className="rounded-xl bg-blue-600 px-5 py-3 text-sm font-semibold text-white hover:bg-blue-500"
            >
              Try again
            </button>
          ) : null}
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="rounded-xl border border-slate-200 px-5 py-3 text-sm font-semibold text-slate-700 hover:bg-slate-50"
          >
            Reload page
          </button>
        </div>
      </section>
    </main>
  );
}
