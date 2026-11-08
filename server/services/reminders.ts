import type { AppConfig } from "../config.ts";
import type {
  ReminderCapability,
  ReminderItem,
  ReminderKind,
  RemindersResponse
} from "../../shared/types.ts";
import type { Store } from "../store.ts";
import { localDateKey } from "../../shared/nutrition.ts";
import { buildStreak } from "../../shared/weekly.ts";
import { buildWeeklyReportFor } from "./report.ts";
import {
  sendSubscribeMessage,
  type SubscribeMessageInput,
  type SubscribeMessageResult
} from "./wechat.ts";

export const REMINDER_KINDS = ["lunch", "dinner", "weekly", "streak"] as const;

export const REMINDER_META: Record<
  ReminderKind,
  { label: string; description: string; time: string; timeLabel: string; page: string }
> = {
  lunch: {
    label: "午餐提醒",
    description: "没记录午餐时提醒",
    time: "12:30",
    timeLabel: "每天 12:30",
    page: "pages/home/index"
  },
  dinner: {
    label: "晚餐提醒",
    description: "没记录晚餐时提醒",
    time: "19:30",
    timeLabel: "每天 19:30",
    page: "pages/home/index"
  },
  weekly: {
    label: "周报提醒",
    description: "周日提醒看本周报告",
    time: "20:00",
    timeLabel: "周日 20:00",
    page: "pages/report/index"
  },
  streak: {
    label: "连续记录提醒",
    description: "连续记录快断时提醒",
    time: "20:30",
    timeLabel: "每天 20:30",
    page: "pages/report/index"
  }
};

export type ReminderSender = (
  config: AppConfig,
  input: SubscribeMessageInput
) => Promise<SubscribeMessageResult>;

function openIdOf(identity: string): string | null {
  return identity.startsWith("wx_") ? identity.slice(3) : null;
}

function templateIdFor(config: AppConfig, kind: ReminderKind): string {
  return config.reminderTemplates[kind] || "";
}

function capabilityFor(config: AppConfig, deviceId: string): ReminderCapability {
  const templatesConfigured = REMINDER_KINDS.some((kind) =>
    Boolean(config.reminderTemplates[kind])
  );
  const loggedIn = Boolean(openIdOf(deviceId));
  let reason = "";
  if (!config.wechatEnabled) reason = "服务端未配置微信登录，提醒暂时不可用";
  else if (!templatesConfigured) reason = "服务端未配置订阅消息模板";
  else if (!loggedIn) reason = "微信登录后可开启提醒";

  return {
    wechatEnabled: config.wechatEnabled,
    templatesConfigured,
    canSend: !reason,
    reason,
    notice: "只在没记录时提醒。微信规定每次授权只能收到一条，收到后可以在这里续订。"
  };
}

export function buildRemindersResponse(
  config: AppConfig,
  store: Store,
  deviceId: string
): RemindersResponse {
  const settings = store.getReminderSettings(deviceId);
  const grants = new Map(store.listReminderGrants(deviceId).map((grant) => [grant.kind, grant]));
  const capability = capabilityFor(config, deviceId);

  const reminders: ReminderItem[] = REMINDER_KINDS.map((kind) => {
    const meta = REMINDER_META[kind];
    const templateId = templateIdFor(config, kind);
    const grant = grants.get(kind);
    return {
      kind,
      label: meta.label,
      description: meta.description,
      time: meta.time,
      timeLabel: meta.timeLabel,
      enabled: settings[kind],
      remaining: grant ? grant.remaining : 0,
      lastSentAt: grant ? grant.lastSentAt : null,
      templateId,
      templateReady: Boolean(templateId)
    };
  });

  return { capability, reminders };
}

export function updateReminderSetting(
  config: AppConfig,
  store: Store,
  deviceId: string,
  kind: ReminderKind,
  enabled: boolean
): RemindersResponse {
  store.updateReminderSettings(deviceId, { [kind]: enabled });
  return buildRemindersResponse(config, store, deviceId);
}

export function grantReminder(
  config: AppConfig,
  store: Store,
  deviceId: string,
  kind: ReminderKind
): RemindersResponse {
  // 用户刚刚在微信授权弹窗里点了允许，顺手把这一项打开。
  store.grantReminder(deviceId, kind);
  store.updateReminderSettings(deviceId, { [kind]: true });
  return buildRemindersResponse(config, store, deviceId);
}

