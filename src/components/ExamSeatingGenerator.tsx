"use client";

import { useMemo, useState } from "react";

type ExamStudent = {
  _id: string;
  fullName: string;
  class: string;
  section: string;
  rollNumber?: string;
};

type SeatingSeat = {
  seatNumber: number;
  student: ExamStudent;
  className: string;
};

type SeatingRoom = {
  name: string;
  seats: SeatingSeat[];
};

function classSortValue(value: string) {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : Number.MAX_SAFE_INTEGER;
}

function shuffle<T>(items: T[]) {
  const copy = [...items];
  for (let index = copy.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    [copy[index], copy[swapIndex]] = [copy[swapIndex], copy[index]];
  }
  return copy;
}

function buildClassBands(classNames: string[]) {
  const uniqueClasses = [...new Set(classNames)].sort((a, b) => classSortValue(a) - classSortValue(b));
  const bands: string[][] = [];
  for (let index = 0; index < uniqueClasses.length; index += 3) {
    bands.push(uniqueClasses.slice(index, index + 3));
  }
  return bands.length ? bands : [uniqueClasses];
}

function buildRoomPlan(students: ExamStudent[], roomCount: number, seatsPerRoom: number, fromClass: number, toClass: number, seed: number) {
  const filtered = students.filter((student) => {
    const classNumber = Number.parseInt(student.class, 10);
    return Number.isFinite(classNumber) && classNumber >= fromClass && classNumber <= toClass;
  });

  const classNames = [...new Set(filtered.map((student) => student.class))].sort((a, b) => classSortValue(a) - classSortValue(b));
  const anchors = buildClassBands(classNames);
  const effectiveRoomCount = Math.max(1, roomCount || 1);
  const effectiveSeatsPerRoom = Math.max(1, seatsPerRoom || 1);

  if (!filtered.length) {
    return [] as SeatingRoom[];
  }

  const requiredRooms = Math.max(effectiveRoomCount, Math.ceil(filtered.length / effectiveSeatsPerRoom));
  const roomPlans: SeatingRoom[] = [];
  let remaining = shuffle(filtered);

  for (let roomIndex = 0; roomIndex < requiredRooms; roomIndex += 1) {
    const band = anchors[roomIndex % anchors.length] ?? anchors[0];
    const bandStudents = remaining.filter((student) => band.includes(student.class));
    const fallbackStudents = remaining.filter((student) => !bandStudents.some((item) => item._id === student._id));
    const pool = shuffle([...bandStudents, ...fallbackStudents]);
    const selected = pool.slice(0, effectiveSeatsPerRoom);
    const selectedIds = new Set(selected.map((student) => student._id));

    remaining = remaining.filter((student) => !selectedIds.has(student._id));
    roomPlans.push({
      name: `Room ${String.fromCharCode(65 + roomIndex)}`,
      seats: selected.map((student, seatIndex) => ({
        seatNumber: seatIndex + 1,
        student,
        className: `${student.class}-${student.section}`,
      })),
    });
  }

  if (remaining.length) {
    for (const student of remaining) {
      const room = roomPlans[Math.floor(Math.random() * roomPlans.length)];
      if (room.seats.length >= effectiveSeatsPerRoom) {
        roomPlans.push({
          name: `Room ${String.fromCharCode(65 + roomPlans.length)}`,
          seats: [
            {
              seatNumber: 1,
              student,
              className: `${student.class}-${student.section}`,
            },
          ],
        });
      } else {
        room.seats.push({
          seatNumber: room.seats.length + 1,
          student,
          className: `${student.class}-${student.section}`,
        });
      }
    }
  }

  return roomPlans.slice(0, requiredRooms);
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
  const [seed, setSeed] = useState<number>(Date.now());

  const selectedStudents = useMemo(
    () => students.filter((student) => {
      const classNumber = Number.parseInt(student.class, 10);
      return Number.isFinite(classNumber) && classNumber >= fromClass && classNumber <= toClass;
    }),
    [students, fromClass, toClass],
  );

  const rooms = useMemo(
    () => buildRoomPlan(selectedStudents, roomCount, seatsPerRoom, fromClass, toClass, seed),
    [selectedStudents, roomCount, seatsPerRoom, fromClass, toClass, seed],
  );

  const minRequiredRooms = Math.max(1, Math.ceil(selectedStudents.length / Math.max(1, seatsPerRoom)));
  const effectiveRoomCount = Math.max(roomCount, minRequiredRooms);

  return (
    <section className="rounded-3xl bg-white shadow-sm">
      <div className="border-b border-slate-200 px-6 py-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-blue-600">Seating planner</p>
            <h2 className="mt-1 text-xl font-bold text-slate-900">Exam seating generator</h2>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <button type="button" onClick={() => setSeed(Date.now())} className="rounded-xl border border-slate-200 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">
              Regenerate seats
            </button>
            <button type="button" onClick={() => window.print()} className="rounded-xl bg-blue-600 px-3 py-2 text-sm font-semibold text-white hover:bg-blue-500">
              Print plan
            </button>
          </div>
        </div>
      </div>

      <div className="p-6">
        <div className="grid gap-4 rounded-2xl border border-slate-200 bg-slate-50 p-4 md:grid-cols-4">
          <label className="text-sm font-medium text-slate-700">
            From class
            <select value={fromClass} onChange={(event) => setFromClass(Number(event.target.value))} className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm">
              {availableClasses.map((item) => (
                <option key={item} value={item}>{item}</option>
              ))}
            </select>
          </label>
          <label className="text-sm font-medium text-slate-700">
            To class
            <select value={toClass} onChange={(event) => setToClass(Number(event.target.value))} className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm">
              {availableClasses.map((item) => (
                <option key={item} value={item}>{item}</option>
              ))}
            </select>
          </label>
          <label className="text-sm font-medium text-slate-700">
            Rooms
            <input type="number" min={1} value={effectiveRoomCount} onChange={(event) => setRoomCount(Number(event.target.value) || 1)} className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm" />
          </label>
          <label className="text-sm font-medium text-slate-700">
            Seats per room
            <input type="number" min={1} value={seatsPerRoom} onChange={(event) => setSeatsPerRoom(Number(event.target.value) || 1)} className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm" />
          </label>
        </div>

        <div className="mt-5 flex flex-wrap items-center gap-3 text-sm text-slate-500">
          <span className="rounded-full bg-blue-50 px-2.5 py-1 font-medium text-blue-700">{selectedStudents.length} students selected</span>
          <span className="rounded-full bg-amber-50 px-2.5 py-1 font-medium text-amber-700">{effectiveRoomCount} rooms planned</span>
          <span className="rounded-full bg-emerald-50 px-2.5 py-1 font-medium text-emerald-700">Class band mixing enabled</span>
        </div>

        {selectedStudents.length === 0 ? (
          <div className="mt-6 rounded-2xl border border-dashed border-slate-200 bg-slate-50 p-8 text-center text-sm text-slate-400">
            No students match this class range.
          </div>
        ) : (
          <div className="mt-6 space-y-4 print:space-y-3">
            {rooms.map((room) => (
              <div key={room.name} className="room-card rounded-2xl border border-slate-200 bg-slate-50 p-4 break-inside-avoid">
                <div className="mb-4 flex items-center justify-between gap-2">
                  <h3 className="text-base font-bold text-slate-800">{room.name}</h3>
                  <span className="text-xs font-medium uppercase tracking-[0.12em] text-slate-400">{room.seats.length} seats</span>
                </div>

                <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
                  {room.seats.map((seat) => (
                    <div key={`${room.name}-${seat.seatNumber}-${seat.student._id}`} className="rounded-xl border border-slate-200 bg-white p-3">
                      <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-400">Seat {seat.seatNumber}</p>
                      <p className="mt-2 font-semibold text-slate-800">{seat.student.fullName}</p>
                      <p className="mt-1 text-xs text-slate-500">{seat.className} · Roll {seat.student.rollNumber || "-"}</p>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
