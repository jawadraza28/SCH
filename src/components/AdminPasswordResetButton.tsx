"use client";

import { useState } from "react";

export default function AdminPasswordResetButton({ id, role }: { id: string; role: "student" | "teacher" }) {
  const [loading, setLoading] = useState(false);
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  async function reset() {
    if (!window.confirm("Reset this account password? The current password will stop working.")) return;
    setLoading(true); setError(""); setPassword("");
    try {
      const response = await fetch("/api/admin/password-reset", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id, role }) });
      const result = await response.json();
      if (!response.ok) setError(result.error ?? "Unable to reset password");
      else setPassword(result.temporaryPassword);
    } catch { setError("Unable to connect to the server"); } finally { setLoading(false); }
  }
  return <div className="mt-5 rounded-xl border border-amber-200 bg-amber-50 p-4"><div className="flex flex-wrap items-center justify-between gap-3"><div><p className="text-sm font-semibold text-amber-900">Login password</p><p className="mt-1 text-xs text-amber-700">Only the administrator can reset this account.</p></div><button type="button" onClick={() => void reset()} disabled={loading} className="rounded-lg bg-amber-600 px-3 py-2 text-xs font-semibold text-white disabled:opacity-60">{loading ? "Resetting…" : "Reset password"}</button></div>{password && <p className="mt-3 break-all rounded-lg bg-white px-3 py-2 font-mono text-sm text-amber-900">Temporary password: <strong>{password}</strong></p>}{error && <p className="mt-3 text-xs font-medium text-red-700">{error}</p>}</div>;
}
