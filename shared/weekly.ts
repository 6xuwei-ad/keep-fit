import type {
  FoodCategory,
  NutritionFacts,
  Targets,
  WeekComparison,
  WeekDay,
  WeeklyReport,
  WeekStreak,
  WeekSummary,
  WeekSummaryTip
} from "./types.ts";
import { EMPTY_NUTRITION, clamp, macroEnergy, round, shiftDateKey } from "./nutrition.ts";
import { weekEndKey, weekStartKey } from "./weight.ts";

/**
 * 周报的纯计算层：只吃“每天吃了什么”的结果，不访问数据库。
 *
 * 口径：
 * - 自然周，周一到周日；
 * - 热量达标 = 记录日摄入在目标的 85%–110% 之间；
 * - 蛋白质达标 = 记录日摄入 ≥ 目标的 90%；
 * - 连续记录从今天往前数；今天还没记时从昨天开始数，避免白天误判断签；
 * - 所有平均值只除以“有记录的天数”，不拿 0 去拉低平均。
 */

export const WEEKDAY_LABELS = ["周一", "周二", "周三", "周四", "周五", "周六", "周日"] as const;

export interface DayRecord {
  date: string;
  totals: NutritionFacts;
  mealCount: number;
  items: Array<{
    name: string;
    category: FoodCategory;
    nutrition: NutritionFacts;
  }>;
}

export function qualityLabel(score: number): string {
  if (score >= 88) return "非常均衡";
  if (score >= 75) return "相当不错";
  if (score >= 60) return "还有提升空间";
  return "需要调整";
}

/**
 * 一天的整体餐盘质量。和单餐评分不同，这里按全天的蛋白质、纤维、
 * 蔬菜多样性和热量偏差打分，用来观察一周内的变化。
 */
export function dayQuality(record: DayRecord, targets: Targets): number {
  const vegetables = new Set(
    record.items
      .filter((item) => item.category === "vegetable")
      .map((item) => item.name.trim())
  );
  const fruitBonus = record.items.some((item) => item.category === "fruit") ? 1 : 0;
  const energy = macroEnergy(record.totals);
  const proteinRatio = clamp(record.totals.protein / Math.max(targets.protein, 1), 0, 1);
  const fiberRatio = clamp(record.totals.fiber / Math.max(targets.fiber, 1), 0, 1);
  const variety = clamp((vegetables.size + fruitBonus) / 4, 0, 1);
  const calorieRatio = targets.kcal > 0 ? record.totals.kcal / targets.kcal : 0;

  let score = 40 + proteinRatio * 24 + fiberRatio * 16 + variety * 10;
  if (calorieRatio >= 0.85 && calorieRatio <= 1.1) score += 8;
  else if (calorieRatio > 1.2) score -= 8;
  else if (calorieRatio < 0.7) score -= 6;
  if (energy.fat > 40) score -= 6;

  return Math.round(clamp(score, 30, 98));
}

export function buildWeekDays(
  records: DayRecord[],
  weekStart: string,
  today: string,
  targets: Targets
): WeekDay[] {
  const byDate = new Map(records.map((record) => [record.date, record]));

  return Array.from({ length: 7 }, (_, index) => {
    const date = shiftDateKey(weekStart, index);
    const record = byDate.get(date);
    const recorded = Boolean(record && record.mealCount > 0);
    const totals = record ? record.totals : { ...EMPTY_NUTRITION };
    const calorieRatio = targets.kcal > 0 ? totals.kcal / targets.kcal : 0;
    const caloriePercent = Math.round(calorieRatio * 100);
    const [, month = "0", day = "0"] = date.split("-");

    return {
      date,
      weekday: index + 1,
      label: WEEKDAY_LABELS[index] ?? "周一",
      shortLabel: `${Number(month)}/${Number(day)}`,
      recorded,
      isToday: date === today,
      isFuture: date > today,
      isWeekend: index >= 5,
      totals,
      mealCount: record?.mealCount ?? 0,
      quality: recorded && record ? dayQuality(record, targets) : null,
      calorieHit: recorded && calorieRatio >= 0.85 && calorieRatio <= 1.1,
      proteinHit: recorded && totals.protein >= targets.protein * 0.9,
      caloriePercent
    };
  });
}

