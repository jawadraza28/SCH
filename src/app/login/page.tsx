"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";

type Role = "admin" | "teacher" | "student";

const roles: { value: Role; label: string; description: string }[] = [
  { value: "admin", label: "Administrator", description: "Manage your school" },
  { value: "teacher", label: "Teacher", description: "Manage your classes" },
  { value: "student", label: "Student", description: "View your learning" },
];

export default function LoginPage() {
  const router = useRouter();
  const [role, setRole] = useState<Role>("admin");
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setLoading(true);

    try {
      const response = await fetch("/api/auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ identifier, password, role }),
      });
      const result = await response.json();

      if (!response.ok) {
        setError(result.detail ? `${result.error ?? "Unable to sign in."} ${result.detail}` : result.error ?? "Unable to sign in. Please try again.");
        return;
      }

      router.replace(result.user?.role === "teacher" ? "/teacher" : result.user?.role === "student" ? "/student" : "/dashboard");
      router.refresh();
    } catch {
      setError("Unable to connect to the server. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="min-h-screen bg-slate-950 px-4 py-8 text-slate-100 sm:px-6 lg:px-8">
      <div className="mx-auto grid min-h-[calc(100vh-4rem)] max-w-6xl overflow-hidden rounded-3xl border border-white/10 bg-slate-900 shadow-2xl lg:grid-cols-[1.05fr_0.95fr]">
        <section className="relative hidden overflow-hidden bg-blue-700 p-12 lg:flex lg:flex-col lg:justify-between">
          <div className="absolute -right-24 -top-24 h-72 w-72 rounded-full bg-cyan-300/20 blur-3xl" />
          <div className="relative">
            <div className="mb-10 flex items-center gap-3 text-sm font-semibold tracking-wide text-blue-100">
              <span className="grid h-10 w-10 place-items-center rounded-xl bg-white text-lg font-black text-blue-700">S</span>
              SCHOOL OS
            </div>
            <p className="max-w-md text-sm font-semibold uppercase tracking-[0.24em] text-blue-200">One clear place for every school day</p>
            <h1 className="mt-5 max-w-lg text-5xl font-bold leading-tight tracking-tight text-white">Run your school with confidence.</h1>
            <p className="mt-6 max-w-md text-lg leading-8 text-blue-100">Attendance, results, fees, classes, and communication in one calm workspace.</p>
          </div>
          <p className="relative text-sm text-blue-200">Secure, focused, and ready for your school.</p>
        </section>

        <section className="flex items-center justify-center p-6 sm:p-12">
          <div className="w-full max-w-md">
            <div className="mb-8 lg:hidden">
              <div className="flex items-center gap-3 text-sm font-semibold tracking-wide text-blue-300"><span className="grid h-10 w-10 place-items-center rounded-xl bg-blue-500 text-lg font-black text-white">S</span> SCHOOL OS</div>
            </div>
            <p className="text-sm font-semibold uppercase tracking-[0.2em] text-blue-400">Welcome back</p>
            <h2 className="mt-3 text-3xl font-bold tracking-tight text-white">Sign in to your school</h2>
            <p className="mt-2 text-slate-400">Choose your account type to continue.</p>

            <div className="mt-8 grid gap-2 sm:grid-cols-3">
              {roles.map((item) => (
                <button key={item.value} type="button" onClick={() => setRole(item.value)} className={`rounded-xl border p-3 text-left transition ${role === item.value ? "border-blue-400 bg-blue-500/15 text-white" : "border-white/10 text-slate-400 hover:border-white/25 hover:text-white"}`}>
                  <span className="block text-sm font-semibold">{item.label}</span>
                  <span className="mt-1 block text-xs leading-4 opacity-70">{item.description}</span>
                </button>
              ))}
            </div>

            <form onSubmit={handleSubmit} className="mt-8 space-y-5">
              <label className="block text-sm font-medium text-slate-300">
                {role === "student" ? "CNIC" : "Email or CNIC"}
                <input value={identifier} onChange={(event) => setIdentifier(event.target.value)} required autoComplete="username" className="mt-2 w-full rounded-xl border border-white/10 bg-slate-950 px-4 py-3 text-white outline-none transition placeholder:text-slate-600 focus:border-blue-400 focus:ring-2 focus:ring-blue-400/20" placeholder={role === "student" ? "42101-1234567-1" : "teacher@school.com or CNIC"} />
              </label>
              <label className="block text-sm font-medium text-slate-300">
                Password
                <input type="password" value={password} onChange={(event) => setPassword(event.target.value)} required autoComplete="current-password" className="mt-2 w-full rounded-xl border border-white/10 bg-slate-950 px-4 py-3 text-white outline-none transition placeholder:text-slate-600 focus:border-blue-400 focus:ring-2 focus:ring-blue-400/20" placeholder="Enter your password" />
              </label>
              {error && <p role="alert" className="rounded-xl border border-red-400/20 bg-red-400/10 px-4 py-3 text-sm text-red-200">{error}</p>}
              <button type="submit" disabled={loading} className="w-full rounded-xl bg-blue-500 px-4 py-3.5 font-semibold text-white transition hover:bg-blue-400 disabled:cursor-not-allowed disabled:opacity-60">{loading ? <span className="inline-flex items-center justify-center gap-2"><span className="spinner" />Signing in…</span> : "Sign in"}</button>
            </form>
            <p className="mt-8 text-center text-sm text-slate-500">Need to configure a new school? <a className="font-medium text-blue-400 hover:text-blue-300" href="/setup">Start setup</a></p>
          </div>
        </section>
      </div>
    </main>
  );
}
