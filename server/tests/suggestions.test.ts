import assert from "node:assert/strict";
import test from "node:test";
import { buildDailyAdvice, buildMealAdvice } from "../../shared/advice.ts";
import type { FoodItem, NutritionFacts, Targets } from "../../shared/types.ts";
import { scaleNutrition } from "../../shared/nutrition.ts";

const targets: Targets = {
  kcal: 1800,
  protein: 110,
  carbs: 190,
  fat: 55,
  fiber: 25
};

function item(name: string, grams: number, per100g: NutritionFacts, category: FoodItem["category"]): FoodItem {
  return {
    id: name,
    foodId: null,
    name,
    emoji: "🍽️",
    category,
    grams,
    confidence: 0.8,
    portionHint: "标准",
    per100g,
    nutrition: scaleNutrition(per100g, grams),
    source: "ai"
  };
}

test("无论营养结构如何，一餐建议始终为 3 条", () => {
  const items = [
    item("鸡胸肉", 120, { kcal: 165, protein: 31, carbs: 0, fat: 3.6, fiber: 0 }, "protein"),
    item("米饭", 150, { kcal: 116, protein: 2.6, carbs: 25.9, fat: 0.3, fiber: 0.3 }, "staple"),
    item("西兰花", 150, { kcal: 34, protein: 2.8, carbs: 6.6, fat: 0.4, fiber: 2.6 }, "vegetable")
  ];
  const totals = items.reduce<NutritionFacts>(
    (sum, food) => ({
      kcal: sum.kcal + food.nutrition.kcal,
      protein: sum.protein + food.nutrition.protein,
      carbs: sum.carbs + food.nutrition.carbs,
      fat: sum.fat + food.nutrition.fat,
      fiber: sum.fiber + food.nutrition.fiber
    }),
    { kcal: 0, protein: 0, carbs: 0, fat: 0, fiber: 0 }
  );
  const advice = buildMealAdvice(items, totals, targets);
  assert.equal(advice.length, 3);
  assert.equal(new Set(advice.map((tip) => tip.kind)).size, 3);
});

test("蛋白质不足时会给出可执行的补充建议", () => {
  const items = [item("生菜", 100, { kcal: 15, protein: 1.4, carbs: 2.9, fat: 0.2, fiber: 1.3 }, "vegetable")];
  const totals = { kcal: 15, protein: 1.4, carbs: 2.9, fat: 0.2, fiber: 1.3 };
  const advice = buildMealAdvice(items, totals, targets);
  assert.ok(advice.some((tip) => tip.kind === "protein"));
  assert.equal(advice.length, 3);
});

test("空日记与有记录的日记都生成 3 条建议", () => {
  const empty = buildDailyAdvice({ kcal: 0, protein: 0, carbs: 0, fat: 0, fiber: 0 }, targets, 0, 0);
  assert.equal(empty.length, 3);
  assert.equal(empty[0]?.kind, "balance");

  const filled = buildDailyAdvice(
    { kcal: 1400, protein: 60, carbs: 160, fat: 48, fiber: 12 },
    targets,
    3,
    78
  );
  assert.equal(filled.length, 3);
});
