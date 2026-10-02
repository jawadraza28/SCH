export type AttendanceDateFilter = {
  date?: { $gte?: Date; $lt?: Date };
  month: string;
  from: string;
  to: string;
};

function validDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

function nextDay(value: string): Date {
  const date = new Date(`${value}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + 1);
  return date;
}

export function buildAttendanceDateFilter(params: {
  month?: string;
  from?: string;
  to?: string;
}): AttendanceDateFilter {
  const month = /^\d{4}-\d{2}$/.test(params.month ?? "") ? params.month! : "";
  const from = validDate(params.from ?? "") ? params.from! : "";
  const to = validDate(params.to ?? "") ? params.to! : "";
  const date: { $gte?: Date; $lt?: Date } = {};

  if (month) {
    date.$gte = new Date(`${month}-01T00:00:00.000Z`);
    const [year, monthNumber] = month.split("-").map(Number);
    date.$lt = new Date(Date.UTC(year, monthNumber, 1));
  }
  if (from) {
    const start = new Date(`${from}T00:00:00.000Z`);
    if (!date.$gte || start > date.$gte) date.$gte = start;
  }
  if (to) {
    const end = nextDay(to);
    if (!date.$lt || end < date.$lt) date.$lt = end;
  }
  if (from && to && from > to) {
    const invalidRange = new Date(`${from}T00:00:00.000Z`);
    date.$gte = invalidRange;
    date.$lt = invalidRange;
  }

  return { date: Object.keys(date).length ? date : undefined, month, from, to };
}

export function recentAttendanceMonths(count = 24): Array<{ value: string; label: string }> {
  const now = new Date();
  return Array.from({ length: count }, (_, index) => {
    const date = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - index, 1));
    const value = date.toISOString().slice(0, 7);
    return {
      value,
      label: date.toLocaleDateString("en-US", { month: "long", year: "numeric", timeZone: "UTC" }),
    };
  });
}
