import assert from "node:assert/strict";
import { once } from "node:events";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import type { AddressInfo } from "node:net";
import { localDateKey, shiftDateKey } from "../../shared/nutrition.ts";
import { weekStartKey } from "../../shared/weight.ts";
import type {
  AnalysisResult,
  CustomFood,
  DayResponse,
  Meal,
  MealTemplate,
  Profile,
  RepeatResponse,
  WeeklyReport,
  WeightLog,
  WeightTrendResponse
} from "../../shared/types.ts";
import { createApp } from "../app.ts";
import { loadConfig } from "../config.ts";
import { signSession } from "../lib/session.ts";
import { Store } from "../store.ts";

const DEVICE = "test-device-0001";

test("识别、保存、汇总、删除的完整 API 流程", async (t) => {
  const dir = await mkdtemp(path.join(tmpdir(), "shike-test-"));
  const config = loadConfig({
    dataDir: dir,
    uploadDir: path.join(dir, "uploads"),
    publicDir: path.join(process.cwd(), "public"),
    visionEnabled: false,
    allowDemo: true
  });
  const store = new Store(path.join(dir, "test.db"));
  const app = createApp({ config, store });
  const server = app.listen(0, "127.0.0.1");
  await once(server, "listening");
  const port = (server.address() as AddressInfo).port;
  const base = `http://127.0.0.1:${port}`;

  t.after(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    store.close();
    await rm(dir, { recursive: true, force: true });
  });

  const get = (pathname: string) =>
    fetch(`${base}${pathname}`, { headers: { "x-device-id": DEVICE } });

  const health = await fetch(`${base}/api/health`);
  assert.equal(health.status, 200);
  const healthBody = (await health.json()) as { ok: boolean; mode: string };
  assert.equal(healthBody.ok, true);
  assert.equal(healthBody.mode, "demo");

  const meta = await fetch(`${base}/api/meta`);
  const metaBody = (await meta.json()) as { visionEnabled: boolean; wechatEnabled: boolean };
  assert.equal(metaBody.visionEnabled, false);
  assert.equal(metaBody.wechatEnabled, false);

  const wechatLogin = await fetch(`${base}/api/auth/wechat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ code: "mock-code" })
  });
  assert.equal(wechatLogin.status, 501);

  const session = signSession("wx_test_identity", config.sessionSecret, 600);
  const sessionDay = await fetch(`${base}/api/day?date=2026-10-31`, {
    headers: { Authorization: `Bearer ${session.token}`, "x-device-id": DEVICE }
  });
  assert.equal(sessionDay.status, 200);
  const sessionDayBody = (await sessionDay.json()) as DayResponse;
  assert.equal(sessionDayBody.profile.deviceId, "wx_test_identity");

  const tampered = await fetch(`${base}/api/profile`, {
    headers: { Authorization: `Bearer ${session.token}x`, "x-device-id": DEVICE }
  });
  assert.equal(tampered.status, 401);

  const demo = await fetch(`${base}/api/analyze/demo`, {
    method: "POST",
    headers: { "x-device-id": DEVICE, "Content-Type": "application/json" },
    body: JSON.stringify({})
  });
  assert.equal(demo.status, 201);
  const demoBody = (await demo.json()) as { analysis: AnalysisResult };
  assert.equal(demoBody.analysis.provider, "demo");
  assert.equal(demoBody.analysis.items.length, 8);

  const initial = await get("/api/day?date=2026-10-31");
  assert.equal(initial.status, 200);
  const initialBody = (await initial.json()) as DayResponse;
  assert.equal(initialBody.summary.meals.length, 0);
  assert.equal(initialBody.profile.targets.kcal, 1800);

  const updated = await fetch(`${base}/api/profile`, {
    method: "PUT",
    headers: { "x-device-id": DEVICE, "Content-Type": "application/json" },
    body: JSON.stringify({
      name: "测试用户",
      goal: "maintain",
      targets: { kcal: 1900, protein: 110, carbs: 210, fat: 60, fiber: 25 }
    })
  });
  assert.equal(updated.status, 200);
  const updatedBody = (await updated.json()) as { profile: Profile };
  assert.equal(updatedBody.profile.name, "测试用户");
  assert.equal(updatedBody.profile.targets.kcal, 1900);

  const foods = await get("/api/foods?q=鸡胸");
  assert.equal(foods.status, 200);
  const foodsBody = (await foods.json()) as { foods: Array<{ id: string; name: string }> };
  assert.ok(foodsBody.foods.some((food) => food.id === "chicken-breast"));

  const image = await readFile(path.join(process.cwd(), "public", "images", "demo-bowl.jpg"));
  const form = new FormData();
  form.append("image", new Blob([image], { type: "image/jpeg" }), "demo-bowl.jpg");
  const analyzed = await fetch(`${base}/api/analyze`, {
    method: "POST",
    headers: { "x-device-id": DEVICE },
    body: form
  });
  assert.equal(analyzed.status, 201);
  const analyzedBody = (await analyzed.json()) as { analysis: AnalysisResult };
  const analysis = analyzedBody.analysis;
  assert.equal(analysis.provider, "demo");
  assert.equal(analysis.items.length, 8);
  assert.ok(analysis.totals.kcal > 300);
  assert.equal(analysis.advice.length, 3);

  const mealPayload = {
    name: analysis.dishName,
    mealType: "lunch",
    date: "2026-10-31",
    eatenAt: "2026-10-31T12:30:00+08:00",
    imageUrl: analysis.imageUrl,
    engine: analysis.engine,
    items: analysis.items.map((item) => ({
      foodId: item.foodId,
      name: item.name,
      emoji: item.emoji,
      category: item.category,
      grams: item.grams,
      confidence: item.confidence,
      portionHint: item.portionHint,
      per100g: item.per100g
    }))
  };

  const saved = await fetch(`${base}/api/meals`, {
    method: "POST",
    headers: { "x-device-id": DEVICE, "Content-Type": "application/json" },
    body: JSON.stringify(mealPayload)
  });
  assert.equal(saved.status, 201);
  const savedBody = (await saved.json()) as { meal: Meal };
  assert.equal(savedBody.meal.items.length, 8);
  assert.ok(Math.abs(savedBody.meal.totals.kcal - analysis.totals.kcal) < 1);

  const day = await get("/api/day?date=2026-10-31");
  assert.equal(day.status, 200);
  const dayBody = (await day.json()) as DayResponse;
  assert.equal(dayBody.summary.meals.length, 1);
  assert.equal(dayBody.summary.advice.length, 3);
  assert.ok(dayBody.summary.caloriePercent > 0);

  const templateCreated = await fetch(`${base}/api/templates`, {
    method: "POST",
    headers: { "x-device-id": DEVICE, "Content-Type": "application/json" },
    body: JSON.stringify({ mealId: savedBody.meal.id })
  });
  assert.equal(templateCreated.status, 201);
  const templateBody = (await templateCreated.json()) as {
    template: MealTemplate;
    updated: boolean;
  };
  assert.equal(templateBody.updated, false);
  assert.equal(templateBody.template.itemCount, 8);
  assert.equal(templateBody.template.mealType, "lunch");
  assert.ok(Math.abs(templateBody.template.totals.kcal - savedBody.meal.totals.kcal) < 0.1);

  const templateAgain = await fetch(`${base}/api/templates`, {
    method: "POST",
    headers: { "x-device-id": DEVICE, "Content-Type": "application/json" },
    body: JSON.stringify({ mealId: savedBody.meal.id })
  });
  assert.equal(templateAgain.status, 200);
  const templateAgainBody = (await templateAgain.json()) as {
    template: MealTemplate;
    updated: boolean;
  };
  assert.equal(templateAgainBody.updated, true);
  assert.equal(templateAgainBody.template.id, templateBody.template.id);

  const repeat = await get("/api/repeat");
  assert.equal(repeat.status, 200);
  const repeatBody = (await repeat.json()) as RepeatResponse;
  assert.equal(repeatBody.templates.length, 1);
  assert.equal(repeatBody.templates[0]!.id, templateBody.template.id);

  const logged = await fetch(`${base}/api/templates/${templateBody.template.id}/log`, {
    method: "POST",
    headers: { "x-device-id": DEVICE, "Content-Type": "application/json" },
    body: JSON.stringify({ date: "2026-11-01" })
  });
  assert.equal(logged.status, 201);
  const loggedBody = (await logged.json()) as { meal: Meal };
  assert.equal(loggedBody.meal.date, "2026-11-01");
  assert.equal(loggedBody.meal.items.length, 8);
  assert.equal(loggedBody.meal.imageUrl, null);
  assert.ok(Math.abs(loggedBody.meal.totals.kcal - savedBody.meal.totals.kcal) < 0.1);

  const copied = await fetch(`${base}/api/meals/${savedBody.meal.id}/copy`, {
    method: "POST",
    headers: { "x-device-id": DEVICE, "Content-Type": "application/json" },
    body: JSON.stringify({ date: "2026-11-01" })
  });
  assert.equal(copied.status, 201);
  const copiedBody = (await copied.json()) as { meal: Meal };
  assert.notEqual(copiedBody.meal.id, savedBody.meal.id);
  assert.equal(copiedBody.meal.date, "2026-11-01");
  assert.equal(copiedBody.meal.items.length, 8);

  const dayTwo = await get("/api/day?date=2026-11-01");
  const dayTwoBody = (await dayTwo.json()) as DayResponse;
  assert.equal(dayTwoBody.summary.meals.length, 2);

  const yesterdayKey = shiftDateKey(localDateKey(), -1);
  const copiedYesterday = await fetch(`${base}/api/meals/${savedBody.meal.id}/copy`, {
    method: "POST",
    headers: { "x-device-id": DEVICE, "Content-Type": "application/json" },
    body: JSON.stringify({ date: yesterdayKey })
  });
  assert.equal(copiedYesterday.status, 201);
  const copiedYesterdayBody = (await copiedYesterday.json()) as { meal: Meal };
  const repeatWithYesterday = await get("/api/repeat");
  const repeatWithYesterdayBody = (await repeatWithYesterday.json()) as RepeatResponse;
  assert.equal(repeatWithYesterdayBody.yesterday.length, 1);
  assert.equal(repeatWithYesterdayBody.yesterday[0]!.id, copiedYesterdayBody.meal.id);

  const recentFoods = await get("/api/foods?recent=1");
  assert.equal(recentFoods.status, 200);
  const recentBody = (await recentFoods.json()) as {
    foods: Array<{ id: string; name: string }>;
  };
  assert.ok(recentBody.foods.some((food) => food.id === "silken-tofu"));

  const customPayload = {
    name: "自制香煎豆腐",
    emoji: "🍳",
    category: "protein",
    per100g: { kcal: 200, protein: 12, carbs: 8, fat: 14, fiber: 1 },
    portions: [{ label: "一小碟", grams: 80 }]
  };
  const customCreated = await fetch(`${base}/api/custom-foods`, {
    method: "POST",
    headers: { "x-device-id": DEVICE, "Content-Type": "application/json" },
    body: JSON.stringify(customPayload)
  });
  assert.equal(customCreated.status, 201);
  const customBody = (await customCreated.json()) as { food: CustomFood };
  const customFood = customBody.food;
  assert.ok(customFood.id.startsWith("custom_"));
  assert.equal(customFood.portions[0]!.grams, 80);

  const customDuplicate = await fetch(`${base}/api/custom-foods`, {
    method: "POST",
    headers: { "x-device-id": DEVICE, "Content-Type": "application/json" },
    body: JSON.stringify(customPayload)
  });
  assert.equal(customDuplicate.status, 409);
  assert.equal(
    ((await customDuplicate.json()) as { code: string }).code,
    "CUSTOM_FOOD_EXISTS"
  );

  const customSearch = await get("/api/foods?q=香煎");
  const customSearchBody = (await customSearch.json()) as {
    foods: Array<{ id: string; name: string; source?: string }>;
  };
  assert.equal(customSearchBody.foods[0]!.id, customFood.id);
  assert.equal(customSearchBody.foods[0]!.source, "custom");
  assert.ok(!customSearchBody.foods.some((food) => food.name === "香煎豆腐"));

  const foreignCustom = await fetch(`${base}/api/custom-foods`, {
    headers: { "x-device-id": "test-device-0002" }
  });
  const foreignCustomBody = (await foreignCustom.json()) as { foods: CustomFood[] };
  assert.equal(foreignCustomBody.foods.length, 0);

  const customMeal = await fetch(`${base}/api/meals`, {
    method: "POST",
    headers: { "x-device-id": DEVICE, "Content-Type": "application/json" },
    body: JSON.stringify({
      name: "自定义食物测试",
      mealType: "snack",
      date: "2026-10-29",
      eatenAt: "2026-10-29T15:00:00+08:00",
      imageUrl: null,
      engine: "自定义",
      items: [
        {
          foodId: customFood.id,
          name: customFood.name,
          emoji: customFood.emoji,
          category: customFood.category,
          grams: 100,
          per100g: customFood.per100g
        }
      ]
    })
  });
  assert.equal(customMeal.status, 201);
  const customMealBody = (await customMeal.json()) as { meal: Meal };
  assert.equal(customMealBody.meal.items[0]!.source, "custom");
  assert.equal(customMealBody.meal.items[0]!.foodId, customFood.id);
  assert.equal(customMealBody.meal.totals.kcal, 200);
  const customRecent = await get("/api/foods?recent=1");
  const customRecentBody = (await customRecent.json()) as {
    foods: Array<{ id: string; name: string; source?: string }>;
  };
  assert.ok(
    customRecentBody.foods.some(
      (food) => food.id === customFood.id && food.source === "custom"
    )
  );
  await fetch(`${base}/api/meals/${customMealBody.meal.id}`, {
    method: "DELETE",
    headers: { "x-device-id": DEVICE }
  });

  const aliasCreated = await fetch(`${base}/api/aliases`, {
    method: "POST",
    headers: { "x-device-id": DEVICE, "Content-Type": "application/json" },
    body: JSON.stringify({
      alias: "香煎豆腐",
      foodId: customFood.id,
      name: customFood.name,
      emoji: customFood.emoji,
      category: customFood.category,
      per100g: customFood.per100g,
      portionHint: "一小碟 · 80g"
    })
  });
  assert.equal(aliasCreated.status, 201);

  const customUpdated = await fetch(`${base}/api/custom-foods/${customFood.id}`, {
    method: "PUT",
    headers: { "x-device-id": DEVICE, "Content-Type": "application/json" },
    body: JSON.stringify({
      ...customPayload,
      per100g: { kcal: 210, protein: 13, carbs: 8, fat: 14, fiber: 1 }
    })
  });
  assert.equal(customUpdated.status, 200);

  // 真实识别路径会先应用别名；示例餐盘保持固定内容。
  const aliasForm = new FormData();
  aliasForm.append("image", new Blob([image], { type: "image/jpeg" }), "demo-bowl.jpg");
  const aliasedAnalysis = await fetch(`${base}/api/analyze`, {
    method: "POST",
    headers: { "x-device-id": DEVICE },
    body: aliasForm
  });
  assert.equal(aliasedAnalysis.status, 201);
  const aliasedAnalysisBody = (await aliasedAnalysis.json()) as { analysis: AnalysisResult };
  const aliasedItem = aliasedAnalysisBody.analysis.items[0]!;
  assert.equal(aliasedItem.name, customFood.name);
  assert.equal(aliasedItem.foodId, customFood.id);
  assert.equal(aliasedItem.source, "custom");
  assert.equal(aliasedItem.per100g.kcal, 210);

  const foreignDemo = await fetch(`${base}/api/analyze/demo`, {
    method: "POST",
    headers: { "x-device-id": "test-device-0002", "Content-Type": "application/json" },
    body: JSON.stringify({})
  });
  const foreignDemoBody = (await foreignDemo.json()) as { analysis: AnalysisResult };
  assert.equal(foreignDemoBody.analysis.items[0]!.name, "香煎豆腐");

  const customDeleted = await fetch(`${base}/api/custom-foods/${customFood.id}`, {
    method: "DELETE",
    headers: { "x-device-id": DEVICE }
  });
  assert.equal(customDeleted.status, 204);
  const customAfterDelete = await get("/api/custom-foods");
  const customAfterDeleteBody = (await customAfterDelete.json()) as { foods: CustomFood[] };
  assert.equal(customAfterDeleteBody.foods.length, 0);

  const repeatAfterLog = await get("/api/repeat");
  const repeatAfterLogBody = (await repeatAfterLog.json()) as RepeatResponse;
  assert.equal(repeatAfterLogBody.templates[0]!.useCount, 1);

  const foreignRepeat = await fetch(`${base}/api/repeat`, {
    headers: { "x-device-id": "test-device-0002" }
  });
  const foreignRepeatBody = (await foreignRepeat.json()) as RepeatResponse;
  assert.equal(foreignRepeatBody.templates.length, 0);

  const missingCopy = await fetch(
    `${base}/api/meals/00000000-0000-4000-8000-000000000000/copy`,
    {
      method: "POST",
      headers: { "x-device-id": DEVICE, "Content-Type": "application/json" },
      body: JSON.stringify({})
    }
  );
  assert.equal(missingCopy.status, 404);
  const missingCopyBody = (await missingCopy.json()) as { code: string };
  assert.equal(missingCopyBody.code, "MEAL_NOT_FOUND");

  const templateDeleted = await fetch(`${base}/api/templates/${templateBody.template.id}`, {
    method: "DELETE",
    headers: { "x-device-id": DEVICE }
  });
  assert.equal(templateDeleted.status, 204);
  const repeatAfterDelete = await get("/api/repeat");
  const repeatAfterDeleteBody = (await repeatAfterDelete.json()) as RepeatResponse;
  assert.equal(repeatAfterDeleteBody.templates.length, 0);

  const invalid = await fetch(`${base}/api/meals`, {
    method: "POST",
    headers: { "x-device-id": DEVICE, "Content-Type": "application/json" },
    body: JSON.stringify({ name: "空记录" })
  });
  assert.equal(invalid.status, 400);

  const deleted = await fetch(`${base}/api/meals/${savedBody.meal.id}`, {
    method: "DELETE",
    headers: { "x-device-id": DEVICE }
  });
  assert.equal(deleted.status, 204);

  const emptyAgain = await get("/api/day?date=2026-10-31");
  const emptyAgainBody = (await emptyAgain.json()) as DayResponse;
  assert.equal(emptyAgainBody.summary.meals.length, 0);

  const bodyUpdated = await fetch(`${base}/api/profile`, {
    method: "PUT",
    headers: { "x-device-id": DEVICE, "Content-Type": "application/json" },
    body: JSON.stringify({
      goal: "fat-loss",
      sex: "male",
      age: 35,
      heightCm: 178,
      weightKg: 78,
      activityLevel: "moderate",
      recalculate: true
    })
  });
  assert.equal(bodyUpdated.status, 200);
  const bodyProfile = ((await bodyUpdated.json()) as { profile: Profile }).profile;
  assert.equal(bodyProfile.targetsMode, "auto");
  assert.ok(bodyProfile.bmr && bodyProfile.bmr > 1000);
  assert.ok(bodyProfile.tdee && bodyProfile.tdee > bodyProfile.bmr);
  assert.ok(bodyProfile.targets.kcal >= 1500 && bodyProfile.targets.kcal <= 3000);

  const weightAdjusted = await fetch(`${base}/api/profile`, {
    method: "PUT",
    headers: { "x-device-id": DEVICE, "Content-Type": "application/json" },
    body: JSON.stringify({ weightKg: 80 })
  });
  assert.equal(weightAdjusted.status, 200);
  const adjustedProfile = ((await weightAdjusted.json()) as { profile: Profile }).profile;
  assert.equal(adjustedProfile.targetsMode, "auto");
  assert.equal(adjustedProfile.targets.protein, 145);
  assert.notEqual(adjustedProfile.targets.kcal, bodyProfile.targets.kcal);

  const postWeight = (weightKg: number, date: string) =>
    fetch(`${base}/api/weights`, {
      method: "POST",
      headers: { "x-device-id": DEVICE, "Content-Type": "application/json" },
      body: JSON.stringify({ weightKg, date })
    });

  const today = localDateKey();

  // 目标页改体重时会自动写一条今天的记录，保持档案与趋势一致。
  const autoWeightLogs = await get("/api/weights");
  const autoWeightLogsBody = (await autoWeightLogs.json()) as WeightTrendResponse;
  assert.equal(autoWeightLogsBody.logs.length, 1);
  assert.equal(autoWeightLogsBody.latest?.weightKg, 80);
  const removedAutoLog = await fetch(
    `${base}/api/weights/${autoWeightLogsBody.latest?.id}`,
    { method: "DELETE", headers: { "x-device-id": DEVICE } }
  );
  assert.equal(removedAutoLog.status, 200);

  const emptyWeights = await get("/api/weights");
  assert.equal(emptyWeights.status, 200);
  const emptyWeightsBody = (await emptyWeights.json()) as WeightTrendResponse;
  assert.equal(emptyWeightsBody.logs.length, 0);
  assert.equal(emptyWeightsBody.latest, null);
  assert.equal(emptyWeightsBody.recordedThisWeek, false);

  const firstWeight = await postWeight(79.2, today);
  assert.equal(firstWeight.status, 201);
  const firstWeightBody = (await firstWeight.json()) as {
    log: WeightLog;
    created: boolean;
    profile: Profile;
    targetsUpdated: boolean;
  };
  assert.equal(firstWeightBody.created, true);
  assert.equal(firstWeightBody.log.weightKg, 79.2);
  assert.equal(firstWeightBody.profile.weightKg, 79.2);
  assert.equal(firstWeightBody.targetsUpdated, true);

  const weightTrend = await get("/api/weights");
  const weightTrendBody = (await weightTrend.json()) as WeightTrendResponse;
  assert.equal(weightTrendBody.latest?.weightKg, 79.2);
  assert.equal(weightTrendBody.weeks.length, 1);
  assert.equal(weightTrendBody.latestWeek?.average, 79.2);
  assert.equal(weightTrendBody.recordedThisWeek, true);
  assert.equal(weightTrendBody.change, null);

  // 同一天再次记录是修正，不新增一条。
  const sameDayWeight = await postWeight(78.8, today);
  assert.equal(sameDayWeight.status, 200);
  const sameDayBody = (await sameDayWeight.json()) as {
    log: WeightLog;
    created: boolean;
    profile: Profile;
  };
  assert.equal(sameDayBody.created, false);
  assert.equal(sameDayBody.log.weightKg, 78.8);
  const afterSameDay = (await (await get("/api/weights")).json()) as WeightTrendResponse;
  assert.equal(afterSameDay.logs.length, 1);

  // 回填 35 天前的记录，档案仍取最新一条作为当前体重。
  const backfillDate = shiftDateKey(today, -35);
  const backfillWeight = await postWeight(81.2, backfillDate);
  assert.equal(backfillWeight.status, 201);
  const backfillBody = (await backfillWeight.json()) as {
    log: WeightLog;
    profile: Profile;
  };
  assert.equal(backfillBody.profile.weightKg, 78.8);
  const withBackfill = (await (await get("/api/weights")).json()) as WeightTrendResponse;
  assert.equal(withBackfill.logs.length, 2);
  assert.equal(withBackfill.latest?.weightKg, 78.8);
  assert.equal(withBackfill.change?.delta, -2.4);
  assert.equal(withBackfill.change?.days, 35);

  const foreignWeights = await fetch(`${base}/api/weights`, {
    headers: { "x-device-id": "test-device-0002" }
  });
  const foreignWeightsBody = (await foreignWeights.json()) as WeightTrendResponse;
  assert.equal(foreignWeightsBody.logs.length, 0);

  const badWeight = await postWeight(20, today);
  assert.equal(badWeight.status, 400);
  assert.equal(((await badWeight.json()) as { code: string }).code, "INVALID_WEIGHT");

  const futureWeight = await postWeight(70, shiftDateKey(today, 1));
  assert.equal(futureWeight.status, 400);
  assert.equal(((await futureWeight.json()) as { code: string }).code, "WEIGHT_FUTURE");

  const deleteBackfill = await fetch(`${base}/api/weights/${backfillBody.log.id}`, {
    method: "DELETE",
    headers: { "x-device-id": DEVICE }
  });
  assert.equal(deleteBackfill.status, 200);
  const deleteBackfillBody = (await deleteBackfill.json()) as { profile: Profile };
  assert.equal(deleteBackfillBody.profile.weightKg, 78.8);

  const deleteLatest = await fetch(`${base}/api/weights/${sameDayBody.log.id}`, {
    method: "DELETE",
    headers: { "x-device-id": DEVICE }
  });
  assert.equal(deleteLatest.status, 200);
  const afterDeleteWeights = (await (await get("/api/weights")).json()) as WeightTrendResponse;
  assert.equal(afterDeleteWeights.logs.length, 0);
  assert.equal(afterDeleteWeights.profile.weightKg, 78.8);

  const manualOverride = await fetch(`${base}/api/profile`, {
    method: "PUT",
    headers: { "x-device-id": DEVICE, "Content-Type": "application/json" },
    body: JSON.stringify({
      targets: { kcal: 2000, protein: 130, carbs: 200, fat: 60, fiber: 25 }
    })
  });
  assert.equal(manualOverride.status, 200);
  const manualProfile = ((await manualOverride.json()) as { profile: Profile }).profile;
  assert.equal(manualProfile.targetsMode, "manual");
  assert.equal(manualProfile.targets.kcal, 2000);

  const incompleteBody = await fetch(`${base}/api/profile`, {
    method: "PUT",
    headers: { "x-device-id": DEVICE, "Content-Type": "application/json" },
    body: JSON.stringify({
      recalculate: true,
      sex: null,
      age: null,
      heightCm: null,
      weightKg: null,
      activityLevel: null
    })
  });
  assert.equal(incompleteBody.status, 400);
  const incompleteBodyBody = (await incompleteBody.json()) as { code: string };
  assert.equal(incompleteBodyBody.code, "BODY_INCOMPLETE");
});

test("周报：自然周口径、连续记录与未来周校验", async (t) => {
  const dir = await mkdtemp(path.join(tmpdir(), "shike-report-"));
  const config = loadConfig({
    dataDir: dir,
    uploadDir: path.join(dir, "uploads"),
    publicDir: path.join(process.cwd(), "public")
  });
  const store = new Store(path.join(dir, "test.db"));
  const app = createApp({ config, store });
  const server = app.listen(0, "127.0.0.1");
  await once(server, "listening");
  const port = (server.address() as AddressInfo).port;
  const base = `http://127.0.0.1:${port}`;

  t.after(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    store.close();
    await rm(dir, { recursive: true, force: true });
  });

  const device = "test-device-report";
  const headers = { "x-device-id": device, "Content-Type": "application/json" };
  const today = localDateKey();
  const weekStart = weekStartKey(today);

  const addMeal = async (date: string) => {
    const response = await fetch(`${base}/api/meals`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        name: "周报测试餐",
        mealType: "lunch",
        date,
        eatenAt: `${date}T12:00:00+08:00`,
        imageUrl: null,
        engine: "周报测试",
        items: [
          {
            name: "米饭",
            category: "staple",
            grams: 200,
            per100g: { kcal: 116, protein: 2.6, carbs: 25.9, fat: 0.3, fiber: 0.3 }
          }
        ]
      })
    });
    assert.equal(response.status, 201);
  };

  await addMeal(today);
  await addMeal(shiftDateKey(today, -1));
  await addMeal(shiftDateKey(today, -2));

  const response = await fetch(`${base}/api/reports/weekly`, {
    headers: { "x-device-id": device }
  });
  assert.equal(response.status, 200);
  const report = (await response.json()) as WeeklyReport;
  assert.equal(report.weekStart, weekStart);
  assert.equal(report.weekEnd, shiftDateKey(weekStart, 6));
  assert.equal(report.days.length, 7);
  assert.equal(report.isCurrentWeek, true);
  assert.equal(report.canGoNext, false);
  assert.equal(report.streak.current, 3);
  assert.equal(report.streak.longest, 3);
  assert.ok(report.recordedDays >= 1);
  assert.ok(report.averageKcal !== null && report.averageKcal > 0);
  assert.equal(report.summary.tips.length, 3);
  assert.equal(report.targets.kcal, 1800);
  // 如果今天是周一/周二，前天/昨天可能落在上一周，所以只校验对比结构存在。
  assert.ok(report.comparison.recordedDays <= 3);
  assert.equal(typeof report.comparison.partial, "boolean");

  const previousResponse = await fetch(
    `${base}/api/reports/weekly?weekStart=${shiftDateKey(weekStart, -7)}`,
    { headers: { "x-device-id": device } }
  );
  assert.equal(previousResponse.status, 200);
  const previousReport = (await previousResponse.json()) as WeeklyReport;
  assert.equal(previousReport.isCurrentWeek, false);
  assert.equal(previousReport.canGoNext, true);
  assert.equal(previousReport.nextWeekStart, weekStart);

  const future = await fetch(
    `${base}/api/reports/weekly?weekStart=${shiftDateKey(weekStart, 7)}`,
    { headers: { "x-device-id": device } }
  );
  assert.equal(future.status, 400);
  assert.equal(((await future.json()) as { code: string }).code, "WEEK_FUTURE");

  const invalid = await fetch(`${base}/api/reports/weekly?weekStart=2026-13-40`, {
    headers: { "x-device-id": device }
  });
  assert.equal(invalid.status, 400);
  assert.equal(((await invalid.json()) as { code: string }).code, "INVALID_WEEK");
});

