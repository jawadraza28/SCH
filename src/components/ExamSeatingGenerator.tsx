"use client";

import { useMemo, useState, useSyncExternalStore } from "react";
import { Printer, RefreshCw, Save, Trash2 } from "lucide-react";
import { buildSeatingPlan, listSections, type ExamStudent } from "@/lib/exam-seating";

/**
 * A saved setup: the classes the administrator merged, the sections kept, and
 * the room geometry. Older presets only stored a from/to class range, so those
 * are migrated into an explicit class list when they are read back.
 */
type SeatingPreset = {
  id: string;
  name: string;
  classes?: number[];
  sections?: string[];
  columns?: number;
  roomCount: number;
  seatsPerRoom: number;
  fromClass?: number;
  toClass?: number;
};

const PRESETS_STORAGE_KEY = "school-exam-seating-presets";
const EMPTY_PRESETS: SeatingPreset[] = [];
let cachedPresetText: string | null = null;
let cachedPresets: SeatingPreset[] = EMPTY_PRESETS;

function normalizePreset(preset: SeatingPreset): SeatingPreset {
  if (Array.isArray(preset.classes)) return preset;
  const from = preset.fromClass ?? 1;
  const to = preset.toClass ?? from;
  const classes: number[] = [];
  for (let value = Math.min(from, to); value <= Math.max(from, to); value += 1) classes.push(value);
  return { ...preset, classes, sections: preset.sections ?? [] };
}

