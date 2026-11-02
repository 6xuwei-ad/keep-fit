import type {
  ActivityLevel,
  BodyMetrics,
  BodyProfile,
  Goal,
  Sex,
  Targets
} from "./types.ts";
import { round } from "./nutrition.ts";

/**
 * 身体数据与目标推算。
 *
 * 这里只做“估算”，不替代医学或营养处方：
 * - BMR 使用 Mifflin-St Jeor 公式
 * - TDEE = BMR × 活动系数
 * - 目标热量按减脂 / 维持 / 增肌做温和调整
 * - 蛋白质按体重、脂肪按体重下限、碳水补足剩余热量
 */

export const MIN_AGE = 18;
export const MAX_AGE = 80;
export const MIN_HEIGHT_CM = 120;
export const MAX_HEIGHT_CM = 230;
export const MIN_WEIGHT_KG = 30;
export const MAX_WEIGHT_KG = 250;

export const ACTIVITY_MULTIPLIERS: Record<ActivityLevel, number> = {
  sedentary: 1.2,
  light: 1.375,
  moderate: 1.55,
  active: 1.725,
  "very-active": 1.9
};

export const ACTIVITY_LABELS: Record<ActivityLevel, string> = {
  sedentary: "久坐",
  light: "轻活动",
  moderate: "中活动",
  active: "高活动",
  "very-active": "很高活动"
};

export const ACTIVITY_OPTIONS: Array<{
  id: ActivityLevel;
  label: string;
  description: string;
}> = [
  { id: "sedentary", label: "久坐", description: "几乎不运动，办公室为主" },
  { id: "light", label: "轻活动", description: "每周 1–3 次轻运动" },
  { id: "moderate", label: "中活动", description: "每周 3–5 次训练" },
  { id: "active", label: "高活动", description: "每周 6–7 次训练" },
  { id: "very-active", label: "很高", description: "体力工作或一天两练" }
];

export interface CompleteBodyProfile extends BodyProfile {
  sex: Sex;
  age: number;
  heightCm: number;
  weightKg: number;
  activityLevel: ActivityLevel;
}

function isSex(value: unknown): value is Sex {
  return value === "female" || value === "male";
}

function isActivityLevel(value: unknown): value is ActivityLevel {
  return typeof value === "string" && value in ACTIVITY_MULTIPLIERS;
}

function inRange(value: unknown, min: number, max: number): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= min && value <= max;
}

export function isBodyComplete(body: Partial<BodyProfile>): body is CompleteBodyProfile {
  return (
    isSex(body.sex) &&
    inRange(body.age, MIN_AGE, MAX_AGE) &&
    inRange(body.heightCm, MIN_HEIGHT_CM, MAX_HEIGHT_CM) &&
    inRange(body.weightKg, MIN_WEIGHT_KG, MAX_WEIGHT_KG) &&
    isActivityLevel(body.activityLevel)
  );
}

/** Mifflin-St Jeor。调用前应先用 isBodyComplete 校验。 */
export function calculateBmr(body: CompleteBodyProfile): number {
  const base = 10 * body.weightKg + 6.25 * body.heightCm - 5 * body.age;
  return body.sex === "male" ? base + 5 : base - 161;
}

export function calculateTdee(body: CompleteBodyProfile): number {
  return calculateBmr(body) * ACTIVITY_MULTIPLIERS[body.activityLevel];
}

export function bodyMetrics(body: CompleteBodyProfile): BodyMetrics {
  const bmr = round(calculateBmr(body), 0);
  const tdee = round(bmr * ACTIVITY_MULTIPLIERS[body.activityLevel], 0);
  return { bmr, tdee };
}

function roundTo(value: number, step: number): number {
  return Math.round(value / step) * step;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export interface TargetPlan extends BodyMetrics {
  targets: Targets;
}

/**
 * 根据身体数据和目标计算每日目标。
 * 返回的 targets 是“推荐值”，用户仍可在客户端手动覆盖。
 */
export function computeTargets(body: CompleteBodyProfile, goal: Goal): TargetPlan {
  const metrics = bodyMetrics(body);
  const { bmr, tdee } = metrics;

  let kcal: number;
  if (goal === "fat-loss") {
    const deficit = Math.max(300, tdee * 0.15);
    const floor = body.sex === "male" ? 1500 : 1200;
    kcal = Math.max(tdee - deficit, floor);
  } else if (goal === "muscle") {
    kcal = tdee + Math.max(200, tdee * 0.1);
  } else {
    kcal = tdee;
  }
  kcal = roundTo(clamp(kcal, 1200, 4000), 10);

  const proteinPerKg = goal === "maintain" ? 1.4 : 1.8;
  const protein = roundTo(clamp(body.weightKg * proteinPerKg, 60, 220), 5);
  const fat = roundTo(clamp(body.weightKg * 0.8, 40, 120), 5);
  const carbs = roundTo(
    clamp((kcal - protein * 4 - fat * 9) / 4, 50, 600),
    5
  );
  const fiber = roundTo(clamp((kcal / 1000) * 14, 20, 40), 5);

  return {
    bmr,
    tdee,
    targets: { kcal, protein, carbs, fat, fiber }
  };
}
