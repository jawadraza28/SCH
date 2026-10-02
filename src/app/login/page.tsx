"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import SchoolBrandMark from "@/components/SchoolBrandMark";

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
  const [showPassword, setShowPassword] = useState(false);
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
    <main className="min-h-screen bg-slate-950 px-4 py-5 text-slate-100 sm:px-6 lg:px-8">
      <nav className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-1 py-2 sm:px-2">
        <Link href="/" className="text-white"><SchoolBrandMark compact /></Link>
        <div className="flex items-center gap-1 sm:gap-2"><Link href="/" className="rounded-xl px-3 py-2 text-sm font-medium text-slate-300 hover:bg-white/10 hover:text-white">Home</Link><Link href="/about-us" className="hidden rounded-xl px-3 py-2 text-sm font-medium text-slate-300 hover:bg-white/10 hover:text-white sm:block">About us</Link><Link href="/contact" className="rounded-xl px-3 py-2 text-sm font-medium text-slate-300 hover:bg-white/10 hover:text-white">Contact</Link></div>
      </nav>
      <div className="mx-auto grid min-h-[calc(100vh-6rem)] max-w-6xl overflow-hidden rounded-3xl border border-white/10 bg-slate-900 shadow-2xl lg:grid-cols-[1.05fr_0.95fr]">
        <section className="relative hidden overflow-hidden bg-blue-700 p-12 lg:flex lg:flex-col lg:justify-between">
          <div className="absolute -right-24 -top-24 h-72 w-72 rounded-full bg-cyan-300/20 blur-3xl" />
          <div className="relative">
            <div className="mb-10 text-blue-100"><SchoolBrandMark compact /></div>
            <p className="max-w-md text-sm font-semibold uppercase tracking-[0.24em] text-blue-200">One clear place for every school day</p>
            <h1 className="mt-5 max-w-lg text-5xl font-bold leading-tight tracking-tight text-white">Run your school with confidence.</h1>
            <p className="mt-6 max-w-md text-lg leading-8 text-blue-100">Attendance, results, fees, classes, and communication in one calm workspace.</p>
          </div>
          <p className="relative text-sm text-blue-200">Secure, focused, and ready for your school.</p>
        </section>

        <section className="flex items-center justify-center p-6 sm:p-12">
          <div className="w-full max-w-md">
            <div className="mb-8 lg:hidden">
              <div className="text-blue-300"><SchoolBrandMark compact /></div>
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
                <span className="relative mt-2 block"><input type={showPassword ? "text" : "password"} value={password} onChange={(event) => setPassword(event.target.value)} required autoComplete="current-password" className="w-full rounded-xl border border-white/10 bg-slate-950 px-4 py-3 pr-12 text-white outline-none transition placeholder:text-slate-600 focus:border-blue-400 focus:ring-2 focus:ring-blue-400/20" placeholder="Enter your password" /><button type="button" onClick={() => setShowPassword((current) => !current)} aria-label={showPassword ? "Hide password" : "Show password"} className="absolute right-2 top-1/2 grid h-9 w-9 -translate-y-1/2 place-items-center rounded-lg text-slate-400 hover:bg-white/10 hover:text-white">{showPassword ? <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M3 3l18 18M10.6 10.6a2 2 0 0 0 2.8 2.8M9.9 4.2A10.7 10.7 0 0 1 12 4c5 0 8.5 4 9.5 6a11.5 11.5 0 0 1-3.2 3.8M6.2 6.2C4.4 7.4 3.2 9 2.5 10c1 2 4.5 6 9.5 6 1 0 2-.2 2.8-.5" /></svg> : <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M2.5 12S6 6 12 6s9.5 6 9.5 6S18 18 12 18s-9.5-6-9.5-6Z" /><circle cx="12" cy="12" r="2.5" /></svg>}</button></span>
              </label>
              {error && <p role="alert" className="rounded-xl border border-red-400/20 bg-red-400/10 px-4 py-3 text-sm text-red-200">{error}</p>}
              <button type="submit" disabled={loading} className="w-full rounded-xl bg-blue-500 px-4 py-3.5 font-semibold text-white transition hover:bg-blue-400 disabled:cursor-not-allowed disabled:opacity-60">{loading ? <span className="inline-flex items-center justify-center gap-2"><span className="spinner" />Signing in…</span> : "Sign in"}</button>
            </form>
          </div>
        </section>
      </div>
    </main>
  );
}
