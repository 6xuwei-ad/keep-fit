import assert from "node:assert/strict";
import test from "node:test";
import { normalizeLabel, type LabelOcrInput } from "../services/label.ts";

function input(overrides: Partial<LabelOcrInput> = {}): LabelOcrInput {
  return {
    productName: "测试酸奶",
    basis: "100g",
    servingSize: 100,
    servingUnit: "g",
    kcal: 72,
    protein: 3.1,
    carbs: 10.5,
    fat: 2.8,
    fiber: 0,
    confidence: 92,
    ...overrides
  };
}

test("营养标签按 kJ 换算 kcal，并保留每 100g 数值", () => {
  const result = normalizeLabel(
    input({
      kcal: undefined,
      energyKj: 1200,
      productName: "燕麦片",
      protein: 8.2,
      carbs: 45.1,
      fat: 7.6,
      fiber: 2.1
    })
  );

  assert.equal(result.productName, "燕麦片");
  assert.equal(result.basis, "100g");
  assert.equal(result.per100g.kcal, 286.8);
  assert.equal(result.per100g.protein, 8.2);
  assert.equal(result.per100g.carbs, 45.1);
  assert.equal(result.confidence, 0.92);
  assert.equal(result.energyKj, 1200);
});

test("标签按每份标注时折算成每 100g", () => {
  const result = normalizeLabel(
    input({
      basis: "serving",
      servingSize: 30,
      servingUnit: "g",
      kcal: 120,
      protein: 3,
      carbs: 15,
      fat: 4,
      fiber: 1
    })
  );

  assert.equal(result.basis, "100g");
  assert.equal(result.servingSize, 30);
  assert.equal(result.per100g.kcal, 400);
  assert.equal(result.per100g.protein, 10);
  assert.equal(result.per100g.carbs, 50);
  assert.equal(result.per100g.fat, 13.3);
  assert.equal(result.per100g.fiber, 3.3);
});

test("每 100ml 标签保留液体基准，并归一化钠", () => {
  const result = normalizeLabel(
    input({
      basis: "serving",
      servingSize: 250,
      servingUnit: "ml",
      kcal: 100,
      protein: 2,
      carbs: 12,
      fat: 3,
      fiber: 0,
      sodium: 125,
      energyKj: 418
    })
  );

  assert.equal(result.basis, "100ml");
  assert.equal(result.servingUnit, "ml");
  assert.equal(result.per100g.kcal, 40);
  assert.equal(result.per100g.carbs, 4.8);
  assert.equal(result.sodium, 50);
  assert.equal(result.energyKj, 167);
});

test("没有产品名时给兜底名称，并把置信度限制在 0–1", () => {
  const result = normalizeLabel(
    input({ productName: undefined, confidence: 100, notice: "" })
  );
  assert.equal(result.productName, "包装食品");
  assert.equal(result.confidence, 1);
  assert.match(result.notice, /包装标签/);
});
