import path from "node:path";
import type { ReminderKind } from "../shared/types.ts";

export type ReminderTemplateFields = {
  title: string;
  time: string;
  note: string;
};

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
  reminderFields: ReminderTemplateFields;
  reminderMiniprogramState: "formal" | "trial" | "developer";
  version: string;
}

function readReminderFields(): ReminderTemplateFields {
  const raw = process.env.WECHAT_REMINDER_FIELDS?.trim();
  if (!raw) return { ...DEFAULT_REMINDER_FIELDS };
  try {
    const parsed = JSON.parse(raw) as Partial<ReminderTemplateFields>;
    return {
      title:
        typeof parsed.title === "string" && parsed.title.trim()
          ? parsed.title.trim()
          : DEFAULT_REMINDER_FIELDS.title,
      time:
        typeof parsed.time === "string" && parsed.time.trim()
          ? parsed.time.trim()
          : DEFAULT_REMINDER_FIELDS.time,
      note:
        typeof parsed.note === "string" && parsed.note.trim()
          ? parsed.note.trim()
          : DEFAULT_REMINDER_FIELDS.note
    };
  } catch {
    console.warn("[config] WECHAT_REMINDER_FIELDS 不是合法 JSON，已使用默认字段");
    return { ...DEFAULT_REMINDER_FIELDS };
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
