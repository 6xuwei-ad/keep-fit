import assert from "node:assert/strict";
import test from "node:test";
import {
  EMPTY_NUTRITION,
  inferMealType,
  localDateKey,
  macroEnergy,
  scaleNutrition,
  sumNutrition
} from "../../shared/nutrition.ts";
import { buildPlateQuality } from "../../shared/advice.ts";
import type { FoodItem, NutritionFacts, Targets } from "../../shared/types.ts";

const targets: Targets = {
  kcal: 1800,
  protein: 110,
  carbs: 190,
  fat: 55,
  fiber: 25
};

function item(
  name: string,
  grams: number,
  per100g: NutritionFacts,
  category: FoodItem["category"] = "protein"
): FoodItem {
  return {
    id: name,
    foodId: null,
    name,
    emoji: "🍽️",
    category,
    grams,
    confidence: 0.9,
    portionHint: "标准",
    per100g,
    nutrition: scaleNutrition(per100g, grams),
    source: "database"
  };
}

test("按克数缩放营养值并保持一位小数", () => {
  const scaled = scaleNutrition({ kcal: 165, protein: 31, carbs: 0, fat: 3.6, fiber: 0 }, 120);
  assert.deepEqual(scaled, { kcal: 198, protein: 37.2, carbs: 0, fat: 4.3, fiber: 0 });
});

test("汇总多种食物与空列表", () => {
  const total = sumNutrition([
    { nutrition: { kcal: 198, protein: 37.2, carbs: 0, fat: 4.3, fiber: 0 } },
    { nutrition: { kcal: 116, protein: 2.6, carbs: 25.9, fat: 0.3, fiber: 0.3 } }
  ]);
  assert.deepEqual(total, { kcal: 314, protein: 39.8, carbs: 25.9, fat: 4.6, fiber: 0.3 });
  assert.deepEqual(sumNutrition([]), EMPTY_NUTRITION);
});

test("宏量供能比例在零热量时安全返回", () => {
  assert.deepEqual(macroEnergy(EMPTY_NUTRITION), { protein: 0, carbs: 0, fat: 0 });
  const ratio = macroEnergy({ kcal: 200, protein: 20, carbs: 10, fat: 5, fiber: 2 });
  assert.deepEqual(ratio, { protein: 48, carbs: 24, fat: 27 });
});

test("日期与餐次按上海时区推断", () => {
  const utcNoon = new Date("2026-10-31T04:00:00.000Z");
  assert.equal(localDateKey(utcNoon), "2026-10-31");
  assert.equal(inferMealType(utcNoon), "lunch");
});

test("餐盘质量评分在 30–98 之间并给出摘要", () => {
  const chicken = item("鸡胸肉", 120, { kcal: 165, protein: 31, carbs: 0, fat: 3.6, fiber: 0 });
  const rice = item("米饭", 150, { kcal: 116, protein: 2.6, carbs: 25.9, fat: 0.3, fiber: 0.3 }, "staple");
  const broccoli = item("西兰花", 150, { kcal: 34, protein: 2.8, carbs: 6.6, fat: 0.4, fiber: 2.6 }, "vegetable");
  const total = sumNutrition([chicken, rice, broccoli]);
  const quality = buildPlateQuality([chicken, rice, broccoli], total, targets);
  assert.ok(quality.score >= 30 && quality.score <= 98);
  assert.ok(quality.label.length > 0);
  assert.ok(quality.summary.length > 0);
});
