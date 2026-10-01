"use client";

import { useEffect } from "react";
import { ErrorState } from "@/components/ErrorState";

/** Student route boundary — keeps the student shell usable during a DB blip. */
export default function StudentError({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  useEffect(() => {
    console.error("Student route error:", error);
  }, [error]);

  return (
    <ErrorState
      title="This page is temporarily unavailable"
      message="We could not reach the school database. Your data is safe — try again in a moment."
      retry={retry}
    />
  );
}