test("提醒：开关、授权额度与模板校验", async (t) => {
  const dir = await mkdtemp(path.join(tmpdir(), "shike-reminder-api-"));
  const config = loadConfig({
    dataDir: dir,
    uploadDir: path.join(dir, "uploads"),
    publicDir: path.join(process.cwd(), "public"),
    wechatAppId: "wx_test_app",
    wechatSecret: "test-secret",
    wechatEnabled: true,
    reminderTemplates: {
      lunch: "tmpl-lunch",
      dinner: "tmpl-dinner",
      weekly: "tmpl-weekly",
      streak: ""
    }
  });
  const store = new Store(path.join(dir, "test.db"));
  const app = createApp({ config, store });
  const server = app.listen(0, "127.0.0.1");
  await once(server, "listening");
  const port = (server.address() as AddressInfo).port;
  const base = `http://127.0.0.1:${port}`;

  t.after(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    store.close();
    await rm(dir, { recursive: true, force: true });
  });

  const device = "test-device-reminder";
  const headers = { "x-device-id": device, "Content-Type": "application/json" };

  const initial = await fetch(`${base}/api/reminders`, { headers });
  assert.equal(initial.status, 200);
  const initialBody = (await initial.json()) as {
    capability: { templatesConfigured: boolean; canSend: boolean; reason: string };
    reminders: Array<{ kind: string; enabled: boolean; remaining: number }>;
  };
  assert.equal(initialBody.capability.templatesConfigured, true);
  assert.equal(initialBody.capability.canSend, false);
  assert.equal(initialBody.reminders.length, 4);

  const enabled = await fetch(`${base}/api/reminders/lunch`, {
    method: "PUT",
    headers,
    body: JSON.stringify({ enabled: true })
  });
  assert.equal(enabled.status, 200);
  const enabledBody = (await enabled.json()) as {
    reminders: Array<{ kind: string; enabled: boolean }>;
  };
  assert.equal(enabledBody.reminders.find((item) => item.kind === "lunch")?.enabled, true);

  const granted = await fetch(`${base}/api/reminders/lunch/grant`, {
    method: "POST",
    headers,
    body: JSON.stringify({})
  });
  assert.equal(granted.status, 201);
  const grantedBody = (await granted.json()) as {
    reminders: Array<{ kind: string; remaining: number }>;
  };
  assert.equal(grantedBody.reminders.find((item) => item.kind === "lunch")?.remaining, 1);

  const missingTemplate = await fetch(`${base}/api/reminders/streak/grant`, {
    method: "POST",
    headers,
    body: JSON.stringify({})
  });
  assert.equal(missingTemplate.status, 400);
  assert.equal(
    ((await missingTemplate.json()) as { code: string }).code,
    "REMINDER_TEMPLATE_MISSING"
  );

  const invalidKind = await fetch(`${base}/api/reminders/water`, {
    method: "PUT",
    headers,
    body: JSON.stringify({ enabled: true })
  });
  assert.equal(invalidKind.status, 400);
  assert.equal(
    ((await invalidKind.json()) as { code: string }).code,
    "INVALID_REMINDER_KIND"
  );

  const session = signSession("wx_test_identity", config.sessionSecret, 600);
  const loggedIn = await fetch(`${base}/api/reminders`, {
    headers: { Authorization: `Bearer ${session.token}` }
  });
  const loggedInBody = (await loggedIn.json()) as { capability: { canSend: boolean } };
  assert.equal(loggedInBody.capability.canSend, true);
});

test("缺少设备标识时拒绝访问个人数据", async (t) => {
  const dir = await mkdtemp(path.join(tmpdir(), "shike-test-device-"));
  const config = loadConfig({
    dataDir: dir,
    uploadDir: path.join(dir, "uploads"),
    publicDir: path.join(process.cwd(), "public")
  });
  const store = new Store(path.join(dir, "test.db"));
  const app = createApp({ config, store });
  const server = app.listen(0, "127.0.0.1");
  await once(server, "listening");
  const port = (server.address() as AddressInfo).port;

  t.after(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    store.close();
    await rm(dir, { recursive: true, force: true });
  });

  const response = await fetch(`http://127.0.0.1:${port}/api/profile`);
  assert.equal(response.status, 400);
  const body = (await response.json()) as { code: string };
  assert.equal(body.code, "DEVICE_REQUIRED");
});
