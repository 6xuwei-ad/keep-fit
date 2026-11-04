import type { WeightChange, WeightLog, WeightWeek } from "./types.ts";
import { round, shiftDateKey } from "./nutrition.ts";

/**
 * 体重趋势的纯计算：
 * - 按自然周（周一到周日）求平均
 * - 只在有两次以上记录时计算变化
 *
 * 这里不做任何“胖瘦”判断，只描述数字本身。
 */

export function weekStartKey(dateKey: string): string {
  const [year = 1970, month = 1, day = 1] = dateKey.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day, 12));
  // getUTCDay: 0=周日，1=周一。把周一作为一周起点。
  const offset = (date.getUTCDay() + 6) % 7;
  date.setUTCDate(date.getUTCDate() - offset);
  return date.toISOString().slice(0, 10);
}

export function weekEndKey(dateKey: string): string {
  return shiftDateKey(weekStartKey(dateKey), 6);
}

export function aggregateWeightWeeks(logs: WeightLog[], maxWeeks = 12): WeightWeek[] {
  const buckets = new Map<
    string,
    { sum: number; min: number; max: number; count: number }
  >();

  for (const log of logs) {
    const start = weekStartKey(log.date);
    const bucket = buckets.get(start);
    if (bucket) {
      bucket.sum += log.weightKg;
      bucket.min = Math.min(bucket.min, log.weightKg);
      bucket.max = Math.max(bucket.max, log.weightKg);
      bucket.count += 1;
    } else {
      buckets.set(start, {
        sum: log.weightKg,
        min: log.weightKg,
        max: log.weightKg,
        count: 1
      });
    }
  }

  return Array.from(buckets.entries())
    .sort(([left], [right]) => left.localeCompare(right))
    .slice(-maxWeeks)
    .map(([weekStart, bucket]) => ({
      weekStart,
      weekEnd: shiftDateKey(weekStart, 6),
      average: round(bucket.sum / bucket.count, 1),
      min: round(bucket.min, 1),
      max: round(bucket.max, 1),
      count: bucket.count
    }));
}

function daysBetween(from: string, to: string): number {
  const [fromYear = 1970, fromMonth = 1, fromDay = 1] = from.split("-").map(Number);
  const [toYear = 1970, toMonth = 1, toDay = 1] = to.split("-").map(Number);
  const start = Date.UTC(fromYear, fromMonth - 1, fromDay);
  const end = Date.UTC(toYear, toMonth - 1, toDay);
  return Math.round((end - start) / 86_400_000);
}

/**
 * 最近一次记录，对比“至少 days 天以前”的最近一条记录。
 * 没有足够早的记录时返回 null，避免把两天的波动说成四周变化。
 */
export function weightChange(logs: WeightLog[], days = 28): WeightChange | null {
  if (logs.length < 2) return null;
  const sorted = [...logs].sort((left, right) => left.date.localeCompare(right.date));
  const latest = sorted[sorted.length - 1];
  if (!latest) return null;

  const cutoff = shiftDateKey(latest.date, -days);
  let base: WeightLog | null = null;
  for (const log of sorted) {
    if (log.date <= cutoff) base = log;
    else break;
  }
  if (!base || base.date >= latest.date) return null;

  return {
    delta: round(latest.weightKg - base.weightKg, 1),
    fromWeight: base.weightKg,
    toWeight: latest.weightKg,
    since: base.date,
    days: daysBetween(base.date, latest.date)
  };
}
