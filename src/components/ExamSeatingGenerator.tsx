"use client";

import { useMemo, useState, useSyncExternalStore } from "react";
import { Printer, RefreshCw, Save, Trash2 } from "lucide-react";
import { buildSeatingPlan, type ExamStudent } from "@/lib/exam-seating";

type SeatingPreset = {
  id: string;
  name: string;
  fromClass: number;
  toClass: number;
  roomCount: number;
  seatsPerRoom: number;
};

const PRESETS_STORAGE_KEY = "school-exam-seating-presets";
const EMPTY_PRESETS: SeatingPreset[] = [];
let cachedPresetText: string | null = null;
let cachedPresets: SeatingPreset[] = EMPTY_PRESETS;

function getPresetSnapshot() {
  try {
    const saved = localStorage.getItem(PRESETS_STORAGE_KEY);
    if (saved !== cachedPresetText) {
      cachedPresetText = saved;
      const parsed: unknown = saved ? JSON.parse(saved) : [];
      cachedPresets = Array.isArray(parsed) ? parsed as SeatingPreset[] : EMPTY_PRESETS;
    }
  } catch {
    cachedPresets = EMPTY_PRESETS;
  }
  return cachedPresets;
}

function subscribePresets(onChange: () => void) {
  window.addEventListener("storage", onChange);
  window.addEventListener("exam-seating-presets-changed", onChange);
  return () => {
    window.removeEventListener("storage", onChange);
    window.removeEventListener("exam-seating-presets-changed", onChange);
  };
}

function getServerPresetSnapshot() {
  return EMPTY_PRESETS;
}

function savePresets(presets: SeatingPreset[]) {
  try {
    localStorage.setItem(PRESETS_STORAGE_KEY, JSON.stringify(presets));
    cachedPresetText = null;
    window.dispatchEvent(new Event("exam-seating-presets-changed"));
    return true;
  } catch {
    return false;
  }
}

