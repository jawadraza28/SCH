"use client";

import { useEffect, useState } from "react";

type School = { schoolName?: string };

let schoolRequest: Promise<School | null> | null = null;

export default function SchoolBrandMark({ compact = false }: { compact?: boolean }) {
  const [school, setSchool] = useState<School>({});

  useEffect(() => {
    try {
      const cached = JSON.parse(localStorage.getItem("public-school-branding") || "{}");
      if (cached.schoolName) setSchool(cached);
    } catch {
      // Ignore an unavailable or malformed browser cache and use the API.
    }
    schoolRequest ??= fetch("/api/public/school")
      .then((response) => (response.ok ? response.json() : null))
      .then((result) => result?.school ?? null);
    schoolRequest
      .then((result) => {
        if (result?.schoolName) {
          setSchool(result);
          localStorage.setItem("public-school-branding", JSON.stringify(result));
        }
      })
      .catch((error) => console.error("Unable to load public school branding:", error));
  }, []);

  const name = school.schoolName || "Your School";
  return (
    <span className={`flex min-w-0 items-center gap-3 ${compact ? "text-sm" : ""}`}>
      <span className="grid h-10 w-10 shrink-0 place-items-center overflow-hidden rounded-xl bg-blue-500 text-lg font-black text-white">
        <img src="/logo.png" alt="" className="h-full w-full object-cover" />
      </span>
      <span className="min-w-0 truncate">{name}</span>
    </span>
  );
}
