import assert from "node:assert/strict";
import { once } from "node:events";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import type { AddressInfo } from "node:net";
import type { AnalysisResult, DayResponse, Meal, Profile } from "../../shared/types.ts";
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
    distDir: path.join(dir, "dist-not-built"),
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
});

test("缺少设备标识时拒绝访问个人数据", async (t) => {
  const dir = await mkdtemp(path.join(tmpdir(), "shike-test-device-"));
  const config = loadConfig({
    dataDir: dir,
    uploadDir: path.join(dir, "uploads"),
    publicDir: path.join(process.cwd(), "public"),
    distDir: path.join(dir, "dist-not-built")
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
