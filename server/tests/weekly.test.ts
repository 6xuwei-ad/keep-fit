import assert from "node:assert/strict";
import test from "node:test";
import type { NutritionFacts, Targets } from "../../shared/types.ts";
import {
  buildStreak,
  buildWeekDays,
  buildWeeklyReport,
  dayQuality,
  type DayRecord
} from "../../shared/weekly.ts";

const TARGETS: Targets = {
  kcal: 1800,
  protein: 110,
  carbs: 190,
  fat: 55,
  fiber: 25
};

function totals(kcal: number, protein: number, fiber = 25): NutritionFacts {
  return {
    kcal,
    protein,
    carbs: 180,
    fat: 55,
    fiber
  };
}

function day(date: string, kcal: number, protein: number, fiber = 25): DayRecord {
  return {
    date,
    totals: totals(kcal, protein, fiber),
    mealCount: 3,
    items: [
      {
        name: "鸡胸肉",
        category: "protein",
        nutrition: { kcal: 300, protein: 50, carbs: 0, fat: 6, fiber: 0 }
      },
      {
        name: "西兰花",
        category: "vegetable",
        nutrition: { kcal: 60, protein: 5, carbs: 8, fat: 1, fiber: 5 }
      }
    ]
  };
}

test("连续记录从今天往前数，今天没记时从昨天开始", () => {
  const dates = ["2026-11-03", "2026-11-04", "2026-11-05", "2026-11-06", "2026-11-07"];
  const active = buildStreak(dates, "2026-11-07");
  assert.equal(active.current, 5);
  assert.equal(active.longest, 5);
  assert.equal(active.activeToday, true);
  assert.equal(active.lastRecordedDate, "2026-11-07");

  const notYetToday = buildStreak(["2026-11-05", "2026-11-06"], "2026-11-07");
  assert.equal(notYetToday.current, 2);
  assert.equal(notYetToday.activeToday, false);

  const broken = buildStreak(
    ["2026-11-01", "2026-11-02", "2026-11-03", "2026-11-06", "2026-11-07"],
    "2026-11-07"
  );
  assert.equal(broken.current, 2);
  assert.equal(broken.longest, 3);

  assert.equal(buildStreak([], "2026-11-07").current, 0);
});

test("周报按自然周统计 7 天，并计算达标天数与平均值", () => {
  const records = [
    day("2026-11-03", 1700, 100),
    day("2026-11-05", 2300, 80),
    day("2026-11-07", 1000, 60)
  ];
  const days = buildWeekDays(records, "2026-11-02", "2026-11-07", TARGETS);
  assert.equal(days.length, 7);
  assert.equal(days[0]!.label, "周一");
  assert.equal(days[6]!.label, "周日");
  assert.equal(days[0]!.recorded, false);
  assert.equal(days[1]!.calorieHit, true);
  assert.equal(days[3]!.calorieHit, false);
  assert.equal(days[5]!.isToday, true);
  assert.equal(days[6]!.isFuture, true);
  assert.equal(days[6]!.shortLabel, "11/8");

  const report = buildWeeklyReport({
    weekStart: "2026-11-02",
    today: "2026-11-07",
    targets: TARGETS,
    records,
    previousRecords: [day("2026-10-28", 1800, 110), day("2026-10-30", 1900, 100)],
    recordedDates: ["2026-11-03", "2026-11-05", "2026-11-07"],
    earliestDate: "2026-10-20"
  });

  assert.equal(report.weekEnd, "2026-11-08");
  assert.equal(report.recordedDays, 3);
  assert.equal(report.calorieHitDays, 1);
  assert.equal(report.proteinHitDays, 1);
  assert.equal(report.averageKcal, 1667);
  assert.equal(report.averageProtein, 80);
  assert.ok(report.averageQuality !== null && report.averageQuality >= 30);
  assert.equal(report.streak.current, 1);
  assert.equal(report.isCurrentWeek, true);
  assert.equal(report.canGoNext, false);
  assert.equal(report.canGoPrev, true);
  assert.equal(report.previousWeekStart, "2026-10-26");
  assert.equal(report.nextWeekStart, null);
  assert.equal(report.comparison.recordedDays, 2);
  assert.equal(report.comparison.partial, true);
  assert.equal(report.comparison.weekEnd, "2026-10-31");
  assert.equal(report.comparison.deltaRecordedDays, 1);
  assert.ok(report.comparison.deltaKcal !== null && report.comparison.deltaKcal < 0);
  assert.equal(report.summary.tips.length, 3);
  assert.match(report.summary.body, /记录了 3 天/);
  assert.ok(report.qualityLabel);
});

test("没有记录的周报仍然返回 7 天占位和可执行建议", () => {
  const report = buildWeeklyReport({
    weekStart: "2026-11-02",
    today: "2026-11-07",
    targets: TARGETS,
    records: [],
    previousRecords: [],
    recordedDates: [],
    earliestDate: null
  });

  assert.equal(report.recordedDays, 0);
  assert.equal(report.averageKcal, null);
  assert.equal(report.averageProtein, null);
  assert.equal(report.averageQuality, null);
  assert.equal(report.qualityLabel, null);
  assert.equal(report.streak.current, 0);
  assert.equal(report.days.filter((entry) => entry.recorded).length, 0);
  assert.equal(report.summary.tips.length, 3);
  assert.equal(report.canGoPrev, false);
  assert.equal(report.previousWeekStart, null);
  assert.equal(report.comparison.deltaKcal, null);
});

test("餐盘质量会随蛋白质、纤维和蔬菜数量上升", () => {
  const sparse = dayQuality(
    {
      date: "2026-11-03",
      totals: totals(900, 30, 5),
      mealCount: 1,
      items: [
        {
          name: "白米饭",
          category: "staple",
          nutrition: { kcal: 300, protein: 6, carbs: 66, fat: 1, fiber: 1 }
        }
      ]
    },
    TARGETS
  );
  const balanced = dayQuality(day("2026-11-03", 1750, 115, 30), TARGETS);
  assert.ok(balanced > sparse);
  assert.ok(balanced <= 98 && sparse >= 30);
});
