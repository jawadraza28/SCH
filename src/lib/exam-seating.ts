export type ExamStudent = {
  _id: string;
  fullName: string;
  class: string;
  section: string;
  rollNumber?: string;
};

export type SeatingSeat = {
  seatNumber: number;
  student: ExamStudent;
  className: string;
};

export type SeatingRoom = {
  name: string;
  gradeBand: string;
  seats: SeatingSeat[];
};

function classNumber(value: string) {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : null;
}

function gradeBand(value: string) {
  const number = classNumber(value);
  if (number === null) return "Other classes";
  if (number <= 3) return "Classes 1-3";
  if (number <= 7) return "Classes 4-7";
  if (number <= 10) return "Classes 8-10";
  const first = 11 + Math.floor((number - 11) / 3) * 3;
  return `Classes ${first}-${first + 2}`;
}

function bandOrder(label: string) {
  const match = /Classes (\d+)-/.exec(label);
  return match ? Number(match[1]) : Number.MAX_SAFE_INTEGER;
}

function createRandom(seed: number) {
  let state = seed | 0;
  if (state === 0) state = 0x6d2b79f5;
  return () => {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    return (state >>> 0) / 4294967296;
  };
}

function shuffle<T>(items: T[], random: () => number) {
  const copy = [...items];
  for (let index = copy.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(random() * (index + 1));
    [copy[index], copy[swapIndex]] = [copy[swapIndex], copy[index]];
  }
  return copy;
}

type BandRoster = {
  name: string;
  students: ExamStudent[];
  roomCount: number;
};

export function buildSeatingPlan(
  students: ExamStudent[],
  requestedRooms: number,
  seatsPerRoom: number,
  fromClass: number,
  toClass: number,
  seed: number,
): SeatingRoom[] {
  const capacity = Math.max(1, Math.floor(seatsPerRoom));
  const filtered = students.filter((student) => {
    const number = classNumber(student.class);
    return number !== null && number >= fromClass && number <= toClass;
  });
  if (!filtered.length) return [];

  const random = createRandom(seed);
  const rosters = new Map<string, ExamStudent[]>();
  for (const student of filtered) {
    const label = gradeBand(student.class);
    const roster = rosters.get(label) ?? [];
    roster.push(student);
    rosters.set(label, roster);
  }

  const bands: BandRoster[] = [...rosters.entries()]
    .sort(([left], [right]) => bandOrder(left) - bandOrder(right))
    .map(([name, roster]) => ({
      name,
      students: shuffle(roster, random),
      roomCount: Math.ceil(roster.length / capacity),
    }));

  const minimumRooms = bands.reduce((total, band) => total + band.roomCount, 0);
  const targetRooms = Math.max(minimumRooms, Math.min(filtered.length, Math.floor(requestedRooms) || 1));
  while (bands.reduce((total, band) => total + band.roomCount, 0) < targetRooms) {
    const expandable = bands
      .filter((band) => band.students.length > band.roomCount)
      .sort((left, right) => right.students.length / right.roomCount - left.students.length / left.roomCount);
    if (!expandable.length) break;
    expandable[0].roomCount += 1;
  }

  const rooms: SeatingRoom[] = [];
  for (const band of bands) {
    const bandRooms = Array.from({ length: band.roomCount }, () => ({
      name: "",
      gradeBand: band.name,
      seats: [] as SeatingSeat[],
    }));
    const remaining = [...band.students];

    while (remaining.length) {
      let bestRoomIndex = -1;
      let bestStudentIndex = -1;
      let bestScore = Number.POSITIVE_INFINITY;
      const candidateOrder = shuffle(remaining.map((_, index) => index), random);

      for (let roomIndex = 0; roomIndex < bandRooms.length; roomIndex += 1) {
        const room = bandRooms[roomIndex];
        if (room.seats.length >= capacity) continue;
        const previous = room.seats[room.seats.length - 1]?.student;

        for (const studentIndex of candidateOrder) {
          const student = remaining[studentIndex];
          const sameClassPenalty = previous?.class === student.class ? 2 : 0;
          const sameSectionPenalty = previous?.section.toUpperCase() === student.section.toUpperCase() ? 1 : 0;
          const score = room.seats.length * 4 + sameClassPenalty + sameSectionPenalty;
          if (score < bestScore) {
            bestScore = score;
            bestRoomIndex = roomIndex;
            bestStudentIndex = studentIndex;
          }
        }
      }

      const room = bandRooms[bestRoomIndex];
      const [student] = remaining.splice(bestStudentIndex, 1);
      room.seats.push({
        seatNumber: room.seats.length + 1,
        student,
        className: `${student.class}-${student.section}`,
      });
    }

    for (const room of bandRooms) {
      if (room.seats.length) rooms.push(room);
    }
  }

  return rooms.map((room, index) => ({ ...room, name: `Room ${index + 1}` }));
}
