import type {
  FoodCategory,
  FoodItem,
  NutritionFacts,
  Targets
} from "./types.ts";

export const EMPTY_NUTRITION: NutritionFacts = {
  kcal: 0,
  protein: 0,
  carbs: 0,
  fat: 0,
  fiber: 0
};

export const DEFAULT_TARGETS: Targets = {
  kcal: 1800,
  protein: 110,
  carbs: 190,
  fat: 55,
  fiber: 25
};

export const GOAL_TARGETS: Record<"fat-loss" | "maintain" | "muscle", Targets> = {
  "fat-loss": { kcal: 1600, protein: 120, carbs: 160, fat: 50, fiber: 25 },
  maintain: { kcal: 1900, protein: 110, carbs: 210, fat: 60, fiber: 25 },
  muscle: { kcal: 2300, protein: 150, carbs: 260, fat: 65, fiber: 30 }
};

export const CATEGORY_LABELS: Record<FoodCategory, string> = {
  protein: "优质蛋白",
  staple: "主食",
  vegetable: "蔬菜",
  fruit: "水果",
  dairy: "乳制品",
  fat: "油脂",
  dish: "菜肴",
  drink: "饮品",
  other: "其他"
};

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function round(value: number, digits = 1): number {
  const factor = 10 ** digits;
  return Math.round((value + Number.EPSILON) * factor) / factor;
}

/** 按可食克数缩放每 100g 营养值。 */
export function scaleNutrition(per100g: NutritionFacts, grams: number): NutritionFacts {
  const ratio = clamp(grams, 0, 5000) / 100;
  return {
    kcal: round(per100g.kcal * ratio),
    protein: round(per100g.protein * ratio),
    carbs: round(per100g.carbs * ratio),
    fat: round(per100g.fat * ratio),
    fiber: round(per100g.fiber * ratio)
  };
}

export function sumNutrition(list: Array<{ nutrition: NutritionFacts }>): NutritionFacts {
  return list.reduce<NutritionFacts>(
    (total, item) => ({
      kcal: round(total.kcal + item.nutrition.kcal),
      protein: round(total.protein + item.nutrition.protein),
      carbs: round(total.carbs + item.nutrition.carbs),
      fat: round(total.fat + item.nutrition.fat),
      fiber: round(total.fiber + item.nutrition.fiber)
    }),
    { ...EMPTY_NUTRITION }
  );
}

export function withNutrition(item: Omit<FoodItem, "nutrition">, grams: number): FoodItem {
  return {
    ...item,
    grams,
    nutrition: scaleNutrition(item.per100g, grams)
  };
}

export function macroEnergy(nutrition: NutritionFacts): {
  protein: number;
  carbs: number;
  fat: number;
} {
  const protein = nutrition.protein * 4;
  const carbs = nutrition.carbs * 4;
  const fat = nutrition.fat * 9;
  const total = protein + carbs + fat;
  if (total <= 0) return { protein: 0, carbs: 0, fat: 0 };
  return {
    protein: Math.round((protein / total) * 100),
    carbs: Math.round((carbs / total) * 100),
    fat: Math.round((fat / total) * 100)
  };
}

export function caloriePercent(consumed: number, target: number): number {
  if (!target) return 0;
  return Math.round((consumed / target) * 100);
}

export function localDateKey(date = new Date(), timeZone = "Asia/Shanghai"): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(date);
  const pick = (type: string) => parts.find((part) => part.type === type)?.value ?? "";
  return `${pick("year")}-${pick("month")}-${pick("day")}`;
}

export function inferMealType(date = new Date(), timeZone = "Asia/Shanghai"): "breakfast" | "lunch" | "dinner" | "snack" {
  const hour = Number(
    new Intl.DateTimeFormat("en-US", {
      timeZone,
      hour: "2-digit",
      hour12: false
    }).format(date)
  );
  if (hour >= 5 && hour < 10.5) return "breakfast";
  if (hour >= 10.5 && hour < 15) return "lunch";
  if (hour >= 17 && hour < 21.5) return "dinner";
  return "snack";
}

export const MEAL_TYPE_LABELS = {
  breakfast: "早餐",
  lunch: "午餐",
  dinner: "晚餐",
  snack: "加餐"
} as const;
