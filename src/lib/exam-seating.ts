/**
 * Exam seating plan builder.
 *
 * The administrator picks which classes to MERGE — for example 8, 9 and 10.
 * Every section of a selected class joins the same pool, so a class 9C student
 * ends up sharing a room with class 8A and 10B students instead of sitting in a
 * row of their own classmates.
 *
 * Seats are laid out as a real grid (rows × columns) rather than a flat list,
 * and the placer keeps a student from the same class off the seat directly in
 * FRONT, BEHIND, to the LEFT and to the RIGHT of another student of that class.
 * Diagonals are only a soft preference, which is what stops neighbours from
 * copying answers while still filling every room.
 */

export type ExamStudent = {
  _id: string;
  fullName: string;
  class: string;
  section: string;
  rollNumber?: string;
};

export type SeatingSeat = {
  /** 1-based position inside the room, counted left→right, top→bottom. */
  seatNumber: number;
  /** 0-based row of the grid. */
  row: number;
  /** 0-based column of the grid. */
  column: number;
  student: ExamStudent;
  /** `8-A` — the class and section printed on the plan. */
  className: string;
};

export type SeatingRoom = {
  name: string;
  /** Which classes actually landed in this room, e.g. `Classes 8-10 merged`. */
  label: string;
  columns: number;
  /**
   * What the placer kept apart in this room: a merged room separates CLASSES,
   * a room holding a single class can only separate its SECTIONS.
   */
  separation: SeparationLevel;
  seats: SeatingSeat[];
};

export type SeatingPlanOptions = {
  /** Seats per row. Default 5. */
  columns?: number;
  /** Capacity of one room. Default 20. */
  seatsPerRoom?: number;
  /** How many rooms the admin asked for; clamped to fit the roster. */
  roomCount?: number;
  /** Deterministic shuffle seed so "Regenerate" produces a repeatable plan. */
  seed?: number;
  /** Class numbers to merge. Empty / omitted selects every class present. */
  selectedClasses?: number[];
  /** Section letters to keep. Empty / omitted keeps every section. */
  selectedSections?: string[];
  /** Keep same-class students off adjacent seats (default `true`). */
  antiCheat?: boolean;
};

export type SeatingPlan = {
  rooms: SeatingRoom[];
  /** How many students were placed. */
  students: number;
  /** Class numbers that were actually merged. */
  mergedClasses: number[];
  /**
   * Adjacent conflicting pairs left after placing, counted at whatever level
   * each room could actually achieve (class, or section for a single-class
   * room). Normally 0; it only rises when the geometry makes it impossible.
   */
  violations: number;
};

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

export function classNumber(value: string) {
  const parsed = Number.parseInt(String(value ?? "").trim(), 10);
  return Number.isFinite(parsed) ? parsed : null;
}

export function normalizeSection(value: string) {
  return String(value ?? "").trim().toUpperCase();
}

/** Every numeric class present in the roster, ascending. */
export function listClasses(students: ExamStudent[]) {
  const classes = new Set<number>();
  for (const student of students) {
    const number = classNumber(student.class);
    if (number !== null) classes.add(number);
  }
  return [...classes].sort((left, right) => left - right);
}

/** Every section letter present in the roster, e.g. `["A", "B", "C"]`. */
export function listSections(students: ExamStudent[]) {
  const sections = new Set<string>();
  for (const student of students) {
    const section = normalizeSection(student.section);
    if (section) sections.add(section);
  }
  return [...sections].sort((left, right) => left.localeCompare(right, undefined, { numeric: true }));
}

/** Class + section key, uppercased so `8-a` and `8-A` are the same cohort. */
function cohortKey(student: ExamStudent) {
  return `${normalizeSection(student.class)}|${normalizeSection(student.section)}`;
}

/**
 * `undefined` means "no filter" (keep everything); an empty selection means the
 * administrator unchecked every box, which must yield an empty plan rather than
 * silently falling back to "all".
 */
