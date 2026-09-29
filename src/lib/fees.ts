"use strict";

import { monthNames } from "@/lib/retention";

export type FeeMonth = { month: string; year: number; key: string };

/**
 * The current month plus the previous eleven calendar months, oldest first.
 * This is the one year fee window the school keeps for every student.
 */
export function lastTwelveMonths(now: Date = new Date()): FeeMonth[] {
  const months: FeeMonth[] = [];
  for (let offset = 11; offset >= 0; offset -= 1) {
    const date = new Date(now.getFullYear(), now.getMonth() - offset, 1);
    const month = monthNames[date.getMonth()];
    months.push({ month, year: date.getFullYear(), key: `${month}-${date.getFullYear()}` });
  }
  return months;
}

/** The same window, most recent month first, which is easier to read in tables. */
export function lastTwelveMonthsNewestFirst(now: Date = new Date()): FeeMonth[] {
  return lastTwelveMonths(now).reverse();
}
