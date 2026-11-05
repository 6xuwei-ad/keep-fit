import type { FoodCategory, NutritionFacts } from "../../shared/types.ts";
import { clamp, round, scaleNutrition } from "../../shared/nutrition.ts";
import { FOOD_BY_ID, resolveFood, portionHintFor, type FoodRecord } from "../data/foods.ts";

export interface RawVisionItem {
  name: string;
  grams: number;
  confidence: number;
  category: FoodCategory;
  per100g?: NutritionFacts;
  portionHint?: string;
  foodId?: string | null;
  emoji?: string;
}

const CATEGORY_FALLBACK: FoodCategory = "other";
const GENERIC_PER_100G: NutritionFacts = {
  kcal: 150,
  protein: 8,
  carbs: 15,
  fat: 6,
  fiber: 1.5
};

function validPer100g(value: NutritionFacts | undefined): NutritionFacts | null {
  if (!value) return null;
  const numbers = [value.kcal, value.protein, value.carbs, value.fat, value.fiber];
  if (numbers.some((n) => !Number.isFinite(n) || n < 0)) return null;
  return {
    kcal: clamp(value.kcal, 0, 900),
    protein: clamp(value.protein, 0, 100),
    carbs: clamp(value.carbs, 0, 100),
    fat: clamp(value.fat, 0, 100),
    fiber: clamp(value.fiber, 0, 100)
  };
}

function pickPer100g(food: FoodRecord | null, aiValue: NutritionFacts | undefined): {
  value: NutritionFacts;
  source: "database" | "ai";
} {
  if (food) return { value: food.per100g, source: "database" };
  const validated = validPer100g(aiValue);
  return { value: validated ?? GENERIC_PER_100G, source: "ai" };
}

function safeCategory(value: FoodCategory | undefined): FoodCategory {
  const allowed: FoodCategory[] = [
    "protein",
    "staple",
    "vegetable",
    "fruit",
    "dairy",
    "fat",
    "dish",
    "drink",
    "other"
  ];
  return value && allowed.includes(value) ? value : CATEGORY_FALLBACK;
}

/**
 * 把“模型结果 / 用户编辑后的条目”统一成可信的 FoodItem：
 * 能命中本地营养库就覆盖模型估值，保证克数变化时计算一致。
 */
export function makeFoodItem(input: {
  name: string;
  grams: number;
  confidence?: number;
  category?: FoodCategory;
  per100g?: NutritionFacts;
  portionHint?: string;
  foodId?: string | null;
  emoji?: string;
}): {
  id: string;
  foodId: string | null;
  name: string;
  emoji: string;
  category: FoodCategory;
  grams: number;
  confidence: number;
  portionHint: string;
  per100g: NutritionFacts;
  nutrition: NutritionFacts;
  source: "database" | "ai" | "custom";
} {
  const grams = Math.round(clamp(Number(input.grams) || 0, 1, 3000));
  const customId =
    input.foodId && input.foodId.startsWith("custom_") ? input.foodId : null;
  const customPer100g = customId ? validPer100g(input.per100g) : null;

  // 自定义食物不在内置库里，保留 foodId 与用户填写的营养值。
  if (customId && customPer100g) {
    return {
      id: crypto.randomUUID(),
      foodId: customId,
      name: input.name.trim().slice(0, 40) || "自定义食物",
      emoji: input.emoji?.trim().slice(0, 8) || "🍽️",
      category: safeCategory(input.category),
      grams,
      confidence: clamp(Number(input.confidence) || 0.7, 0.1, 1),
      portionHint: input.portionHint?.trim().slice(0, 30) || "手动添加",
      per100g: customPer100g,
      nutrition: scaleNutrition(customPer100g, grams),
      source: "custom"
    };
  }

  const byId = input.foodId ? FOOD_BY_ID.get(input.foodId) ?? null : null;
  const food = byId ?? resolveFood(input.name);
  const { value: per100g, source } = pickPer100g(food, input.per100g);
  const category = food?.category ?? safeCategory(input.category);

  return {
    id: crypto.randomUUID(),
    foodId: food?.id ?? null,
    name: input.name.trim().slice(0, 40) || food?.name || "未知食物",
    emoji: food?.emoji ?? (input.emoji?.trim().slice(0, 8) || "🍽️"),
    category,
    grams,
    confidence: clamp(Number(input.confidence) || 0.7, 0.1, 1),
    portionHint: input.portionHint?.trim().slice(0, 30) || portionHintFor(food),
    per100g,
    nutrition: scaleNutrition(per100g, grams),
    source
  };
}

/** 合并重复食材，避免“鸡胸肉”和“鸡胸肉片”各占一行。 */
export function mergeItems(items: ReturnType<typeof makeFoodItem>[]): ReturnType<typeof makeFoodItem>[] {
  const merged = new Map<string, ReturnType<typeof makeFoodItem>>();
  for (const item of items) {
    const key = item.foodId ?? item.name;
    const current = merged.get(key);
    if (!current) {
      merged.set(key, item);
      continue;
    }
    const grams = Math.min(3000, current.grams + item.grams);
    merged.set(key, {
      ...current,
      grams,
      confidence: Math.max(current.confidence, item.confidence),
      nutrition: scaleNutrition(current.per100g, grams)
    });
  }
  return Array.from(merged.values()).map((item) => ({
    ...item,
    grams: Math.round(item.grams),
    nutrition: {
      ...item.nutrition,
      kcal: round(item.nutrition.kcal),
      protein: round(item.nutrition.protein),
      carbs: round(item.nutrition.carbs),
      fat: round(item.nutrition.fat),
      fiber: round(item.nutrition.fiber)
    }
  }));
}

export function itemsTotal(items: Array<{ nutrition: NutritionFacts }>): NutritionFacts {
  return items.reduce<NutritionFacts>(
    (total, item) => ({
      kcal: round(total.kcal + item.nutrition.kcal),
      protein: round(total.protein + item.nutrition.protein),
      carbs: round(total.carbs + item.nutrition.carbs),
      fat: round(total.fat + item.nutrition.fat),
      fiber: round(total.fiber + item.nutrition.fiber)
    }),
    { kcal: 0, protein: 0, carbs: 0, fat: 0, fiber: 0 }
  );
}