function getPresetSnapshot() {
  try {
    const saved = localStorage.getItem(PRESETS_STORAGE_KEY);
    if (saved !== cachedPresetText) {
      cachedPresetText = saved;
      const parsed: unknown = saved ? JSON.parse(saved) : [];
      cachedPresets = Array.isArray(parsed)
        ? (parsed as SeatingPreset[]).map(normalizePreset)
        : EMPTY_PRESETS;
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
  availableSections,
}: {
  students: ExamStudent[];
  availableClasses: number[];
  availableSections: string[];
}) {
  const sectionsOnFile = availableSections.length ? availableSections : listSections(students);

  /** Classes to merge — every section of a ticked class joins the same pool. */
  const [selectedClasses, setSelectedClasses] = useState<number[]>(availableClasses);
  const [selectedSections, setSelectedSections] = useState<string[]>(sectionsOnFile);
  const [columns, setColumns] = useState<number>(5);
  const [roomCount, setRoomCount] = useState<number>(Math.max(1, Math.ceil(students.length / 20)));
  const [seatsPerRoom, setSeatsPerRoom] = useState<number>(20);
  const [seed, setSeed] = useState<number>(1);
  const [antiCheat, setAntiCheat] = useState<boolean>(true);
  const [examTitle, setExamTitle] = useState("Exam seating plan");
  const [presetName, setPresetName] = useState("");
  const [selectedPresetId, setSelectedPresetId] = useState("");
  const [view, setView] = useState<"rooms" | "classes">("rooms");
  const presets = useSyncExternalStore(subscribePresets, getPresetSnapshot, getServerPresetSnapshot);

  const selectedStudents = useMemo(
    () => students.filter((student) => {
      const number = Number.parseInt(student.class, 10);
      const section = student.section.trim().toUpperCase();
      return Number.isFinite(number) && selectedClasses.includes(number) && selectedSections.includes(section);
    }),
    [students, selectedClasses, selectedSections],
  );

  const plan = useMemo(
    () => buildSeatingPlan(selectedStudents, {
      columns,
      seatsPerRoom,
      roomCount,
      seed,
      selectedClasses,
      selectedSections,
      antiCheat,
    }),
    [selectedStudents, columns, seatsPerRoom, roomCount, seed, selectedClasses, selectedSections, antiCheat],
  );
  const rooms = plan.rooms;
  /**
   * How many rooms could keep whole CLASSES apart versus the ones that only
   * held a single class and could therefore only separate its SECTIONS.
   */
  const classSpaced = rooms.filter((room) => room.separation === "class").length;
  const sectionSpaced = rooms.length - classSpaced;

  const classWiseSeats = useMemo(
    () => rooms.flatMap((room) => room.seats.map((seat) => ({ ...seat, roomName: room.name })))
      .sort((left, right) => Number.parseInt(left.student.class, 10) - Number.parseInt(right.student.class, 10)
        || left.student.section.localeCompare(right.student.section, undefined, { numeric: true })
        || (left.student.rollNumber ?? "").localeCompare(right.student.rollNumber ?? "", undefined, { numeric: true })),
    [rooms],
  );

  /** Rows of each grid, so the on-screen layout matches the physical room. */
  const roomRows = useMemo(
    () => rooms.map((room) => {
      const rows: (typeof room.seats)[] = [];
      for (let index = 0; index < room.seats.length; index += room.columns) {
        rows.push(room.seats.slice(index, index + room.columns));
      }
      return { room, rows };
    }),
    [rooms],
  );

  const mergedLabel = plan.mergedClasses.length
    ? plan.mergedClasses.length === 1
      ? `Class ${plan.mergedClasses[0]}`
      : `Classes ${plan.mergedClasses[0]}-${plan.mergedClasses[plan.mergedClasses.length - 1]}`
    : "no class";

  function toggleClass(value: number) {
    setSelectedClasses((current) =>
      current.includes(value) ? current.filter((item) => item !== value) : [...current, value].sort((a, b) => a - b),
    );
  }

  function toggleSection(value: string) {
    setSelectedSections((current) =>
      current.includes(value) ? current.filter((item) => item !== value) : [...current, value],
    );
  }

  function persistCurrentPreset() {
    const name = presetName.trim();
    if (!name) return;
    const preset: SeatingPreset = {
      id: String(Date.now()),
      name,
      classes: selectedClasses,
      sections: selectedSections,
      columns,
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
    setSelectedClasses(preset.classes ?? []);
    setSelectedSections(preset.sections?.length ? preset.sections : sectionsOnFile);
    setColumns(preset.columns ?? 5);
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
  const chipClass = (active: boolean) => `rounded-lg border px-3 py-2 text-sm font-medium transition ${active ? "border-blue-600 bg-blue-600 text-white" : "border-slate-200 bg-white text-slate-600 hover:border-blue-300"}`;

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
        <div className="exam-seating-controls space-y-5 print:hidden">
          <label className="block text-sm font-medium text-slate-700">
            Exam / plan title
            <input value={examTitle} onChange={(event) => setExamTitle(event.target.value)} className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm" />
          </label>

          {/* Class merge picker: ticking a class pulls in ALL of its sections. */}
          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-slate-700">Classes to merge</p>
                <p className="mt-1 text-xs text-slate-500">Every section and every student of a ticked class joins the same seating pool.</p>
              </div>
              <div className="flex flex-wrap gap-2">
                <button type="button" onClick={() => setSelectedClasses(availableClasses)} className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-600 hover:border-blue-300">Select all</button>
                <button type="button" onClick={() => setSelectedClasses([])} className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-600 hover:border-blue-300">Clear</button>
              </div>
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              {availableClasses.map((value) => (
                <button
                  key={value}
                  type="button"
                  aria-pressed={selectedClasses.includes(value)}
                  onClick={() => toggleClass(value)}
                  className={chipClass(selectedClasses.includes(value))}
                >
                  Class {value}
                </button>
              ))}
            </div>

            {sectionsOnFile.length > 1 && (
              <div className="mt-4 border-t border-slate-200 pt-3">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold text-slate-700">Sections</p>
                    <p className="mt-1 text-xs text-slate-500">Keep them all ticked to merge every section of the selected classes.</p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <button type="button" onClick={() => setSelectedSections(sectionsOnFile)} className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-600 hover:border-blue-300">All sections</button>
                    <button type="button" onClick={() => setSelectedSections([])} className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-600 hover:border-blue-300">Clear</button>
                  </div>
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  {sectionsOnFile.map((value) => (
                    <button
                      key={value}
                      type="button"
                      aria-pressed={selectedSections.includes(value)}
                      onClick={() => toggleSection(value)}
                      className={chipClass(selectedSections.includes(value))}
                    >
                      Section {value}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          <div className="grid gap-4 rounded-2xl border border-slate-200 bg-slate-50 p-4 md:grid-cols-4">
            <label className="text-sm font-medium text-slate-700">
              Seats per row
              <input type="number" min={1} max={20} value={columns} onChange={(event) => setColumns(Math.max(1, Math.min(20, Number(event.target.value) || 1)))} className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm" />
            </label>
            <label className="text-sm font-medium text-slate-700">
              Rooms
              <input type="number" min={1} value={roomCount} onChange={(event) => setRoomCount(Math.max(1, Number(event.target.value) || 1))} className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm" />
            </label>
            <label className="text-sm font-medium text-slate-700">
              Seats per room
              <input type="number" min={1} max={500} value={seatsPerRoom} onChange={(event) => setSeatsPerRoom(Math.max(1, Number(event.target.value) || 1))} className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm" />
            </label>
            <label className="flex items-end gap-2 pb-3 text-sm font-medium text-slate-700">
              <input type="checkbox" checked={antiCheat} onChange={(event) => setAntiCheat(event.target.checked)} className="h-4 w-4 rounded border-slate-300" />
              Keep classmates apart
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
          <span className="rounded-full bg-violet-50 px-2.5 py-1 font-medium text-violet-700">{mergedLabel} merged</span>
          <span className="rounded-full bg-amber-50 px-2.5 py-1 font-medium text-amber-700">{rooms.length} rooms planned</span>
          {antiCheat ? (
            rooms.length === 0 ? null : plan.violations > 0 ? (
              <span className="rounded-full bg-rose-50 px-2.5 py-1 font-medium text-rose-700">
                {plan.violations} adjacent pairs could not be split — one class outnumbers the spaced seats in its room
              </span>
            ) : classSpaced === rooms.length ? (
              <span className="rounded-full bg-emerald-50 px-2.5 py-1 font-medium text-emerald-700">No classmates seated next to each other</span>
            ) : sectionSpaced === rooms.length ? (
              <span className="rounded-full bg-emerald-50 px-2.5 py-1 font-medium text-emerald-700">Sections kept apart — every room held a single class</span>
            ) : (
              <span className="rounded-full bg-emerald-50 px-2.5 py-1 font-medium text-emerald-700">
                {classSpaced} rooms spaced by class · {sectionSpaced} by section
              </span>
            )
          ) : (
            <span className="rounded-full bg-slate-100 px-2.5 py-1 font-medium text-slate-600">Anti-cheat spacing off</span>
          )}
        </div>

        <div className="mt-6 hidden border-b border-slate-200 pb-4 print:block">
          <h2 className="text-xl font-bold text-slate-900">{examTitle || "Exam seating plan"}</h2>
          <p className="mt-1 text-sm text-slate-600">{view === "rooms" ? "Room-wise seating layout" : "Class-wise student list"} · {selectedStudents.length} students · {rooms.length} rooms · {mergedLabel} merged</p>
          <p className="mt-1 text-xs text-slate-500">{columns} seats per row{antiCheat ? (classSpaced ? " · classmates kept apart" : " · sections kept apart") : ""}</p>
        </div>

        <div className="mt-5 flex w-fit gap-1 rounded-xl bg-slate-100 p-1 print:hidden" role="group" aria-label="Seating plan view">
          <button type="button" onClick={() => setView("rooms")} aria-pressed={view === "rooms"} className={viewButtonClass(view === "rooms")}>Room-wise</button>
          <button type="button" onClick={() => setView("classes")} aria-pressed={view === "classes"} className={viewButtonClass(view === "classes")}>Class-wise</button>
        </div>

        {selectedStudents.length === 0 ? (
          <div className="mt-6 rounded-2xl border border-dashed border-slate-200 bg-slate-50 p-8 text-center text-sm text-slate-400">
            Tick at least one class (and one section) to build a seating plan.
          </div>
        ) : view === "rooms" ? (
          <div className="seating-print-content mt-6 space-y-4 print:space-y-3">
            {roomRows.map(({ room, rows }) => (
              <div key={room.name} className="room-card rounded-2xl border border-slate-200 bg-slate-50 p-4 break-inside-avoid print:border-slate-400 print:bg-white print:p-3">
                <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="text-base font-bold text-slate-800">{room.name}</h3>
                    {antiCheat && (
                      <span
                        className={
                          room.separation === "class"
                            ? "rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-emerald-700 print:bg-slate-100 print:text-slate-600"
                            : "rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-amber-700 print:bg-slate-100 print:text-slate-600"
                        }
                      >
                        {room.separation === "class" ? "classes apart" : "sections apart"}
                      </span>
                    )}
                  </div>
                  <span className="text-xs font-medium uppercase tracking-[0.12em] text-slate-500">{room.label} · {room.seats.length} seats · {room.columns} per row</span>
                </div>

                <div className="space-y-2">
                  {rows.map((rowSeats, rowIndex) => (
                    <div key={`${room.name}-row-${rowIndex}`} className="flex items-stretch gap-2">
                      <span className="hidden w-16 shrink-0 items-center justify-center rounded-lg bg-slate-200 text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-500 print:flex print:bg-slate-100 sm:flex">
                        Row {rowIndex + 1}
                      </span>
                      <div
                        className="grid flex-1 gap-2 print:gap-1"
                        style={{ gridTemplateColumns: `repeat(${room.columns}, minmax(0, 1fr))` }}
                      >
                        {rowSeats.map((seat) => (
                          <div key={`${room.name}-${seat.seatNumber}`} className="rounded-xl border border-slate-200 bg-white p-2.5 print:rounded-none print:p-1.5">
                            <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-400">Seat {seat.seatNumber}</p>
                            <p className="mt-1.5 text-sm font-semibold leading-tight text-slate-800">{seat.student.fullName}</p>
                            <p className="mt-1 text-[11px] leading-tight text-slate-500">{seat.className} · Roll {seat.student.rollNumber || "-"}</p>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="seating-print-content mt-6 overflow-x-auto">
            <table className="w-full min-w-[720px] border-collapse text-left text-sm print:min-w-0">
              <thead className="bg-slate-100 text-xs uppercase tracking-wide text-slate-600 print:bg-white">
                <tr>
                  <th className="border-b border-slate-300 px-3 py-2">Class</th>
                  <th className="border-b border-slate-300 px-3 py-2">Section</th>
                  <th className="border-b border-slate-300 px-3 py-2">Roll no.</th>
                  <th className="border-b border-slate-300 px-3 py-2">Student</th>
                  <th className="border-b border-slate-300 px-3 py-2">Room</th>
                  <th className="border-b border-slate-300 px-3 py-2">Row</th>
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
                    <td className="border-b border-slate-200 px-3 py-2">{seat.row + 1}</td>
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