interface ShanghaiClock {
  date: string;
  minutes: number;
  weekday: number;
}

function shanghaiClock(now: Date): ShanghaiClock {
  const date = localDateKey(now);
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Shanghai",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false
  }).formatToParts(now);
  const pick = (type: string) => parts.find((part) => part.type === type)?.value ?? "0";
  const hour = Number(pick("hour")) % 24;
  const minute = Number(pick("minute"));
  const [year = 1970, month = 1, day = 1] = date.split("-").map(Number);

  return {
    date,
    minutes: hour * 60 + minute,
    weekday: new Date(Date.UTC(year, month - 1, day)).getUTCDay()
  };
}

function parseMinutes(value: string): number {
  const [hour = "0", minute = "0"] = value.split(":");
  return Number(hour) * 60 + Number(minute);
}

function formatDateTime(date: string, time: string): string {
  const [year = "1970", month = "1", day = "1"] = date.split("-");
  return `${year}年${Number(month)}月${Number(day)}日 ${time}`;
}

function truncate(value: string, max = 20): string {
  return value.length > max ? value.slice(0, max) : value;
}

function messageData(
  config: AppConfig,
  kind: ReminderKind,
  title: string,
  time: string,
  note: string
): Record<string, { value: string }> {
  const fields = config.reminderFields[kind];
  return {
    [fields.title]: { value: truncate(title) },
    [fields.time]: { value: truncate(time, 32) },
    [fields.note]: { value: truncate(note) }
  };
}

interface TickContext {
  date: string;
  mealCount: number;
  streak: number;
  recordedDays: number;
  averageKcal: number;
}

function buildMessage(
  kind: ReminderKind,
  context: TickContext
): { page: string; title: string; time: string; note: string } {
  const page = REMINDER_META[kind].page;
  const time = formatDateTime(context.date, REMINDER_META[kind].time);

  if (kind === "lunch") {
    return { page, title: "午餐还没记录", time, note: "午餐" };
  }
  if (kind === "dinner") {
    return {
      page,
      title: "晚餐记一下",
      time,
      note: context.mealCount > 0 ? `今天已记录 ${context.mealCount} 餐` : "今天还没记录"
    };
  }
  if (kind === "weekly") {
    return {
      page,
      title: "本周饮食报告",
      time,
      note: `${context.recordedDays} 天 · 平均 ${context.averageKcal} kcal`
    };
  }
  return {
    page,
    title: "连续记录要断了",
    time,
    note: `已连续 ${context.streak} 天`
  };
}

export interface ReminderTickOptions {
  config: AppConfig;
  store: Store;
  now?: Date;
  send?: ReminderSender;
}

export interface ReminderTickResult {
  checked: number;
  sent: number;
  skipped: number;
  failed: number;
}

/**
 * 执行一次到期检查。调度器每分钟调用一次，也可以在测试里注入固定时间和假发送器。
 *
 * 只处理“已开启 + 有授权额度 + 今天还没发过 + 还没记录”的提醒；
 * 每种提醒每天最多一次，发送失败也记一次尝试，避免一分钟重试一次。
 */
