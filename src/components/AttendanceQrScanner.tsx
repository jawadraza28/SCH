"use client";

import { FormEvent, useEffect, useRef, useState } from "react";

type ScanResult = {
  success?: boolean;
  error?: string;
  duplicate?: boolean;
  status?: "present" | "late" | "absent" | "leave" | "holiday";
  checkInAt?: string;
  student?: { name: string; classSection: string; rollNumber: string };
};

const statusStyles: Record<string, string> = {
  present: "bg-emerald-50 text-emerald-700",
  late: "bg-amber-50 text-amber-700",
  absent: "bg-rose-50 text-rose-700",
  leave: "bg-violet-50 text-violet-700",
  holiday: "bg-slate-100 text-slate-700",
};

export default function AttendanceQrScanner() {
  const scannerRef = useRef<import("html5-qrcode").Html5Qrcode | null>(null);
  const processingRef = useRef(false);
  const lastScannedRef = useRef({ token: "", at: 0 });
  const scanQueueRef = useRef<string[]>([]);
  const scanTimerRef = useRef<number | null>(null);
  const tokenInputRef = useRef<HTMLInputElement>(null);
  const [cameraActive, setCameraActive] = useState(false);
  const [tokenInput, setTokenInput] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [lastResult, setLastResult] = useState<ScanResult | null>(null);

  async function submitToken(value: string, fromQueue = false) {
    const token = value.trim();
    if (!token) return;
    const now = Date.now();
    if (!fromQueue && lastScannedRef.current.token === token && now - lastScannedRef.current.at < 3000) return;
    if (!fromQueue) lastScannedRef.current = { token, at: now };
    if (processingRef.current) {
      scanQueueRef.current.push(token);
      setTokenInput("");
      return;
    }
    processingRef.current = true;
    setTokenInput("");
    setError("");
    setMessage("");
    try {
      const response = await fetch("/api/attendance/scan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token }),
      });
      const result = await response.json() as ScanResult;
      if (!response.ok) {
        setLastResult(null);
        setError(result.error ?? "Unable to record attendance");
        return;
      }
      setLastResult(result);
      setMessage(result.duplicate ? "This student has already been scanned today." : "Attendance recorded.");
    } catch {
      setError("Unable to connect to the attendance server");
    } finally {
      processingRef.current = false;
      tokenInputRef.current?.focus();
      const nextToken = scanQueueRef.current.shift();
      if (nextToken) void submitToken(nextToken, true);
    }
  }

  function updateUsbToken(value: string) {
    setTokenInput(value);
    if (scanTimerRef.current !== null) window.clearTimeout(scanTimerRef.current);
    if (/^[\da-f]{8}-(?:[\da-f]{4}-){3}[\da-f]{12}$/i.test(value.trim())) {
      scanTimerRef.current = window.setTimeout(() => void submitToken(value), 200);
    }
  }

  async function startCamera() {
    setError("");
    try {
      const { Html5Qrcode, Html5QrcodeSupportedFormats } = await import("html5-qrcode");
      const scanner = new Html5Qrcode("attendance-qr-reader", {
        formatsToSupport: [Html5QrcodeSupportedFormats.QR_CODE],
        verbose: false,
      });
      scannerRef.current = scanner;
      await scanner.start(
        { facingMode: "environment" },
        { fps: 10, qrbox: { width: 240, height: 240 } },
        (decodedText) => void submitToken(decodedText),
        () => undefined,
      );
      setCameraActive(true);
    } catch (cameraError) {
      console.error("Attendance camera start error:", cameraError);
      setError("Could not start the camera. Allow camera access, use HTTPS, or scan with a USB QR reader.");
      scannerRef.current = null;
    }
  }

  async function stopCamera() {
    const scanner = scannerRef.current;
    if (!scanner) return;
    try {
      if (scanner.isScanning) await scanner.stop();
      scanner.clear();
      scannerRef.current = null;
      setCameraActive(false);
    } catch (cameraError) {
      console.error("Attendance camera stop error:", cameraError);
      setError("Unable to stop the camera cleanly. Please reload this page.");
    }
  }

  useEffect(() => {
    let active = true;
    async function finalizeAttendance() {
      try {
        const response = await fetch("/api/attendance/finalize", { method: "POST" });
        const result = await response.json() as { error?: string; markedAbsent?: number; skipped?: string | null };
        if (!response.ok) throw new Error(result.error ?? "Unable to finalize attendance");
        if (active && result.markedAbsent) setMessage(`${result.markedAbsent} student${result.markedAbsent === 1 ? "" : "s"} marked absent after the cutoff.`);
      } catch (finalizeError) {
        console.error("Attendance finalization error:", finalizeError);
        if (active) setError(finalizeError instanceof Error ? finalizeError.message : "Unable to finalize attendance");
      }
    }
    void finalizeAttendance();
    const interval = window.setInterval(() => void finalizeAttendance(), 60_000);
    return () => {
      active = false;
      window.clearInterval(interval);
      if (scanTimerRef.current !== null) window.clearTimeout(scanTimerRef.current);
      const scanner = scannerRef.current;
      if (scanner?.isScanning) void scanner.stop().catch((cameraError) => console.error("Attendance camera cleanup error:", cameraError));
    };
  }, []);

  function submitUsbScan(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (scanTimerRef.current !== null) window.clearTimeout(scanTimerRef.current);
    void submitToken(tokenInput);
  }

  return (
    <div className="mt-6 grid gap-5 lg:grid-cols-[minmax(0,1.2fr)_minmax(18rem,0.8fr)]">
      <section className="rounded-2xl bg-white p-4 shadow-sm sm:p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="font-semibold">QR reader ready</h2>
            <p className="mt-1 text-sm text-slate-500">Connect a USB or wireless keyboard-style scanner and scan a student card.</p>
          </div>
          {cameraActive
            ? <button type="button" onClick={() => void stopCamera()} className="rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-700">Stop camera</button>
            : <button type="button" onClick={() => void startCamera()} className="rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white">Start camera</button>}
        </div>
        <div id="attendance-qr-reader" className="mt-4 min-h-64 overflow-hidden rounded-xl border border-dashed border-slate-300 bg-slate-50" />
        <form onSubmit={submitUsbScan} className="mt-4 flex flex-col gap-2 sm:flex-row">
          <label className="sr-only" htmlFor="attendance-qr-token">USB QR reader input</label>
          <input
            id="attendance-qr-token"
            ref={tokenInputRef}
            autoFocus
            autoComplete="off"
            value={tokenInput}
            onChange={(event) => updateUsbToken(event.target.value)}
            onFocus={() => {
              if (scanTimerRef.current !== null) window.clearTimeout(scanTimerRef.current);
            }}
            placeholder="Scanner input — ready for the next card"
            className="min-w-0 flex-1 rounded-xl border border-slate-200 px-3 py-3 text-sm"
          />
          <button type="submit" disabled={!tokenInput.trim()} className="rounded-xl bg-slate-900 px-4 py-3 text-sm font-semibold text-white disabled:opacity-50">Record manually</button>
        </form>
        <p className="mt-2 text-xs text-slate-400">Scans submit automatically when the reader sends Enter or finishes typing the QR token. Keep this page open and signed in on the connected computer.</p>
        {error && <p role="alert" className="mt-4 rounded-xl bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</p>}
        {message && <p role="status" className="mt-4 rounded-xl bg-blue-50 px-4 py-3 text-sm text-blue-700">{message}</p>}
      </section>

      <section className="rounded-2xl bg-white p-4 shadow-sm sm:p-6">
        <h2 className="font-semibold">Latest scan</h2>
        {lastResult?.student ? (
          <div className="mt-4 rounded-xl border border-slate-100 p-4">
            <p className="text-lg font-bold text-slate-900">{lastResult.student.name}</p>
            <p className="mt-1 text-sm text-slate-500">{lastResult.student.classSection} · Roll {lastResult.student.rollNumber}</p>
            <span className={`mt-4 inline-flex rounded-full px-3 py-1 text-sm font-semibold capitalize ${statusStyles[lastResult.status ?? ""] ?? "bg-slate-100 text-slate-700"}`}>
              {lastResult.status ?? "recorded"}
            </span>
            {lastResult.checkInAt && <p className="mt-3 text-sm text-slate-500">Scanned at {new Date(lastResult.checkInAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</p>}
          </div>
        ) : (
          <p className="mt-4 rounded-xl bg-slate-50 p-4 text-sm text-slate-500">A student’s name and attendance result will appear here after scanning.</p>
        )}
        <p className="mt-5 text-xs leading-5 text-slate-400">Keep this page open at the school entrance. It checks the absence cutoff once per minute and marks students without a scan as absent on scheduled school days.</p>
      </section>
    </div>
  );
}
