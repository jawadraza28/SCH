"use client";

import { useEffect } from "react";
import "./globals.css";
import { ErrorState } from "@/components/ErrorState";
import { THEME_BOOTSTRAP } from "@/lib/theme-config";

/**
 * App-level error boundary for failures thrown while rendering the root layout
 * itself (for example an unhandled server-render crash when MongoDB cannot be
 * reached). Next.js renders this instead of the root layout, so it must supply
 * its own <html>/<body>, its own global styles, and (as the docs note) apply
 * the app theme itself because the layout's anti-flash script never ran.
 */
export default function GlobalError({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  useEffect(() => {
    console.error("Application global error:", error);
  }, [error]);

  return (
    <html lang="en" suppressHydrationWarning>
      <body className="min-h-screen">
        {/* Same theme bootstrap as the root layout, so a global crash stays themed. */}
        <script dangerouslySetInnerHTML={{ __html: THEME_BOOTSTRAP }} />
        <ErrorState
          title="The school app is temporarily unavailable"
          message="We could not reach the school database. Your data is safe — try again in a moment."
          retry={retry}
        />
      </body>
    </html>
  );
}
