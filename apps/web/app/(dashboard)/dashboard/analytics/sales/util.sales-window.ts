import { addDays, addMonths, startOfDay, startOfMonth, subDays, subMonths } from "date-fns";
import { fromZonedTime, toZonedTime } from "date-fns-tz";

import { getPeriodConfig, type Period } from "../period";

export interface SalesWindow {
  start: Date;
  end: Date;
  previousStart: Date;
  previousEnd: Date;
  granularity: "day" | "month";
  timezone: string;
  buckets: { start: Date; end: Date }[];
}

/** All sales blocks use this half-open interval and the same observation time. */
export function getSalesWindow(period: Period, now: Date, timezone = "UTC"): SalesWindow {
  timezone = timezone.trim() || "UTC";
  try {
    new Intl.DateTimeFormat("en", { timeZone: timezone }).format(now);
  } catch {
    timezone = "UTC";
  }
  const config = getPeriodConfig(period);
  const localNow = toZonedTime(now, timezone);
  const localStart =
    config.granularity === "month"
      ? startOfMonth(subMonths(localNow, config.months - 1))
      : startOfDay(subDays(localNow, config.days - 1));
  const start = fromZonedTime(localStart, timezone);
  const end = now;
  const buckets: SalesWindow["buckets"] = [];
  let cursor = localStart;
  while (fromZonedTime(cursor, timezone) <= end) {
    const next = config.granularity === "month" ? addMonths(cursor, 1) : addDays(cursor, 1);
    buckets.push({
      start: fromZonedTime(cursor, timezone),
      end: new Date(Math.min(fromZonedTime(next, timezone).getTime(), end.getTime())),
    });
    cursor = next;
  }
  return {
    start,
    end,
    previousEnd: start,
    previousStart: new Date(start.getTime() - (end.getTime() - start.getTime())),
    granularity: config.granularity,
    timezone,
    buckets,
  };
}

export const roundSalesAmount = (amount: number): number => Math.round(amount * 100) / 100;

/** Growth is undefined when there was no revenue in the previous period. */
export const getSalesGrowth = (current: number, previous: number): number | null =>
  previous > 0 ? ((current - previous) / previous) * 100 : current === 0 ? 0 : null;

/** Distribute rounding cents by largest remainder so displayed shares sum to the receipt total. */
export function allocateSalesAmounts(amounts: number[], total: number): number[] {
  const cents = amounts.map((amount) => Math.floor(amount * 100 + 1e-7));
  const remainder = Math.round(total * 100) - cents.reduce((sum, amount) => sum + amount, 0);
  const order = amounts
    .map((amount, index) => ({ index, fraction: amount * 100 - cents[index] }))
    .sort((a, b) => b.fraction - a.fraction || a.index - b.index);
  for (let i = 0; i < remainder; i++) {
    const entry = order[i];
    if (entry) cents[entry.index] += 1;
  }
  return cents.map((amount) => amount / 100);
}
