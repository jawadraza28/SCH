"use client";

import { useEffect, useState } from "react";

type School = { schoolName?: string; logo?: string };

export default function SchoolBrandMark({ compact = false }: { compact?: boolean }) {
  const [school, setSchool] = useState<School>({});
  const [failedLogo, setFailedLogo] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/public/school", { cache: "no-store" })
      .then((response) => (response.ok ? response.json() : null))
      .then((result) => {
        const branding = result?.school as School | undefined;
        if (branding) setSchool(branding);
      })
      .catch((error) => console.error("Unable to load public school branding:", error));
  }, []);

  const name = school.schoolName || "Your School";
  const logo = school.logo && failedLogo !== school.logo ? school.logo : "/logo.png";
  return (
    <span className={`flex min-w-0 items-center gap-3 ${compact ? "text-sm" : ""}`}>
      <span className="grid h-10 w-10 shrink-0 place-items-center overflow-hidden rounded-xl bg-blue-500 text-lg font-black text-white">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={logo} alt="" onError={() => setFailedLogo(logo)} className="h-full w-full object-contain p-1" />
      </span>
      <span className="min-w-0 truncate">{name}</span>
    </span>
  );
}
