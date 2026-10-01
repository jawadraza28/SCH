"use client";

import { useEffect } from "react";
import { ErrorState } from "@/components/ErrorState";

/**
 * Admin route boundary. Errors bubble up to the nearest boundary, so keeping
 * this here means a failed page query shows the retry screen *inside* the
 * dashboard shell — the sidebar stays usable while Atlas reconnects.
 */
export default function DashboardError({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  useEffect(() => {
    console.error("Dashboard route error:", error);
  }, [error]);

  return (
    <ErrorState
      title="The dashboard is temporarily unavailable"
      message="We could not reach the school database. Your data is safe — try again in a moment."
      retry={retry}
    />
  );
}