export async function runReminderTick(
  options: ReminderTickOptions
): Promise<ReminderTickResult> {
  const { config, store } = options;
  const result: ReminderTickResult = { checked: 0, sent: 0, skipped: 0, failed: 0 };
  if (!config.wechatEnabled) return result;

  const now = options.now ?? new Date();
  const clock = shanghaiClock(now);
  const send = options.send ?? sendSubscribeMessage;
  const candidates = store.listReminderDevices();

  for (const candidate of candidates) {
    const openid = openIdOf(candidate.deviceId);
    if (!openid) {
      result.skipped += 1;
      continue;
    }

    const settings = candidate.settings;
    const grants = new Map(
      store.listReminderGrants(candidate.deviceId).map((grant) => [grant.kind, grant])
    );
    const needsMeals = settings.lunch || settings.dinner || settings.streak;
    const meals = needsMeals ? store.listMeals(candidate.deviceId, clock.date) : [];
    let weeklyReport: ReturnType<typeof buildWeeklyReportFor> | null = null;
    let streakCurrent = 0;
    // 跨 tick 也要知道今天已经发过别的提醒，避免周报 20:00 后又来一条断签提醒。
    let sentAnyToday = Array.from(grants.values()).some(
      (grant) => grant.lastSentOn === clock.date
    );

    for (const kind of REMINDER_KINDS) {
      if (!settings[kind]) continue;
      const templateId = templateIdFor(config, kind);
      if (!templateId) {
        result.skipped += 1;
        continue;
      }

      const due = parseMinutes(REMINDER_META[kind].time);
      if (clock.minutes < due || clock.minutes > due + 20) continue;
      if (kind === "weekly" && clock.weekday !== 0) continue;
      // 已经收到午餐/晚餐/周报提醒后，不再追加“连续记录”提醒，避免同一天两条。
      if (kind === "streak" && sentAnyToday) {
        result.skipped += 1;
        continue;
      }

      const grant = grants.get(kind);
      if (!grant || grant.remaining <= 0) {
        result.skipped += 1;
        continue;
      }
      if (grant.lastSentOn === clock.date || grant.lastAttemptOn === clock.date) {
        result.skipped += 1;
        continue;
      }

      if (kind === "lunch" && meals.some((meal) => meal.mealType === "lunch")) {
        result.skipped += 1;
        continue;
      }
      if (kind === "dinner" && meals.some((meal) => meal.mealType === "dinner")) {
        result.skipped += 1;
        continue;
      }
      if (kind === "streak") {
        if (meals.length > 0) {
          result.skipped += 1;
          continue;
        }
        streakCurrent = buildStreak(
          store.listRecordedDates(candidate.deviceId, 400),
          clock.date
        ).current;
        if (streakCurrent < 3) {
          result.skipped += 1;
          continue;
        }
      }
      if (kind === "weekly") {
        if (!weeklyReport) {
          weeklyReport = buildWeeklyReportFor(store, candidate.deviceId, null, clock.date);
        }
        if (weeklyReport.recordedDays === 0) {
          result.skipped += 1;
          continue;
        }
      }

      const context: TickContext = {
        date: clock.date,
        mealCount: meals.length,
        streak: streakCurrent,
        recordedDays: weeklyReport ? weeklyReport.recordedDays : 0,
        averageKcal: weeklyReport && weeklyReport.averageKcal !== null
          ? Math.round(weeklyReport.averageKcal)
          : 0
      };
      const message = buildMessage(kind, context);
      result.checked += 1;

      const sendResult = await send(config, {
        openid,
        templateId,
        page: message.page,
        data: messageData(config, kind, message.title, message.time, message.note)
      });

      if (sendResult.ok) {
        store.consumeReminderGrant(candidate.deviceId, kind, clock.date);
        result.sent += 1;
        sentAnyToday = true;
      } else {
        store.markReminderAttempt(candidate.deviceId, kind, clock.date);
        result.failed += 1;
        // 43101 = 用户拒绝接收；清空额度，等用户重新授权，避免每天重试。
        if (sendResult.errcode === 43101) {
          store.clearReminderGrant(candidate.deviceId, kind, clock.date);
        }
        console.warn(
          `[reminders] 发送失败 kind=${kind} errcode=${sendResult.errcode ?? "-"} ${
            sendResult.errmsg ?? ""
          }`
        );
      }
    }
  }

  return result;
}

export function startReminderScheduler({
  config,
  store
}: {
  config: AppConfig;
  store: Store;
}): () => void {
  const enabled =
    config.wechatEnabled &&
    REMINDER_KINDS.some((kind) => Boolean(config.reminderTemplates[kind]));
  if (!enabled) return () => {};

  let running = false;
  const tick = () => {
    if (running) return;
    running = true;
    runReminderTick({ config, store })
      .catch((error) => {
        console.error("[reminders] 调度失败", error);
      })
      .finally(() => {
        running = false;
      });
  };

  const interval = setInterval(tick, 60_000);
  interval.unref();
  const initial = setTimeout(tick, 5_000);
  initial.unref();

  return () => {
    clearInterval(interval);
    clearTimeout(initial);
  };
}