export function buildStreak(dates: string[], today: string): WeekStreak {
  const unique = Array.from(
    new Set(dates.filter((date) => /^\d{4}-\d{2}-\d{2}$/.test(date)))
  ).sort((left, right) => left.localeCompare(right));
  const recorded = new Set(unique);
  const lastRecordedDate = unique.length > 0 ? (unique[unique.length - 1] ?? null) : null;

  let current = 0;
  let cursor = recorded.has(today) ? today : shiftDateKey(today, -1);
  while (recorded.has(cursor)) {
    current += 1;
    cursor = shiftDateKey(cursor, -1);
  }

  let longest = 0;
  let run = 0;
  let previous: string | null = null;
  for (const date of unique) {
    if (previous && shiftDateKey(previous, 1) === date) run += 1;
    else run = 1;
    longest = Math.max(longest, run);
    previous = date;
  }

  return {
    current,
    longest,
    lastRecordedDate,
    activeToday: recorded.has(today)
  };
}

function average(values: number[], digits = 1): number | null {
  if (values.length === 0) return null;
  const total = values.reduce((sum, value) => sum + value, 0);
  return round(total / values.length, digits);
}

function recordedValues(days: WeekDay[], pick: (day: WeekDay) => number | null): number[] {
  return days
    .filter((day) => day.recorded)
    .map(pick)
    .filter((value): value is number => value !== null && Number.isFinite(value));
}

/**
 * 本周还没过完时，只拿“上周同样的星期几”来比。
 * 否则周一打开周报，会出现“本周 1 天、上周 5 天，少了 4 天”的假对比。
 */
function buildComparison(
  days: WeekDay[],
  previousDays: WeekDay[],
  previousWeekStart: string,
  previousWeekEnd: string,
  throughWeekday: number | null
): WeekComparison {
  const windowEnd = throughWeekday === null ? null : Math.min(throughWeekday, 6);
  const previousWindow =
    windowEnd === null ? previousDays : previousDays.slice(0, windowEnd + 1);
  const currentRecorded = days.filter((day) => day.recorded);
  const previousRecorded = previousWindow.filter((day) => day.recorded);
  const currentKcal = average(recordedValues(days, (day) => day.totals.kcal), 0);
  const previousKcal = average(recordedValues(previousWindow, (day) => day.totals.kcal), 0);
  const currentProtein = average(recordedValues(days, (day) => day.totals.protein), 1);
  const previousProtein = average(
    recordedValues(previousWindow, (day) => day.totals.protein),
    1
  );
  const currentQuality = average(recordedValues(days, (day) => day.quality), 0);
  const previousQuality = average(
    recordedValues(previousWindow, (day) => day.quality),
    0
  );

  return {
    weekStart: previousWeekStart,
    weekEnd:
      windowEnd === null ? previousWeekEnd : shiftDateKey(previousWeekStart, windowEnd),
    partial: windowEnd !== null && windowEnd < 6,
    recordedDays: previousRecorded.length,
    averageKcal: previousKcal,
    averageProtein: previousProtein,
    averageQuality: previousQuality,
    deltaRecordedDays: currentRecorded.length - previousRecorded.length,
    deltaKcal:
      currentKcal !== null && previousKcal !== null
        ? round(currentKcal - previousKcal, 0)
        : null,
    deltaProtein:
      currentProtein !== null && previousProtein !== null
        ? round(currentProtein - previousProtein, 1)
        : null,
    deltaQuality:
      currentQuality !== null && previousQuality !== null
        ? round(currentQuality - previousQuality, 0)
        : null
  };
}

