import { ClassSection, Student } from "@/Models";

/**
 * Seat accounting for a class-section.
 *
 * A seat is held by any student who is either approved ("active") or waiting
 * for approval ("pending") — the same rule the attendance screen uses. Rejected
 * and suspended students do not occupy a seat.
 */
const SEAT_STATUSES = ["active", "pending"];

export type SeatAvailability = {
  /** false when the class-section has no ClassSection record (nothing to enforce). */
  configured: boolean;
  capacity: number;
  occupied: number;
  full: boolean;
};

/**
 * Computes how many seats a class-section holds and whether it is full.
 *
 * `excludeStudentId` is used when re-checking an existing student (approval or a
 * class change) so the student is not counted against themselves.
 */
export async function seatAvailability(
  className: string,
  section: string,
  excludeStudentId?: string,
): Promise<SeatAvailability> {
  const normalizedClass = className.trim();
  const normalizedSection = section.trim().toUpperCase();

  const classSection = await ClassSection.findOne({ className: normalizedClass, sectionName: normalizedSection })
    .select("capacity")
    .lean();
  if (!classSection) return { configured: false, capacity: 0, occupied: 0, full: false };

  const filter: Record<string, unknown> = {
    class: normalizedClass,
    section: normalizedSection,
    accountStatus: { $in: SEAT_STATUSES },
  };
  if (excludeStudentId) filter._id = { $ne: excludeStudentId };

  const occupied = await Student.countDocuments(filter);
  const capacity = Number(classSection.capacity) || 0;
  return { configured: true, capacity, occupied, full: capacity > 0 && occupied >= capacity };
}

/** Ready-made 409 response text for a full class-section. */
export function fullClassMessage(className: string, section: string, seats: SeatAvailability) {
  return `Class ${className}-${section} is full (${seats.occupied}/${seats.capacity} seats). Free a seat or raise the class capacity before adding more students.`;
}
