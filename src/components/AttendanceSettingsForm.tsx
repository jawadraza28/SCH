"use client";

import { useEffect, useState } from "react";

const weekdays = [
  ["monday", "Monday"],
  ["tuesday", "Tuesday"],
  ["wednesday", "Wednesday"],
  ["thursday", "Thursday"],
  ["friday", "Friday"],
  ["saturday", "Saturday"],
  ["sunday", "Sunday"],
] as const;

type Settings = {
  schoolTimezone: string;
  attendanceStartTime: string;
  attendanceLateAfter: string;
  attendanceAbsentAfter: string;
  attendanceDays: string[];
};

const initialSettings: Settings = {
  schoolTimezone: "Asia/Karachi",
  attendanceStartTime: "07:00",
  attendanceLateAfter: "08:00",
  attendanceAbsentAfter: "09:00",
  attendanceDays: ["monday", "tuesday", "wednesday", "thursday", "friday"],
};

export default function AttendanceSettingsForm() {
  const [settings, setSettings] = useState(initialSettings);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  useEffect(() => {
    fetch("/api/attendance/settings", { cache: "no-store" })
      .then(async (response) => {
        const result = await response.json();
        if (!response.ok) throw new Error(result.error ?? "Unable to load attendance settings");
        if (result.settings) setSettings({ ...initialSettings, ...result.settings });
      })
      .catch((loadError: unknown) => setError(loadError instanceof Error ? loadError.message : "Unable to load attendance settings"))
      .finally(() => setLoading(false));
  }, []);

  function update(key: keyof Omit<Settings, "attendanceDays">, value: string) {
    setSettings((current) => ({ ...current, [key]: value }));
  }

  function toggleDay(day: string) {
    setSettings((current) => ({
      ...current,
      attendanceDays: current.attendanceDays.includes(day)
        ? current.attendanceDays.filter((item) => item !== day)
        : [...current.attendanceDays, day],
    }));
  }

  async function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError("");
    setMessage("");
    try {
      const response = await fetch("/api/attendance/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(settings),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "Unable to save attendance settings");
      setSettings({ ...initialSettings, ...result.settings });
      setMessage("Attendance settings saved.");
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Unable to save attendance settings");
    } finally {
      setSaving(false);
    }
  }

  const inputClass = "mt-2 w-full rounded-xl border border-slate-200 px-3 py-2.5";

  if (loading) return <p className="mt-6 rounded-2xl bg-white p-5 text-sm text-slate-500">Loading attendance settings…</p>;

  return (
    <form onSubmit={save} className="mt-6 space-y-5">
      <section className="rounded-2xl bg-white p-5 shadow-sm sm:p-6">
        <h2 className="font-semibold">Attendance schedule</h2>
        <p className="mt-1 text-sm text-slate-500">Scans before the late time are present; scans at or after it are late. Students without a scan are marked absent at the cutoff.</p>
        <div className="mt-5 grid gap-4 sm:grid-cols-2">
          <label className="text-sm font-medium">School timezone<input required value={settings.schoolTimezone} onChange={(event) => update("schoolTimezone", event.target.value)} placeholder="Asia/Karachi" className={inputClass} /></label>
          <label className="text-sm font-medium">School start time<input required type="time" value={settings.attendanceStartTime} onChange={(event) => update("attendanceStartTime", event.target.value)} className={inputClass} /></label>
          <label className="text-sm font-medium">Late after<input required type="time" value={settings.attendanceLateAfter} onChange={(event) => update("attendanceLateAfter", event.target.value)} className={inputClass} /></label>
          <label className="text-sm font-medium">Mark absent at<input required type="time" value={settings.attendanceAbsentAfter} onChange={(event) => update("attendanceAbsentAfter", event.target.value)} className={inputClass} /></label>
        </div>
        <fieldset className="mt-6">
          <legend className="text-sm font-medium">School days</legend>
          <div className="mt-3 flex flex-wrap gap-2">
            {weekdays.map(([day, label]) => (
              <label key={day} className={`inline-flex cursor-pointer items-center gap-2 rounded-xl border px-3 py-2 text-sm ${settings.attendanceDays.includes(day) ? "border-blue-200 bg-blue-50 text-blue-700" : "border-slate-200 text-slate-600"}`}>
                <input type="checkbox" checked={settings.attendanceDays.includes(day)} onChange={() => toggleDay(day)} />
                {label}
              </label>
            ))}
          </div>
        </fieldset>
      </section>
      {error && <p role="alert" className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>}
      {message && <p role="status" className="rounded-xl bg-emerald-50 px-4 py-3 text-sm text-emerald-700">{message}</p>}
      <button disabled={saving} className="w-full rounded-xl bg-blue-600 px-4 py-3 font-semibold text-white disabled:opacity-60">{saving ? "Saving…" : "Save attendance settings"}</button>
    </form>
  );
}
