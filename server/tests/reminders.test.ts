import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import type { AppConfig } from "../config.ts";
import { loadConfig } from "../config.ts";
import { Store } from "../store.ts";
import { itemsTotal, makeFoodItem } from "../services/items.ts";
import {
  buildRemindersResponse,
  grantReminder,
  runReminderTick,
  updateReminderSetting,
  type ReminderSender
} from "../services/reminders.ts";
import type { SubscribeMessageInput } from "../services/wechat.ts";

function reminderConfig(dir: string): AppConfig {
  return loadConfig({
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
      streak: "tmpl-streak"
    },
    reminderFields: {
      // 实际“饮食记录添加提醒”模板的第三项是 thing4，这里顺带验证按 kind 映射。
      lunch: { title: "thing1", time: "time2", note: "thing4" },
      dinner: { title: "thing1", time: "time2", note: "thing3" },
      weekly: { title: "thing1", time: "time2", note: "thing3" },
      streak: { title: "thing1", time: "time2", note: "thing3" }
    },
    reminderMiniprogramState: "developer"
  });
}

async function setup(t: { after: (fn: () => Promise<void>) => void }) {
  const dir = await mkdtemp(path.join(tmpdir(), "shike-reminder-"));
  const store = new Store(path.join(dir, "test.db"));
  t.after(async () => {
    store.close();
    await rm(dir, { recursive: true, force: true });
  });
  return { dir, store, config: reminderConfig(dir) };
}

function logMeal(
  store: Store,
  deviceId: string,
  date: string,
  mealType: "breakfast" | "lunch" | "dinner" | "snack"
) {
  const item = makeFoodItem({
    name: "米饭",
    grams: 100,
    category: "staple",
    per100g: { kcal: 116, protein: 2.6, carbs: 25.9, fat: 0.3, fiber: 0.3 }
  });
  const totals = itemsTotal([item]);
  return store.insertMeal(
    deviceId,
    {
      name: "测试餐",
      mealType,
      date,
      eatenAt: `${date}T12:00:00+08:00`,
      imageUrl: null,
      engine: "测试",
      items: [item]
    },
    [item],
    totals
  );
}

test("提醒能力、开关与授权额度", async (t) => {
  const { store, config } = await setup(t);
  const device = "wx_reminder_quota";

  const initial = buildRemindersResponse(config, store, device);
  assert.equal(initial.capability.canSend, true);
  assert.equal(initial.reminders.length, 4);
  assert.equal(initial.reminders.find((item) => item.kind === "lunch")?.enabled, false);

  const enabled = updateReminderSetting(config, store, device, "lunch", true);
  assert.equal(enabled.reminders.find((item) => item.kind === "lunch")?.enabled, true);

  const granted = grantReminder(config, store, device, "lunch");
  const lunch = granted.reminders.find((item) => item.kind === "lunch");
  assert.equal(lunch?.remaining, 1);
  assert.equal(lunch?.enabled, true);
  assert.equal(lunch?.templateId, "tmpl-lunch");

  const deviceMode = buildRemindersResponse(config, store, "test-device-0001");
  assert.equal(deviceMode.capability.canSend, false);
  assert.match(deviceMode.capability.reason, /微信登录/);
});

test("午餐提醒在没记录时发一次，记录后跳过", async (t) => {
  const { store, config } = await setup(t);
  const device = "wx_reminder_lunch";
  updateReminderSetting(config, store, device, "lunch", true);
  grantReminder(config, store, device, "lunch");

  const sent: SubscribeMessageInput[] = [];
  const sender: ReminderSender = async (_config, input) => {
    sent.push(input);
    return { ok: true, errcode: 0 };
  };
  const now = new Date("2026-11-08T04:30:00.000Z"); // 上海 12:30

  const first = await runReminderTick({ config, store, now, send: sender });
  assert.equal(first.sent, 1);
  assert.equal(sent.length, 1);
  assert.equal(sent[0]!.page, "pages/home/index");
  assert.equal(sent[0]!.data.thing1!.value, "午餐还没记录");
  assert.equal(sent[0]!.data.thing4!.value, "午餐");
  assert.equal(store.getReminderGrant(device, "lunch")?.remaining, 0);
  assert.equal(store.getReminderGrant(device, "lunch")?.lastSentOn, "2026-11-08");

  const second = await runReminderTick({ config, store, now, send: sender });
  assert.equal(second.sent, 0);

  const other = "wx_reminder_lunch_logged";
  updateReminderSetting(config, store, other, "lunch", true);
  grantReminder(config, store, other, "lunch");
  logMeal(store, other, "2026-11-08", "lunch");

  const skipped = await runReminderTick({ config, store, now, send: sender });
  assert.equal(skipped.sent, 0);
  assert.ok(skipped.skipped >= 1);
});

