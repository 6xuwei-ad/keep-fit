import type { WeeklyReport } from "../../shared/types.ts";
import { buildWeeklyReport, type DayRecord } from "../../shared/weekly.ts";
import { localDateKey, shiftDateKey } from "../../shared/nutrition.ts";
import { weekStartKey } from "../../shared/weight.ts";
import type { Store } from "../store.ts";
import { AppError } from "../lib/errors.ts";

function isValidDateKey(value: string): boolean {
  const [year, month, day] = value.split("-").map(Number);
  if (!year || !month || !day) return false;
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
}

function loadDays(
  store: Store,
  deviceId: string,
  start: string,
  end: string
): DayRecord[] {
  const totals = store.listDailyTotals(deviceId, start, end);
  const meals = store.listMealsRange(deviceId, start, end);
  const byDate = new Map<string, DayRecord>();

  for (const row of totals) {
    byDate.set(row.date, {
      date: row.date,
      totals: {
        kcal: row.kcal,
        protein: row.protein,
        carbs: row.carbs,
        fat: row.fat,
        fiber: row.fiber
      },
      mealCount: row.mealCount,
      items: []
    });
  }

  for (const meal of meals) {
    const record = byDate.get(meal.date);
    if (!record) continue;
    for (const item of meal.items) {
      record.items.push({
        name: item.name,
        category: item.category,
        nutrition: item.nutrition
      });
    }
  }

  return Array.from(byDate.values()).sort((left, right) =>
    left.date.localeCompare(right.date)
  );
}

/**
 * 生成某个自然周的饮食周报。
 * weekStart 可传该周任意一天，服务端统一归一到周一；不传则取本周。
 */
export function buildWeeklyReportFor(
  store: Store,
  deviceId: string,
  requestedWeekStart: string | null,
  today = localDateKey()
): WeeklyReport {
  const profile = store.ensureProfile(deviceId);
  const currentWeekStart = weekStartKey(today);

  let weekStart = currentWeekStart;
  if (requestedWeekStart) {
    if (
      !/^\d{4}-\d{2}-\d{2}$/.test(requestedWeekStart) ||
      !isValidDateKey(requestedWeekStart)
    ) {
      throw new AppError(400, "周报日期格式应为 YYYY-MM-DD", "INVALID_WEEK");
    }
    weekStart = weekStartKey(requestedWeekStart);
  }

  if (weekStart > currentWeekStart) {
    throw new AppError(400, "还不能查看未来一周的报告", "WEEK_FUTURE");
  }

  const weekEnd = shiftDateKey(weekStart, 6);
  const previousStart = shiftDateKey(weekStart, -7);
  const previousEnd = shiftDateKey(weekStart, -1);

  return buildWeeklyReport({
    weekStart,
    today,
    targets: profile.targets,
    records: loadDays(store, deviceId, weekStart, weekEnd),
    previousRecords: loadDays(store, deviceId, previousStart, previousEnd),
    recordedDates: store.listRecordedDates(deviceId, 400),
    earliestDate: store.getEarliestMealDate(deviceId)
  });
}