export default function ExamSeatingGenerator({
  students,
  availableClasses,
}: {
  students: ExamStudent[];
  availableClasses: number[];
}) {
  const [fromClass, setFromClass] = useState<number>(availableClasses[0] ?? 1);
  const [toClass, setToClass] = useState<number>(availableClasses[availableClasses.length - 1] ?? 10);
  const [roomCount, setRoomCount] = useState<number>(Math.max(1, Math.ceil(students.length / 20)));
  const [seatsPerRoom, setSeatsPerRoom] = useState<number>(20);
  const [seed, setSeed] = useState<number>(1);
  const [examTitle, setExamTitle] = useState("Exam seating plan");
  const [presetName, setPresetName] = useState("");
  const [selectedPresetId, setSelectedPresetId] = useState("");
  const [view, setView] = useState<"rooms" | "classes">("rooms");
  const presets = useSyncExternalStore(subscribePresets, getPresetSnapshot, getServerPresetSnapshot);

  const selectedStudents = useMemo(
    () => students.filter((student) => {
      const classNumber = Number.parseInt(student.class, 10);
      return Number.isFinite(classNumber) && classNumber >= fromClass && classNumber <= toClass;
    }),
    [students, fromClass, toClass],
  );

  const rooms = useMemo(
    () => buildSeatingPlan(selectedStudents, roomCount, seatsPerRoom, fromClass, toClass, seed),
    [selectedStudents, roomCount, seatsPerRoom, fromClass, toClass, seed],
  );

  const classWiseSeats = useMemo(
    () => rooms.flatMap((room) => room.seats.map((seat) => ({ ...seat, roomName: room.name })))
      .sort((left, right) => Number.parseInt(left.student.class, 10) - Number.parseInt(right.student.class, 10)
        || left.student.section.localeCompare(right.student.section, undefined, { numeric: true })
        || (left.student.rollNumber ?? "").localeCompare(right.student.rollNumber ?? "", undefined, { numeric: true })),
    [rooms],
  );

  function persistCurrentPreset() {
    const name = presetName.trim();
    if (!name) return;
    const preset: SeatingPreset = {
      id: String(Date.now()),
      name,
      fromClass,
      toClass,
      roomCount,
      seatsPerRoom,
    };
    if (!savePresets([...presets.filter((item) => item.name.toLowerCase() !== name.toLowerCase()), preset])) {
      window.alert("Unable to save this preset in browser storage.");
      return;
    }
    setSelectedPresetId(preset.id);
    setPresetName("");
  }

  function loadPreset(id: string) {
    setSelectedPresetId(id);
    const preset = presets.find((item) => item.id === id);
    if (!preset) return;
    setFromClass(preset.fromClass);
    setToClass(preset.toClass);
    setRoomCount(preset.roomCount);
    setSeatsPerRoom(preset.seatsPerRoom);
    setSeed((current) => current + 1);
  }

  function deleteSelectedPreset() {
    if (!selectedPresetId) return;
    savePresets(presets.filter((item) => item.id !== selectedPresetId));
    setSelectedPresetId("");
  }

  const viewButtonClass = (active: boolean) => `rounded-lg px-3 py-2 text-sm font-medium ${active ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-800"}`;

  return (
    <section className="rounded-3xl bg-white shadow-sm">
      <div className="border-b border-slate-200 px-6 py-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-blue-600">Seating planner</p>
            <h2 className="mt-1 text-xl font-bold text-slate-900">Exam seating generator</h2>
          </div>
          <div className="flex flex-wrap items-center gap-2 print:hidden">
            <button type="button" onClick={() => setSeed((current) => current + 1)} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">
              <RefreshCw aria-hidden="true" className="h-4 w-4" /> Regenerate
            </button>
            <button type="button" onClick={() => window.print()} className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-3 py-2 text-sm font-semibold text-white hover:bg-blue-500">
              <Printer aria-hidden="true" className="h-4 w-4" /> Print / Save PDF
            </button>
          </div>
        </div>
      </div>

      <div className="p-6">
        <div className="exam-seating-controls space-y-4 print:hidden">
          <label className="block text-sm font-medium text-slate-700">
            Exam / plan title
            <input value={examTitle} onChange={(event) => setExamTitle(event.target.value)} className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm" />
          </label>

          <div className="grid gap-4 rounded-2xl border border-slate-200 bg-slate-50 p-4 md:grid-cols-4">
            <label className="text-sm font-medium text-slate-700">
              From class
              <select value={fromClass} onChange={(event) => { const value = Number(event.target.value); setFromClass(value); if (value > toClass) setToClass(value); }} className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm">
                {availableClasses.map((item) => <option key={item} value={item}>{item}</option>)}
              </select>
            </label>
            <label className="text-sm font-medium text-slate-700">
              To class
              <select value={toClass} onChange={(event) => { const value = Number(event.target.value); setToClass(value); if (value < fromClass) setFromClass(value); }} className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm">
                {availableClasses.map((item) => <option key={item} value={item}>{item}</option>)}
              </select>
            </label>
            <label className="text-sm font-medium text-slate-700">
              Minimum rooms
              <input type="number" min={1} max={Math.max(1, selectedStudents.length)} value={roomCount} onChange={(event) => setRoomCount(Math.max(1, Number(event.target.value) || 1))} className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm" />
            </label>
            <label className="text-sm font-medium text-slate-700">
              Seats per room
              <input type="number" min={1} max={500} value={seatsPerRoom} onChange={(event) => setSeatsPerRoom(Math.max(1, Number(event.target.value) || 1))} className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm" />
            </label>
          </div>

          <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_minmax(0,2fr)_auto]">
            <select aria-label="Saved seating preset" value={selectedPresetId} onChange={(event) => loadPreset(event.target.value)} className="rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm">
              <option value="">Load saved preset</option>
              {presets.map((preset) => <option key={preset.id} value={preset.id}>{preset.name}</option>)}
            </select>
            <input aria-label="Preset name" value={presetName} onChange={(event) => setPresetName(event.target.value)} placeholder="Name this setup" className="rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm" />
            <div className="flex gap-2">
              <button type="button" onClick={persistCurrentPreset} disabled={!presetName.trim()} className="inline-flex flex-1 items-center justify-center gap-2 rounded-xl border border-slate-200 px-3 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40">
                <Save aria-hidden="true" className="h-4 w-4" /> Save setup
              </button>
              <button type="button" onClick={deleteSelectedPreset} disabled={!selectedPresetId} aria-label="Delete selected preset" title="Delete selected preset" className="grid h-11 w-11 place-items-center rounded-xl border border-slate-200 text-slate-600 hover:bg-rose-50 hover:text-rose-700 disabled:cursor-not-allowed disabled:opacity-40">
                <Trash2 aria-hidden="true" className="h-4 w-4" />
              </button>
            </div>
          </div>
        </div>

        <div className="mt-5 flex flex-wrap items-center gap-3 text-sm text-slate-500 print:hidden">
          <span className="rounded-full bg-blue-50 px-2.5 py-1 font-medium text-blue-700">{selectedStudents.length} students selected</span>
          <span className="rounded-full bg-amber-50 px-2.5 py-1 font-medium text-amber-700">{rooms.length} rooms planned</span>
          <span className="rounded-full bg-emerald-50 px-2.5 py-1 font-medium text-emerald-700">Grade bands kept separate</span>
        </div>

        <div className="mt-6 hidden border-b border-slate-200 pb-4 print:block">
          <h2 className="text-xl font-bold text-slate-900">{examTitle || "Exam seating plan"}</h2>
          <p className="mt-1 text-sm text-slate-600">{view === "rooms" ? "Room-wise seating list" : "Class-wise student list"} · {selectedStudents.length} students · {rooms.length} rooms</p>
          <p className="mt-1 text-xs text-slate-500">Class range {fromClass}-{toClass}</p>
        </div>

        <div className="mt-5 flex w-fit gap-1 rounded-xl bg-slate-100 p-1 print:hidden" role="group" aria-label="Seating plan view">
          <button type="button" onClick={() => setView("rooms")} aria-pressed={view === "rooms"} className={viewButtonClass(view === "rooms")}>Room-wise</button>
          <button type="button" onClick={() => setView("classes")} aria-pressed={view === "classes"} className={viewButtonClass(view === "classes")}>Class-wise</button>
        </div>

        {selectedStudents.length === 0 ? (
          <div className="mt-6 rounded-2xl border border-dashed border-slate-200 bg-slate-50 p-8 text-center text-sm text-slate-400">
            No students match this class range.
          </div>
        ) : view === "rooms" ? (
          <div className="seating-print-content mt-6 space-y-4 print:space-y-3">
            {rooms.map((room) => (
              <div key={room.name} className="room-card rounded-2xl border border-slate-200 bg-slate-50 p-4 break-inside-avoid print:border-slate-400 print:bg-white print:p-3">
                <div className="mb-4 flex items-center justify-between gap-2">
                  <h3 className="text-base font-bold text-slate-800">{room.name}</h3>
                  <span className="text-xs font-medium uppercase tracking-[0.12em] text-slate-500">{room.gradeBand} · {room.seats.length} seats</span>
                </div>

                <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-5 print:grid-cols-5 print:gap-1">
                  {room.seats.map((seat) => (
                    <div key={`${room.name}-${seat.seatNumber}-${seat.student._id}`} className="rounded-xl border border-slate-200 bg-white p-3 print:rounded-none print:p-2">
                      <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-400">Seat {seat.seatNumber}</p>
                      <p className="mt-2 font-semibold text-slate-800">{seat.student.fullName}</p>
                      <p className="mt-1 text-xs text-slate-500">{seat.className} · Roll {seat.student.rollNumber || "-"}</p>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="seating-print-content mt-6 overflow-x-auto">
            <table className="w-full min-w-[620px] border-collapse text-left text-sm print:min-w-0">
              <thead className="bg-slate-100 text-xs uppercase tracking-wide text-slate-600 print:bg-white">
                <tr>
                  <th className="border-b border-slate-300 px-3 py-2">Class</th>
                  <th className="border-b border-slate-300 px-3 py-2">Section</th>
                  <th className="border-b border-slate-300 px-3 py-2">Roll no.</th>
                  <th className="border-b border-slate-300 px-3 py-2">Student</th>
                  <th className="border-b border-slate-300 px-3 py-2">Room</th>
                  <th className="border-b border-slate-300 px-3 py-2">Seat</th>
                </tr>
              </thead>
              <tbody>
                {classWiseSeats.map((seat) => (
                  <tr key={`${seat.student._id}-${seat.roomName}`} className="break-inside-avoid">
                    <td className="border-b border-slate-200 px-3 py-2">{seat.student.class}</td>
                    <td className="border-b border-slate-200 px-3 py-2">{seat.student.section}</td>
                    <td className="border-b border-slate-200 px-3 py-2">{seat.student.rollNumber || "-"}</td>
                    <td className="border-b border-slate-200 px-3 py-2 font-medium">{seat.student.fullName}</td>
                    <td className="border-b border-slate-200 px-3 py-2">{seat.roomName}</td>
                    <td className="border-b border-slate-200 px-3 py-2">{seat.seatNumber}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </section>
  );
}