function matchesSelection(student: ExamStudent, classes: Set<number> | null, sections: Set<string> | null) {
  const number = classNumber(student.class);
  const section = normalizeSection(student.section);
  const classOk = number !== null && (classes === null || classes.has(number));
  const sectionOk = sections === null || sections.has(section);
  return classOk && sectionOk;
}

/** `Classes 8-10 merged` when contiguous, `Classes 5, 8, 9 merged` when not. */
function classesLabel(numbers: number[]) {
  if (!numbers.length) return "No classes";
  if (numbers.length === 1) return `Class ${numbers[0]}`;
  const contiguous = numbers.every((value, index) => index === 0 || value === numbers[index - 1] + 1);
  return contiguous
    ? `Classes ${numbers[0]}-${numbers[numbers.length - 1]} merged`
    : `Classes ${numbers.join(", ")} merged`;
}

function createRandom(seed: number) {
  let state = Math.floor(seed) | 0;
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

/** Split `total` seats as evenly as possible across `count` rooms. */
function balancedCounts(total: number, count: number) {
  const base = Math.floor(total / count);
  const extra = total % count;
  return Array.from({ length: count }, (_, index) => base + (index < extra ? 1 : 0));
}

// ---------------------------------------------------------------------------
// grid placer
// ---------------------------------------------------------------------------

type Cohort = {
  /** `8|A` — class and section of the group. */
  key: string;
  classKey: string;
  sectionKey: string;
  list: ExamStudent[];
};

function sameClass(cohort: Cohort, neighbour: ExamStudent | undefined) {
  return neighbour !== undefined && normalizeSection(neighbour.class) === cohort.classKey;
}

function sameSection(cohort: Cohort, neighbour: ExamStudent | undefined) {
  return neighbour !== undefined && cohortKey(neighbour) === cohort.key;
}

/** How tightly students must be spread inside one room. */
export type SeparationLevel = "class" | "section";

type HardHits = { classHits: number; sectionHits: number };

/**
 * Hard conflicts for a candidate cohort at one grid cell. Left and front are
 * the only neighbours that exist while filling row by row, so they carry this.
 *
 * Class conflicts are kept apart from section conflicts so the placer can pick
 * the level that is actually achievable: a merged room bans a whole class from
 * sitting beside itself, while a room holding a single class — where that is
 * impossible — falls back to keeping the SECTIONS apart.
 */
function hardHits(cohort: Cohort, left: ExamStudent | undefined, front: ExamStudent | undefined): HardHits {
  const hits: HardHits = { classHits: 0, sectionHits: 0 };
  for (const neighbour of [left, front]) {
    if (!neighbour) continue;
    if (!sameClass(cohort, neighbour)) continue;
    hits.classHits += 1;
    if (sameSection(cohort, neighbour)) hits.sectionHits += 1;
  }
  return hits;
}

function isClean(hits: HardHits, level: SeparationLevel) {
  return level === "class" ? hits.classHits === 0 : hits.sectionHits === 0;
}

/** Sort key: the room's level first, then the finer one, then diagonals. */
function rankFor(hits: HardHits, soft: number, level: SeparationLevel) {
  return level === "class"
    ? hits.classHits * 100 + hits.sectionHits * 10 + soft
    : hits.sectionHits * 100 + hits.classHits * 10 + soft;
}

/** Diagonal neighbours exist already, but are only a preference. */
function softScore(cohort: Cohort, frontLeft: ExamStudent | undefined, frontRight: ExamStudent | undefined) {
  let score = 0;
  for (const neighbour of [frontLeft, frontRight]) {
    if (!neighbour) continue;
    if (sameClass(cohort, neighbour)) score += 2 + (sameSection(cohort, neighbour) ? 1 : 0);
  }
  return score;
}

function cohortsOf(students: ExamStudent[], random: () => number) {
  const buckets = new Map<string, Cohort>();
  for (const student of shuffle(students, random)) {
    const key = cohortKey(student);
    const existing = buckets.get(key);
    if (existing) {
      existing.list.push(student);
      continue;
    }
    const [classKey, sectionKey] = key.split("|");
    buckets.set(key, { key, classKey, sectionKey, list: [student] });
  }
  return [...buckets.values()];
}

type CellOption = { cohort: Cohort; hits: HardHits; soft: number };

/**
 * Lay out one room as a grid, keeping same-class students apart.
 *
 * Cells are filled left-to-right, top-to-bottom, so at any moment only the seat
 * to the left and the seat in front are known. Every choice is forward-checked
 * — before committing, the placer confirms the NEXT cell still has a clean
 * option and backtracks when it does not. That is what keeps the last row, where
 * a plain greedy runs out of classes, just as free of classmates as the first.
 *
 * The search is capped by `budget`; if a pathological roster ever exhausts it,
 * a straight greedy pass still fills the room rather than leaving seats blank.
 */
function arrangeRoom(students: ExamStudent[], columns: number, random: () => number, level: SeparationLevel) {
  const cohorts = cohortsOf(students, random);
  const total = students.length;

  /** Student committed to each grid cell, indexed by cell. */
  const occupants: (ExamStudent | undefined)[] = new Array(total).fill(undefined);
  /** Students still waiting per class — the lookahead reads this. */
  const classCounts = new Map<string, number>();
  for (const cohort of cohorts) {
    classCounts.set(cohort.classKey, (classCounts.get(cohort.classKey) ?? 0) + cohort.list.length);
  }

  let budget = 60_000;

  function optionsAt(index: number) {
    const column = index % columns;
    const left = column > 0 ? occupants[index - 1] : undefined;
    const front = index >= columns ? occupants[index - columns] : undefined;
    const frontLeft = index >= columns && column > 0 ? occupants[index - columns - 1] : undefined;
    const frontRight = index >= columns && column < columns - 1 ? occupants[index - columns + 1] : undefined;

    const options: CellOption[] = [];
    for (const cohort of cohorts) {
      if (!cohort.list.length) continue;
      options.push({
        cohort,
        hits: hardHits(cohort, left, front),
        soft: softScore(cohort, frontLeft, frontRight),
      });
    }
    // Clean cells first, then the least diagonal crowding, and only then the
    // biggest cohort — draining the biggest one stops a class from surviving
    // into the final row where it would be forced to sit beside itself.
    return options.sort((a, b) => rankFor(a.hits, a.soft, level) - rankFor(b.hits, b.soft, level)
      || b.cohort.list.length - a.cohort.list.length);
  }

  /** With `occupants[index]` already set, can the following cell stay clean? */
  function nextStayClean(index: number) {
    const next = index + 1;
    if (next >= total) return true;
    const nextLeft = next % columns > 0 ? occupants[next - 1] : undefined;
    const nextFront = next >= columns ? occupants[next - columns] : undefined;
    const blocked = new Set<string>();
    if (level === "class") {
      if (nextLeft) blocked.add(normalizeSection(nextLeft.class));
      if (nextFront) blocked.add(normalizeSection(nextFront.class));
      for (const [classKey, count] of classCounts) {
        if (count > 0 && !blocked.has(classKey)) return true;
      }
      return false;
    }
    if (nextLeft) blocked.add(cohortKey(nextLeft));
    if (nextFront) blocked.add(cohortKey(nextFront));
    return cohorts.some((cohort) => cohort.list.length > 0 && !blocked.has(cohort.key));
  }

  /**
   * @param remaining how many unclean cells this branch may still use up. The
   *   caller raises it 0 → 1 → 2 … only after the previous budget proved that
   *   fewer conflicts are impossible, so the plan found is the tightest one the
   *   geometry allows rather than merely the first one reachable.
   */
  function fill(index: number, remaining: number): boolean {
    if (index >= total) return true;
    if ((budget -= 1) <= 0) return false;

    const options = optionsAt(index);
    if (!options.length) return false;

    // Three tiers: clean here and next, clean here only, and unclean.
    const tiers: CellOption[][] = [[], [], []];
    for (const option of options) {
      const student = option.cohort.list.pop()!;
      occupants[index] = student;
      classCounts.set(option.cohort.classKey, (classCounts.get(option.cohort.classKey) ?? 1) - 1);
      const keepsNextClean = nextStayClean(index);
      occupants[index] = undefined;
      option.cohort.list.push(student);
      classCounts.set(option.cohort.classKey, (classCounts.get(option.cohort.classKey) ?? 0) + 1);

      tiers[isClean(option.hits, level) ? (keepsNextClean ? 0 : 1) : 2].push(option);
    }

    for (const option of [...tiers[0], ...tiers[1]]) {
      const student = option.cohort.list.pop()!;
      occupants[index] = student;
      classCounts.set(option.cohort.classKey, (classCounts.get(option.cohort.classKey) ?? 1) - 1);

      if (fill(index + 1, remaining)) return true;

      classCounts.set(option.cohort.classKey, (classCounts.get(option.cohort.classKey) ?? 0) + 1);
      occupants[index] = undefined;
      option.cohort.list.push(student);
    }

    if (remaining <= 0 || !tiers[2].length) return false;
    for (const option of tiers[2]) {
      const student = option.cohort.list.pop()!;
      occupants[index] = student;
      classCounts.set(option.cohort.classKey, (classCounts.get(option.cohort.classKey) ?? 1) - 1);

      if (fill(index + 1, remaining - 1)) return true;

      classCounts.set(option.cohort.classKey, (classCounts.get(option.cohort.classKey) ?? 0) + 1);
      occupants[index] = undefined;
      option.cohort.list.push(student);
    }
    return false;
  }

  // Every pass restores the cohorts and counts when it fails, so widening the
  // conflict allowance simply restarts the search; the plan that comes out is
  // therefore the tightest one the geometry allows rather than merely the first
  // reachable. The strict pass gets its own budget because a violation-free plan
  // is what the admin actually asked for; the escalations share one, so a room
  // that is genuinely impossible gives up quickly instead of freezing the page.
  // Past the allowances below, the greedy fill still guarantees a full room.
  let solved = fill(0, 0);
  if (!solved) budget = 60_000;
  for (let allowed = 1; allowed <= 6 && !solved && budget > 0; allowed += 1) {
    solved = fill(0, allowed);
  }

  if (!solved) {
    // Search budget spent: take the best-scoring option at every cell so the
    // room is still completely filled (a few pairs may sit together).
    for (const cohort of cohorts) classCounts.set(cohort.classKey, cohort.list.length);
    for (let index = 0; index < total; index += 1) {
      const option = optionsAt(index)[0];
      if (!option) break;
      const student = option.cohort.list.pop()!;
      occupants[index] = student;
      classCounts.set(option.cohort.classKey, (classCounts.get(option.cohort.classKey) ?? 1) - 1);
    }
  }

  const seats: SeatingSeat[] = [];
  for (let index = 0; index < total; index += 1) {
    const student = occupants[index];
    if (!student) continue;
    seats.push({
      seatNumber: index + 1,
      row: Math.floor(index / columns),
      column: index % columns,
      student,
      className: `${student.class}-${student.section}`,
    });
  }
  return seats;
}

/** Orthogonal (front / back / left / right) conflicts in a placed room. */
function countViolations(seats: SeatingSeat[], columns: number, level: SeparationLevel) {
  let violations = 0;
  for (let index = 0; index < seats.length; index += 1) {
    const seat = seats[index];
    const column = index % columns;
    const right = column + 1 < columns ? seats[index + 1] : undefined;
    const behind = seats[index + columns];
    const clashes = (other?: SeatingSeat) => {
      if (!other) return false;
      if (level === "class") return other.student.class === seat.student.class;
      return other.student.class === seat.student.class && other.student.section === seat.student.section;
    };
    if (clashes(right)) violations += 1;
    if (clashes(behind)) violations += 1;
  }
  return violations;
}

// ---------------------------------------------------------------------------
// public entry point
// ---------------------------------------------------------------------------

/**
 * Merge the selected classes into one roster and spread them across rooms.
 *
 * Rooms are filled from a single interleaved sequence, so each room carries a
 * mix of every selected class; the grid placer then keeps classmates apart
 * inside that room.
 */
export function buildSeatingPlan(students: ExamStudent[], options: SeatingPlanOptions = {}): SeatingPlan {
  const columns = Math.max(1, Math.floor(options.columns ?? 5));
  const capacity = Math.max(1, Math.floor(options.seatsPerRoom ?? 20));
  const requestedRooms = Math.max(1, Math.floor(options.roomCount ?? 1));
  const antiCheat = options.antiCheat !== false;
  const random = createRandom(options.seed ?? 1);

  const classes = options.selectedClasses === undefined
    ? null
    : new Set(
        options.selectedClasses
          .map((value) => Number(value))
          .filter((value) => Number.isFinite(value)),
      );
  const sections = options.selectedSections === undefined
    ? null
    : new Set(options.selectedSections.map(normalizeSection).filter(Boolean));

  const filtered = students.filter((student) => matchesSelection(student, classes, sections));
  if (!filtered.length) {
    return { rooms: [], students: 0, mergedClasses: [], violations: 0 };
  }

  const mergedClasses = [...new Set(
    filtered
      .map((student) => classNumber(student.class))
      .filter((value): value is number => value !== null),
  )].sort((left, right) => left - right);

  // Interleave the cohorts so every room receives the same proportional mix of
  // each class. Always taking whichever cohort has the most students left would
  // dump a small class into the FIRST rooms and leave the last rooms holding a
  // single class — the exact pile-up anti-cheat seating exists to prevent.
  // Ranking by the share of a cohort's OWN roster still to place spreads a
  // 37-student class and an 11-student class evenly over every room instead.
  const cohorts = cohortsOf(filtered, random).map((cohort) => ({
    ...cohort,
    cursor: 0,
    size: cohort.list.length,
  }));
  const sequence: ExamStudent[] = [];
  for (;;) {
    let pick: (typeof cohorts)[number] | undefined;
    for (const cohort of cohorts) {
      if (cohort.cursor >= cohort.list.length) continue;
      if (!pick) {
        pick = cohort;
        continue;
      }
      const left = (cohort.list.length - cohort.cursor) / cohort.size;
      const pickedLeft = (pick.list.length - pick.cursor) / pick.size;
      const pickHasMore = (pick.list.length - pick.cursor) > (cohort.list.length - cohort.cursor);
      if (left > pickedLeft + 1e-9) pick = cohort;
      else if (Math.abs(left - pickedLeft) <= 1e-9 && !pickHasMore && cohort.key < pick.key) pick = cohort;
    }
    if (!pick) break;
    sequence.push(pick.list[pick.cursor++]);
  }

  const total = sequence.length;
  const roomCount = Math.min(
    Math.max(requestedRooms, Math.ceil(total / capacity)),
    Math.max(1, total),
  );

  const counts = balancedCounts(total, roomCount);
  const rooms: SeatingRoom[] = [];
  let cursor = 0;
  let violations = 0;

  for (const count of counts) {
    const pool = sequence.slice(cursor, cursor + count);
    cursor += count;
    if (!pool.length) continue;

    // A room holding more than one class bans classmates from sitting together;
    // a room that ended up with a single class can only keep its SECTIONS apart.
    const roomClassKeys = new Set(pool.map((student) => normalizeSection(student.class)));
    const level: SeparationLevel = roomClassKeys.size > 1 ? "class" : "section";

    const seats = antiCheat
      ? arrangeRoom(pool, columns, random, level)
      : shuffle(pool, random).map((student, index) => ({
          seatNumber: index + 1,
          row: Math.floor(index / columns),
          column: index % columns,
          student,
          className: `${student.class}-${student.section}`,
        }));

    if (antiCheat) violations += countViolations(seats, columns, level);

    const roomClasses = [...new Set(
      seats
        .map((seat) => classNumber(seat.student.class))
        .filter((value): value is number => value !== null),
    )].sort((left, right) => left - right);

    rooms.push({ name: "", label: classesLabel(roomClasses), columns, separation: level, seats });
  }

  return {
    rooms: rooms.map((room, index) => ({ ...room, name: `Room ${index + 1}` })),
    students: total,
    mergedClasses,
    violations,
  };
}