test("发送失败当天不重试，用户拒绝时清空额度", async (t) => {
  const { store, config } = await setup(t);
  const failedDevice = "wx_reminder_failed";
  updateReminderSetting(config, store, failedDevice, "lunch", true);
  grantReminder(config, store, failedDevice, "lunch");
  const now = new Date("2026-11-08T04:30:00.000Z");

  const failure: ReminderSender = async () => ({
    ok: false,
    errcode: -1,
    errmsg: "network"
  });
  const first = await runReminderTick({ config, store, now, send: failure });
  assert.equal(first.failed, 1);
  assert.equal(store.getReminderGrant(failedDevice, "lunch")?.remaining, 1);
  assert.equal(store.getReminderGrant(failedDevice, "lunch")?.lastAttemptOn, "2026-11-08");

  const second = await runReminderTick({ config, store, now, send: failure });
  assert.equal(second.failed, 0);

  const deniedDevice = "wx_reminder_denied";
  updateReminderSetting(config, store, deniedDevice, "lunch", true);
  grantReminder(config, store, deniedDevice, "lunch");
  const denied: ReminderSender = async () => ({ ok: false, errcode: 43101, errmsg: "refused" });
  const deniedResult = await runReminderTick({ config, store, now, send: denied });
  assert.equal(deniedResult.failed, 1);
  assert.equal(store.getReminderGrant(deniedDevice, "lunch")?.remaining, 0);
});

test("周报与断签提醒按各自时间触发", async (t) => {
  const { store, config } = await setup(t);
  const weeklyDevice = "wx_reminder_weekly";
  updateReminderSetting(config, store, weeklyDevice, "weekly", true);
  grantReminder(config, store, weeklyDevice, "weekly");
  logMeal(store, weeklyDevice, "2026-11-08", "lunch");

  const sent: SubscribeMessageInput[] = [];
  const sender: ReminderSender = async (_config, input) => {
    sent.push(input);
    return { ok: true, errcode: 0 };
  };

  const weekly = await runReminderTick({
    config,
    store,
    now: new Date("2026-11-08T12:00:00.000Z"), // 上海 20:00
    send: sender
  });
  assert.equal(weekly.sent, 1);
  assert.equal(sent[0]!.page, "pages/report/index");
  assert.equal(sent[0]!.data.thing1!.value, "本周饮食报告");
  assert.match(sent[0]!.data.thing3!.value, /1 天/);

  const streakDevice = "wx_reminder_streak";
  updateReminderSetting(config, store, streakDevice, "streak", true);
  grantReminder(config, store, streakDevice, "streak");
  logMeal(store, streakDevice, "2026-11-05", "lunch");
  logMeal(store, streakDevice, "2026-11-06", "lunch");
  logMeal(store, streakDevice, "2026-11-07", "lunch");

  const streak = await runReminderTick({
    config,
    store,
    now: new Date("2026-11-08T12:30:00.000Z"), // 上海 20:30
    send: sender
  });
  assert.ok(streak.sent >= 1);
  const streakMessage = sent.find((input) => input.data.thing1?.value === "连续记录要断了");
  assert.ok(streakMessage);
  assert.match(streakMessage!.data.thing3!.value, /已连续 3 天/);
});
