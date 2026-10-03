"use client";

import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";

export default function SetupPage() {
  const router = useRouter();
  const [step, setStep] = useState("school-config");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [showAdminPassword, setShowAdminPassword] = useState(false);
  const [checkingSetup, setCheckingSetup] = useState(true);

  const [schoolData, setSchoolData] = useState({
    schoolName: "",
    schoolAddress: "",
    schoolPhone: "",
    schoolEmail: "",
    schoolDescription: "",
    monthlyFee: "",
  });

  const [adminData, setAdminData] = useState({
    adminName: "",
    adminEmail: "",
    adminCNIC: "",
    adminPassword: "",
  });

  useEffect(() => {
    fetch("/api/setup")
      .then((response) => response.json())
      .then((result) => {
        if (result.setupAvailable === false) {
          setError("School setup is already complete. Please sign in as an administrator.");
          setTimeout(() => router.replace("/login"), 1200);
        }
      })
      .catch(() => setError("Unable to verify setup status."))
      .finally(() => setCheckingSetup(false));
  }, [router]);

  const switchStep = (newStep: string) => setStep(newStep);

  /** Shared dark input styling (matches the login screen). */
  const fieldClass =
    "w-full rounded-xl border border-white/10 bg-slate-950 px-4 py-3 text-white transition placeholder:text-slate-500 focus:border-blue-400 focus:ring-2 focus:ring-blue-400/20";

  const handleNext = async (event?: FormEvent<HTMLFormElement>) => {
    event?.preventDefault();
    setError("");
    if (step === "school-config") {
      if (!schoolData.schoolName || !schoolData.schoolEmail) {
        setError("Please fill in the school name and email.");
        return;
      }
      setStep("admin-setup");
      return;
    }
    if (step === "complete") {
      router.replace("/login");
      return;
    }

    setLoading(true);
    try {
      const payload = new FormData();
      Object.entries({ ...schoolData, ...adminData }).forEach(([key, value]) => { if (value !== null) payload.append(key, String(value)); });
      const response = await fetch("/api/setup", {
        method: "POST",
        body: payload,
      });
      const result = await response.json();
      if (!response.ok) {
        setError(result.detail ? `${result.error ?? "Unable to complete setup."} ${result.detail}` : result.error ?? "Unable to complete setup.");
        return;
      }
      setStep("complete");
    } catch {
      setError("Unable to connect to the server. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  if (checkingSetup) return <main className="grid min-h-screen place-items-center bg-slate-950 text-slate-100"><p className="text-sm text-slate-400">Checking setup status…</p></main>;
  return (
    <main className="min-h-screen bg-slate-950 px-4 py-8 text-slate-100 sm:px-6">
      <div className="mx-auto grid min-h-[calc(100vh-4rem)] max-w-5xl overflow-hidden rounded-3xl border border-white/10 bg-slate-900 shadow-2xl lg:grid-cols-[0.85fr_1.15fr]">
        <section className="hidden bg-blue-700 p-10 lg:block"><p className="text-sm font-bold tracking-[0.2em] text-blue-100">SCHOOL OS</p><h1 className="mt-16 text-4xl font-bold leading-tight">Set up your school workspace.</h1><p className="mt-5 leading-7 text-blue-100">Create the school profile and the first administrator. You can configure classes, teachers, and students after signing in.</p><div className="mt-12 space-y-3 text-sm text-blue-100"><p>01 &nbsp; School information</p><p>02 &nbsp; Administrator account</p><p>03 &nbsp; Ready to use</p></div></section>
        <section className="p-6 sm:p-10">
        <div className="mb-8 flex items-center gap-3 text-sm font-bold tracking-wide text-blue-300 lg:hidden"><span className="grid h-10 w-10 place-items-center rounded-xl bg-blue-500 text-lg text-white">S</span>SCHOOL OS</div>
        <p className="text-sm font-semibold uppercase tracking-[0.18em] text-blue-400">First-time setup</p>
        <h2 className="mt-3 text-3xl font-bold tracking-tight text-white">
          {step === "school-config" ? "School Setup" : step === "admin-setup" ? "Admin Setup" : "Setup Complete"}
        </h2>

        {error && (
          <div className="rounded-xl border border-red-400/20 bg-red-400/10 p-4 text-sm text-red-200">
            {error}
          </div>
        )}

        <form onSubmit={handleNext} className="mt-8 space-y-4">
          {step === "school-config" && (
            <div className="space-y-4">
              <h3 className="text-sm font-medium text-slate-300">School Information</h3>
              <div className="grid gap-3 sm:grid-cols-2">
                <input
                  type="text"
                  value={schoolData.schoolName}
                  onChange={(e) =>
                    setSchoolData((prev) => ({ ...prev, schoolName: e.target.value }))
                  }
                  placeholder="School Name"
                  required
                  className={fieldClass}
                />
                <input
                  type="email"
                  value={schoolData.schoolEmail}
                  onChange={(e) =>
                    setSchoolData((prev) => ({ ...prev, schoolEmail: e.target.value }))
                  }
                  placeholder="School Email"
                  required
                  className={fieldClass}
                />
              </div>

              <input
                type="text"
                value={schoolData.schoolAddress}
                onChange={(e) =>
                  setSchoolData((prev) => ({ ...prev, schoolAddress: e.target.value }))
                }
                placeholder="School Address"
                className={fieldClass}
              />

              <input
                type="text"
                value={schoolData.schoolPhone}
                onChange={(e) =>
                  setSchoolData((prev) => ({ ...prev, schoolPhone: e.target.value }))
                }
                placeholder="School Phone"
                className={fieldClass}
              />

              <textarea
                rows={3}
                value={schoolData.schoolDescription}
                onChange={(e) =>
                  setSchoolData((prev) => ({ ...prev, schoolDescription: e.target.value }))
                }
                placeholder="School Description"
                className={fieldClass}
              />
              <div>
                <label className="mb-2 block text-sm font-medium text-slate-300">Monthly Fee (optional)</label>
                <input
                  type="number"
                  value={schoolData.monthlyFee}
                  onChange={(e) =>
                    setSchoolData((prev) => ({ ...prev, monthlyFee: e.target.value }))
                  }
                  placeholder="e.g., 5000"
                  className={fieldClass}
                />
              </div>
            </div>
          )}

          {step === "admin-setup" && (
            <div className="space-y-4">
              <h3 className="text-sm font-medium text-slate-300">Admin Account Information</h3>
              <input
                type="text"
                value={adminData.adminName}
                onChange={(e) =>
                  setAdminData((prev) => ({ ...prev, adminName: e.target.value }))
                }
                placeholder="Admin Name"
                required
                className={fieldClass}
              />
              <input
                type="email"
                value={adminData.adminEmail}
                onChange={(e) =>
                  setAdminData((prev) => ({ ...prev, adminEmail: e.target.value }))
                }
                placeholder="Admin Email"
                required
                className={fieldClass}
              />
              <input
                type="text"
                value={adminData.adminCNIC}
                onChange={(e) =>
                  setAdminData((prev) => ({ ...prev, adminCNIC: e.target.value }))
                }
                placeholder="CNIC (e.g., 42101-1234567-1)"
                required
                className={fieldClass}
              />
              <span className="relative block"><input
                type={showAdminPassword ? "text" : "password"}
                value={adminData.adminPassword}
                onChange={(e) =>
                  setAdminData((prev) => ({ ...prev, adminPassword: e.target.value }))
                }
                placeholder="Admin Password"
                required
                minLength={8}
                className={`${fieldClass} pr-12`}
              /><button type="button" onClick={() => setShowAdminPassword((current) => !current)} className="absolute right-2 top-1/2 grid h-9 w-9 -translate-y-1/2 place-items-center rounded-lg text-slate-500 hover:bg-slate-100" aria-label={showAdminPassword ? "Hide password" : "Show password"}>{showAdminPassword ? "◉" : "◌"}</button></span>
            </div>
          )}

          {step === "admin-setup" && (
            <p className="text-sm text-slate-400">
              The admin account will be created with the details above. <br />
              After login, you&apos;ll be prompted to change your password.
            </p>
          )}

          <div className="mt-6 flex flex-col gap-3 sm:flex-row">
            {step !== "school-config" && (
              <button
                type="button"
                onClick={() => switchStep("school-config")}
                className="flex-1 rounded-xl border border-white/15 px-4 py-3 text-sm text-slate-200 transition hover:bg-white/5"
              >
                Previous
              </button>
            )}
            <button
              type="submit"
              disabled={loading}
              className="flex-1 rounded-xl bg-blue-500 px-4 py-3 font-semibold text-white transition hover:bg-blue-400 disabled:opacity-60"
            >
              {loading ? <span className="inline-flex items-center justify-center gap-2"><span className="spinner" />Please wait…</span> : step === "school-config" ? "Continue to Admin Setup" : step === "admin-setup" ? "Create Account" : "Finish"}
            </button>
          </div>
        </form>
        </section>
      </div>
    </main>
  );
}