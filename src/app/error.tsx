"use client";

import { useEffect } from "react";
import { ErrorState } from "@/components/ErrorState";

export default function AppError({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  useEffect(() => {
    console.error("Application route error:", error);
  }, [error]);

  return <ErrorState retry={retry} />;
}
