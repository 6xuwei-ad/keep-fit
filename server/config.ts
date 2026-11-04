import path from "node:path";

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
  version: string;
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
    version: "1.0.0",
    ...overrides
  };
}