function buildSummary(input: {
  recordedDays: number;
  calorieHitDays: number;
  proteinHitDays: number;
  averageKcal: number | null;
  averageProtein: number | null;
  averageQuality: number | null;
  targets: Targets;
  streak: WeekStreak;
  comparison: WeekComparison;
}): WeekSummary {
  const {
    recordedDays,
    calorieHitDays,
    proteinHitDays,
    averageKcal,
    averageProtein,
    averageQuality,
    targets,
    streak,
    comparison
  } = input;

  let headline = "这一周，还没有留下记录";
  if (recordedDays === 1) headline = "先记下一天，也算开始";
  else if (recordedDays >= 2 && recordedDays <= 3) headline = "节奏还在形成";
  else if (recordedDays >= 4 && recordedDays <= 5) headline = "一周的轮廓出来了";
  else if (recordedDays === 6) headline = "只差一天，就是完整一周";
  else if (recordedDays === 7) headline = "完整记录了这一周";

  const tips: WeekSummaryTip[] = [];
  const push = (title: string, body: string) => {
    if (tips.length >= 3) return;
    if (tips.some((tip) => tip.title === title)) return;
    tips.push({ title, body });
  };

  if (recordedDays === 0) {
    push(
      "先从一餐开始",
      "不用一次记满一天。先选早餐或午餐，拍一张、确认克数，就算完成一次记录。"
    );
    push(
      "把记录放在固定时间",
      "晚餐后或睡前固定打开一次，比想起来才记更容易坚持。"
    );
    push("先别急着看数字", "前 3 天只要把记录做完整，周报会自己告诉你节奏。");
    return {
      headline,
      body: "没有记录不代表没吃好，只是还没有看见。选一个最容易记住的餐次，先记 3 天，下周再回来对比。",
      tips
    };
  }

  const roundedKcal = averageKcal === null ? 0 : Math.round(averageKcal);
  const roundedProtein = averageProtein === null ? 0 : Math.round(averageProtein);
  const lastLabel = comparison.partial ? "上周同期" : "上周";
  let body = `本周记录了 ${recordedDays} 天，平均 ${roundedKcal} kcal（目标 ${targets.kcal} kcal），蛋白质平均 ${roundedProtein}g；热量达标 ${calorieHitDays} 天，蛋白质达标 ${proteinHitDays} 天。`;
  if (comparison.averageKcal !== null && averageKcal !== null) {
    const diff = Math.round(averageKcal - comparison.averageKcal);
    if (Math.abs(diff) >= 10) {
      body += `平均热量比${lastLabel}${diff > 0 ? "多" : "少"} ${Math.abs(diff)} kcal。`;
    }
  }

  if (recordedDays < 4) {
    push(
      "下周先把记录提到 4 天",
      "不用每天都记，先选最容易记住的 4 天。记录频率上来，周报才有比较的意义。"
    );
  } else if (proteinHitDays < 3) {
    push(
      "蛋白质优先放在早餐",
      `目标 ${targets.protein}g，本周 ${proteinHitDays} 天达标。早餐加 1 个鸡蛋或 150g 无糖酸奶，是最省力的补法。`
    );
  } else if (averageKcal !== null && averageKcal > targets.kcal * 1.08) {
    push(
      "热量略高，先减主食和油",
      `平均每天比目标高约 ${Math.round(averageKcal - targets.kcal)} kcal。主食少盛 1/4 碗、炒菜少一勺油，比跳餐更可持续。`
    );
  } else if (averageKcal !== null && averageKcal < targets.kcal * 0.82) {
    push(
      "吃得太少，也会影响状态",
      `平均每天比目标低约 ${Math.round(targets.kcal - averageKcal)} kcal。先补早餐或下午加餐，别把热量都留到晚上。`
    );
  } else if (averageQuality !== null && averageQuality < 70) {
    push(
      "每餐多加一种蔬菜",
      "餐盘质量还有提升空间。每餐多一把深色蔬菜，纤维和饱腹感都会更好。"
    );
  } else {
    push(
      "保持现在的组合",
      "热量和蛋白质都在目标附近，不用大改。下周继续按同样比例搭配即可。"
    );
  }

  if (streak.current >= 3) {
    push(
      `连续记录 ${streak.current} 天`,
      "连续不是目的，稳定看见自己才是。每天记一餐就够，不必为了打卡硬凑。"
    );
  } else {
    push(
      "固定一个记录时间",
      "把记录放在晚餐后或睡前，比想起来才记更容易坚持。"
    );
  }

  if (comparison.deltaRecordedDays > 0) {
    push(
      `比${lastLabel}多记了几天`,
      `本周 ${recordedDays} 天，${lastLabel} ${comparison.recordedDays} 天。多出来的记录，就是更清楚的趋势。`
    );
  } else if (comparison.deltaRecordedDays < 0) {
    push(
      `这周比${lastLabel}少记了几天`,
      `${lastLabel} ${comparison.recordedDays} 天，本周 ${recordedDays} 天。先把其中一天补回来就够，不用一次追平。`
    );
  } else if (comparison.deltaKcal !== null && Math.abs(comparison.deltaKcal) >= 80) {
    push(
      `热量比${lastLabel}有变化`,
      `平均每天${comparison.deltaKcal > 0 ? "多" : "少"} ${Math.abs(
        Math.round(comparison.deltaKcal)
      )} kcal。不用立刻大幅调整，先观察一周。`
    );
  } else {
    push("周末花 3 分钟回看", "看看哪一天最容易漏记，下周只改这一个点。");
  }

  if (tips.length < 3) {
    push(
      "下一周只改一个点",
      "记录、蛋白质、蔬菜里选一个最容易做到的，不要同时改三件事。"
    );
  }
  if (tips.length < 3) {
    push(
      "保持记录，不用追求完美",
      "外食、聚餐、估算偏差都很正常。先把记录做连续，再谈准确。"
    );
  }

  return { headline, body, tips };
}

