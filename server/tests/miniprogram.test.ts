import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import vm from "node:vm";
import { scaleNutrition, sumNutrition } from "../../shared/nutrition.ts";
import {
  bodyMetrics as sharedBodyMetrics,
  computeTargets as sharedComputeTargets,
  isBodyComplete as sharedIsBodyComplete,
  type CompleteBodyProfile
} from "../../shared/body.ts";

const root = process.cwd();
const cache = new Map<string, unknown>();

function loadCommonJs(relativePath: string): any {
  const file = path.resolve(root, relativePath);
  if (cache.has(file)) return cache.get(file);

  const code = fs.readFileSync(file, "utf8");
  const module = { exports: {} as Record<string, unknown> };
  cache.set(file, module.exports);

  const wrapper = new vm.Script(
    `(function (require, module, exports) {\n${code}\n})`,
    { filename: file }
  ).runInThisContext() as (
    require: (id: string) => unknown,
    module: { exports: unknown },
    exports: unknown
  ) => void;

  const localRequire = (id: string) => {
    if (!id.startsWith(".")) throw new Error(`unexpected require: ${id}`);
    const target = path.resolve(path.dirname(file), id);
    return loadCommonJs(path.relative(root, target.endsWith(".js") ? target : `${target}.js`));
  };

  wrapper(localRequire, module, module.exports);
  cache.set(file, module.exports);
  return module.exports;
}

test("小程序营养工具与服务端共享计算一致", () => {
  const mini = loadCommonJs("miniprogram/utils/nutrition.js");
  const per100g = { kcal: 165, protein: 31, carbs: 0, fat: 3.6, fiber: 0 };
  assert.deepEqual(mini.scale(per100g, 120), scaleNutrition(per100g, 120));

  const items = [
    { nutrition: mini.scale(per100g, 120) },
    { nutrition: mini.scale({ kcal: 116, protein: 2.6, carbs: 25.9, fat: 0.3, fiber: 0.3 }, 150) }
  ];
  assert.deepEqual(mini.sum(items), sumNutrition(items));
});

test("小程序身体数据与目标计算与服务端一致", () => {
  const mini = loadCommonJs("miniprogram/utils/body.js");
  const bodies: CompleteBodyProfile[] = [
    { sex: "female", age: 28, heightCm: 165, weightKg: 58, activityLevel: "light" },
    { sex: "male", age: 35, heightCm: 178, weightKg: 78, activityLevel: "moderate" },
    { sex: "female", age: 45, heightCm: 158, weightKg: 82, activityLevel: "sedentary" }
  ];
  const goals = ["fat-loss", "maintain", "muscle"] as const;

  for (const body of bodies) {
    assert.equal(mini.isComplete(body), sharedIsBodyComplete(body));
    assert.deepEqual(mini.metrics(body), sharedBodyMetrics(body));
    for (const goal of goals) {
      assert.deepEqual(mini.computeTargets(body, goal), sharedComputeTargets(body, goal));
    }
  }

  const incomplete = {
    sex: "female",
    age: 28,
    heightCm: null,
    weightKg: 58,
    activityLevel: "light"
  } as const;
  assert.equal(mini.isComplete(incomplete), sharedIsBodyComplete(incomplete));
});

test("小程序份量参照与剩饭比例计算正确", () => {
  const portion = loadCommonJs("miniprogram/utils/portion.js");

  assert.deepEqual(portion.parseHint("半盒 · 150g"), { label: "半盒", grams: 150 });
  assert.equal(portion.parseHint("按实际份量调整"), null);

  const refs = portion.referencesFor({ category: "staple", portionHint: "一碗 · 150g" });
  assert.ok(refs.some((ref: { grams: number }) => ref.grams === 150));
  assert.ok(refs.some((ref: { grams: number }) => ref.grams === 100));

  const scaled = portion.applyRatio([{ grams: 200, baseGrams: 200 }, { grams: 100 }], 0.5);
  assert.deepEqual(
    scaled.map((item: { grams: number }) => item.grams),
    [100, 50]
  );
  assert.deepEqual(
    scaled.map((item: { baseGrams: number }) => item.baseGrams),
    [200, 100]
  );

  const adjusted = portion.setGrams({ grams: 100, baseGrams: 100 }, 60, 0.5);
  assert.equal(adjusted.grams, 60);
  assert.equal(adjusted.baseGrams, 120);
});

test("小程序页面与组件脚本可以在微信运行时外壳下加载", () => {
  const files = [
    "miniprogram/app.js",
    "miniprogram/pages/home/index.js",
    "miniprogram/pages/review/index.js",
    "miniprogram/pages/food-search/index.js",
    "miniprogram/pages/journal/index.js",
    "miniprogram/pages/goals/index.js",
    "miniprogram/pages/weight/index.js",
    "miniprogram/components/progress-ring/index.js",
    "miniprogram/components/macro-bar/index.js",
    "miniprogram/components/advice-card/index.js"
  ];

  for (const relative of files) {
    const file = path.resolve(root, relative);
    const code = fs.readFileSync(file, "utf8");
    let captured: unknown = null;
    let kind = "";
    const sandbox: Record<string, unknown> = {
      console,
      setTimeout,
      clearTimeout,
      Date,
      Math,
      Promise,
      Page(definition: unknown) {
        captured = definition;
        kind = "page";
      },
      Component(definition: unknown) {
        captured = definition;
        kind = "component";
      },
      App(definition: unknown) {
        captured = definition;
        kind = "app";
      },
      getApp() {
        return { globalData: {} };
      },
      wx: {},
      require(id: string) {
        if (!id.startsWith(".")) throw new Error(`unexpected require: ${id}`);
        const target = path.resolve(path.dirname(file), id);
        return loadCommonJs(
          path.relative(root, target.endsWith(".js") ? target : `${target}.js`)
        );
      }
    };

    vm.createContext(sandbox);
    assert.doesNotThrow(() => {
      vm.runInContext(code, sandbox, { filename: file });
    }, relative);
    assert.ok(captured, `${relative} did not register a Page/Component/App`);
    assert.ok(kind, `${relative} registration kind missing`);
  }
});

test("小程序餐盘评分与建议保持三条", () => {
  const nutrition = loadCommonJs("miniprogram/utils/nutrition.js");
  const advice = loadCommonJs("miniprogram/utils/advice.js");
  const targets = { kcal: 1800, protein: 110, carbs: 190, fat: 55, fiber: 25 };
  const items = [
    {
      name: "鸡胸肉",
      category: "protein",
      grams: 120,
      nutrition: nutrition.scale({ kcal: 165, protein: 31, carbs: 0, fat: 3.6, fiber: 0 }, 120)
    },
    {
      name: "米饭",
      category: "staple",
      grams: 150,
      nutrition: nutrition.scale({ kcal: 116, protein: 2.6, carbs: 25.9, fat: 0.3, fiber: 0.3 }, 150)
    },
    {
      name: "西兰花",
      category: "vegetable",
      grams: 150,
      nutrition: nutrition.scale({ kcal: 34, protein: 2.8, carbs: 6.6, fat: 0.4, fiber: 2.6 }, 150)
    }
  ];
  const totals = nutrition.sum(items);
  const quality = advice.plateQuality(items, totals, targets);
  const tips = advice.mealAdvice(items, totals, targets);
  assert.ok(quality.score >= 30 && quality.score <= 98);
  assert.equal(tips.length, 3);
  assert.equal(new Set(tips.map((tip: { kind: string }) => tip.kind)).size, 3);
});
