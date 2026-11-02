/**
 * 身体数据与目标推算，与 shared/body.ts 保持一致。
 * 小程序端只用于输入时的即时预览，保存时服务端会重新计算。
 */

const MIN_AGE = 18;
const MAX_AGE = 80;
const MIN_HEIGHT_CM = 120;
const MAX_HEIGHT_CM = 230;
const MIN_WEIGHT_KG = 30;
const MAX_WEIGHT_KG = 250;

const ACTIVITY_MULTIPLIERS = {
  sedentary: 1.2,
  light: 1.375,
  moderate: 1.55,
  active: 1.725,
  "very-active": 1.9
};

const ACTIVITY_OPTIONS = [
  { id: "sedentary", label: "久坐", description: "几乎不运动，办公室为主" },
  { id: "light", label: "轻活动", description: "每周 1–3 次轻运动" },
  { id: "moderate", label: "中活动", description: "每周 3–5 次训练" },
  { id: "active", label: "高活动", description: "每周 6–7 次训练" },
  { id: "very-active", label: "很高", description: "体力工作或一天两练" }
];

function round(value, digits) {
  const places = digits === undefined ? 1 : digits;
  const factor = Math.pow(10, places);
  return Math.round((value + Number.EPSILON) * factor) / factor;
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function roundTo(value, step) {
  return Math.round(value / step) * step;
}

function isSex(value) {
  return value === "female" || value === "male";
}

function isActivityLevel(value) {
  return typeof value === "string" && Object.prototype.hasOwnProperty.call(ACTIVITY_MULTIPLIERS, value);
}

function inRange(value, min, max) {
  return typeof value === "number" && isFinite(value) && value >= min && value <= max;
}

function isComplete(body) {
  return (
    isSex(body.sex) &&
    inRange(body.age, MIN_AGE, MAX_AGE) &&
    inRange(body.heightCm, MIN_HEIGHT_CM, MAX_HEIGHT_CM) &&
    inRange(body.weightKg, MIN_WEIGHT_KG, MAX_WEIGHT_KG) &&
    isActivityLevel(body.activityLevel)
  );
}

function calculateBmr(body) {
  const base = 10 * body.weightKg + 6.25 * body.heightCm - 5 * body.age;
  return body.sex === "male" ? base + 5 : base - 161;
}

function metrics(body) {
  const bmr = round(calculateBmr(body), 0);
  const tdee = round(bmr * ACTIVITY_MULTIPLIERS[body.activityLevel], 0);
  return { bmr, tdee };
}

function computeTargets(body, goal) {
  const bases = metrics(body);
  const bmr = bases.bmr;
  const tdee = bases.tdee;
  let kcal;

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
  const carbs = roundTo(clamp((kcal - protein * 4 - fat * 9) / 4, 50, 600), 5);
  const fiber = roundTo(clamp((kcal / 1000) * 14, 20, 40), 5);

  return {
    bmr,
    tdee,
    targets: { kcal, protein, carbs, fat, fiber }
  };
}

module.exports = {
  MIN_AGE,
  MAX_AGE,
  MIN_HEIGHT_CM,
  MAX_HEIGHT_CM,
  MIN_WEIGHT_KG,
  MAX_WEIGHT_KG,
  ACTIVITY_OPTIONS,
  ACTIVITY_MULTIPLIERS,
  isComplete,
  metrics,
  computeTargets
};
