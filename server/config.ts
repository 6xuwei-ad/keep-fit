import path from "node:path";
import type { ReminderKind } from "../shared/types.ts";

export type ReminderTemplateFields = {
  title: string;
  time: string;
  note: string;
};

export type ReminderFieldMap = Record<ReminderKind, ReminderTemplateFields>;

const REMINDER_KINDS: ReminderKind[] = ["lunch", "dinner", "weekly", "streak"];

const DEFAULT_REMINDER_FIELDS: ReminderTemplateFields = {
  title: "thing1",
  time: "time2",
  note: "thing3"
};

export interface AppConfig {
  port: number;
  dataDir: string;
  uploadDir: string;
  publicDir: string;
  visionEnabled: boolean;
  allowDemo: boolean;
  visionApiKey: string;
  visionBaseUrl: string;
  visionModel: string;
  visionTimeoutMs: number;
  sessionSecret: string;
  sessionTtlSeconds: number;
  wechatAppId: string;
  wechatSecret: string;
  wechatEnabled: boolean;
  reminderTemplates: Record<ReminderKind, string>;
  reminderFields: ReminderFieldMap;
  reminderMiniprogramState: "formal" | "trial" | "developer";
  version: string;
}

function normalizeFields(
  value: unknown,
  fallback: ReminderTemplateFields
): ReminderTemplateFields {
  const source =
    value && typeof value === "object"
      ? (value as Record<string, unknown>)
      : {};
  const pick = (key: keyof ReminderTemplateFields) => {
    const candidate = source[key];
    return typeof candidate === "string" && candidate.trim()
      ? candidate.trim()
      : fallback[key];
  };
  return {
    title: pick("title"),
    time: pick("time"),
    note: pick("note")
  };
}

function defaultFieldMap(): ReminderFieldMap {
  return Object.fromEntries(
    REMINDER_KINDS.map((kind) => [kind, { ...DEFAULT_REMINDER_FIELDS }])
  ) as ReminderFieldMap;
}

/**
 * 支持两种写法：
 * 1. 全局：{"title":"thing1","time":"time2","note":"thing4"}
 * 2. 按提醒覆盖：{"default":{...},"lunch":{"note":"thing4"},"dinner":{...}}
 * 微信模板的字段 key 会因所选关键词不同而变化，所以允许每一项单独映射。
 */
function readReminderFields(): ReminderFieldMap {
  const map = defaultFieldMap();
  const raw = process.env.WECHAT_REMINDER_FIELDS?.trim();
  if (!raw) return map;

  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const defaultFields = normalizeFields(
      parsed.default ?? parsed,
      DEFAULT_REMINDER_FIELDS
    );
    for (const kind of REMINDER_KINDS) {
      map[kind] = normalizeFields(parsed[kind], defaultFields);
    }
    return map;
  } catch {
    console.warn("[config] WECHAT_REMINDER_FIELDS 不是合法 JSON，已使用默认字段");
    return map;
  }
}

function readMiniprogramState(): "formal" | "trial" | "developer" {
  const value = process.env.WECHAT_MINIPROGRAM_STATE?.trim();
  if (value === "trial" || value === "developer" || value === "formal") return value;
  return "formal";
}

export function loadConfig(overrides: Partial<AppConfig> = {}): AppConfig {
  const root = process.cwd();
  const dataDir = path.resolve(process.env.DATA_DIR ?? path.join(root, "data"));
  const apiKey = process.env.VISION_API_KEY?.trim() ?? "";
  const wechatAppId = process.env.WECHAT_APPID?.trim() ?? "";
  const wechatSecret = process.env.WECHAT_SECRET?.trim() ?? "";
  return {
    port: Number(process.env.PORT ?? 8787),
    dataDir,
    uploadDir: path.join(dataDir, "uploads"),
    publicDir: path.join(root, "public"),
    visionEnabled: apiKey.length > 0,
    allowDemo: process.env.ALLOW_DEMO !== "false",
    visionApiKey: apiKey,
    visionBaseUrl: (process.env.VISION_BASE_URL ?? "https://api.openai.com/v1").replace(/\/+$/, ""),
    visionModel: process.env.VISION_MODEL ?? "gpt-4.1-mini",
    visionTimeoutMs: Number(process.env.VISION_TIMEOUT_MS ?? 45_000),
    sessionSecret:
      process.env.SESSION_SECRET?.trim() || "shike-dev-session-secret-change-before-production",
    sessionTtlSeconds: Number(process.env.SESSION_TTL_SECONDS ?? 30 * 24 * 60 * 60),
    wechatAppId,
    wechatSecret,
    wechatEnabled: Boolean(wechatAppId && wechatSecret),
    reminderTemplates: {
      lunch: process.env.WECHAT_TEMPLATE_LUNCH?.trim() ?? "",
      dinner: process.env.WECHAT_TEMPLATE_DINNER?.trim() ?? "",
      weekly: process.env.WECHAT_TEMPLATE_WEEKLY?.trim() ?? "",
      streak: process.env.WECHAT_TEMPLATE_STREAK?.trim() ?? ""
    },
    reminderFields: readReminderFields(),
    reminderMiniprogramState: readMiniprogramState(),
    version: "1.0.0",
    ...overrides
  };
}
