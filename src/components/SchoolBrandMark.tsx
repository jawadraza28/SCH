"use client";

import { useEffect, useState } from "react";

type School = { schoolName?: string; schoolIcon?: string; logo?: string };

export default function SchoolBrandMark({ compact = false }: { compact?: boolean }) {
  const [school, setSchool] = useState<School>({});

  useEffect(() => {
    fetch("/api/public/school", { cache: "no-store" })
      .then((response) => (response.ok ? response.json() : null))
      .then((result) => { if (result?.school) setSchool(result.school); })
      .catch((error) => console.error("Unable to load public school branding:", error));
  }, []);

  const name = school.schoolName || "Your School";
  const image = school.schoolIcon || school.logo;
  return (
    <span className={`flex min-w-0 items-center gap-3 ${compact ? "text-sm" : ""}`}>
      <span className="grid h-10 w-10 shrink-0 place-items-center overflow-hidden rounded-xl bg-blue-500 text-lg font-black text-white">
        {image ? <img src={image} alt="" className="h-full w-full object-cover" /> : name.charAt(0).toUpperCase()}
      </span>
      <span className="truncate">{name}</span>
    </span>
  );
}