export interface WeeklyReportInput {
  weekStart: string;
  today: string;
  targets: Targets;
  records: DayRecord[];
  previousRecords: DayRecord[];
  recordedDates: string[];
  earliestDate: string | null;
}

export function buildWeeklyReport(input: WeeklyReportInput): WeeklyReport {
  const { weekStart, today, targets, records, previousRecords, recordedDates, earliestDate } =
    input;
  const weekEnd = weekEndKey(weekStart);
  const previousWeekStart = shiftDateKey(weekStart, -7);
  const previousWeekEnd = shiftDateKey(weekStart, -1);
  const days = buildWeekDays(records, weekStart, today, targets);
  const previousDays = buildWeekDays(previousRecords, previousWeekStart, today, targets);
  const currentWeekStart = weekStartKey(today);
  const isCurrentWeek = weekStart === currentWeekStart;
  const todayIndex = days.findIndex((day) => day.isToday);
  const comparison = buildComparison(
    days,
    previousDays,
    previousWeekStart,
    previousWeekEnd,
    isCurrentWeek && todayIndex >= 0 ? todayIndex : null
  );
  const streak = buildStreak(recordedDates, today);
  const recordedDays = days.filter((day) => day.recorded).length;
  const calorieHitDays = days.filter((day) => day.calorieHit).length;
  const proteinHitDays = days.filter((day) => day.proteinHit).length;
  const averageKcal = average(recordedValues(days, (day) => day.totals.kcal), 0);
  const averageProtein = average(recordedValues(days, (day) => day.totals.protein), 1);
  const averageQuality = average(recordedValues(days, (day) => day.quality), 0);
  const summary = buildSummary({
    recordedDays,
    calorieHitDays,
    proteinHitDays,
    averageKcal,
    averageProtein,
    averageQuality,
    targets,
    streak,
    comparison
  });

  const canGoNext = weekStart < currentWeekStart;
  const earliestWeek = earliestDate ? weekStartKey(earliestDate) : null;
  const canGoPrev = earliestWeek !== null && earliestWeek < weekStart;

  return {
    weekStart,
    weekEnd,
    isCurrentWeek,
    today,
    days,
    recordedDays,
    calorieHitDays,
    proteinHitDays,
    averageKcal,
    averageProtein,
    averageQuality,
    qualityLabel: averageQuality === null ? null : qualityLabel(Math.round(averageQuality)),
    streak,
    comparison,
    summary,
    targets,
    canGoPrev,
    canGoNext,
    previousWeekStart: canGoPrev ? previousWeekStart : null,
    nextWeekStart: canGoNext ? shiftDateKey(weekStart, 7) : null
  };
}
