import Link from "next/link";

/**
 * App-level 404. Handles both `notFound()` calls from route segments (missing
 * students, etc.) and URLs that match no route at all, so users get a themed,
 * recoverable screen instead of the bare default page.
 */
export default function NotFound() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-100 px-6 text-slate-900">
      <section className="w-full max-w-md rounded-3xl border border-slate-200 bg-white p-8 text-center shadow-sm">
        <div className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-blue-50 text-lg font-bold text-blue-600">
          404
        </div>
        <h1 className="mt-5 text-2xl font-bold">Page not found</h1>
        <p className="mt-3 text-sm leading-6 text-slate-500">
          The page you are looking for does not exist or may have been moved.
        </p>
        <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:justify-center">
          <Link
            href="/"
            className="rounded-xl bg-blue-600 px-5 py-3 text-sm font-semibold text-white hover:bg-blue-500"
          >
            Go to home
          </Link>
        </div>
      </section>
    </main>
  );
}
