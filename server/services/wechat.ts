import type { AppConfig } from "../config.ts";

/**
 * 微信订阅消息的最小客户端：
 * - access_token 进程内缓存，提前 5 分钟过期；
 * - 发送失败不抛异常，返回 errcode 让调度器决定是否清空授权；
 * - 不打印 token，也不把 openid 写进日志。
 */

interface TokenCache {
  token: string;
  expiresAt: number;
}

const tokenCache = new Map<string, TokenCache>();
const inflight = new Map<string, Promise<string>>();

export interface SubscribeMessageInput {
  openid: string;
  templateId: string;
  page: string;
  data: Record<string, { value: string }>;
}

export interface SubscribeMessageResult {
  ok: boolean;
  errcode?: number;
  errmsg?: string;
}

async function fetchAccessToken(config: AppConfig): Promise<string> {
  const endpoint = new URL("https://api.weixin.qq.com/cgi-bin/token");
  endpoint.searchParams.set("grant_type", "client_credential");
  endpoint.searchParams.set("appid", config.wechatAppId);
  endpoint.searchParams.set("secret", config.wechatSecret);

  const response = await fetch(endpoint, { signal: AbortSignal.timeout(8000) });
  let data: {
    access_token?: string;
    expires_in?: number;
    errcode?: number;
    errmsg?: string;
  } = {};
  try {
    data = (await response.json()) as typeof data;
  } catch {
    throw new Error("微信 access_token 返回了非 JSON 内容");
  }

  if (!response.ok || !data.access_token) {
    throw new Error(data.errmsg || `微信 access_token 获取失败（HTTP ${response.status}）`);
  }

  const ttl = Math.max(60, Number(data.expires_in ?? 7200) - 300);
  tokenCache.set(config.wechatAppId, {
    token: data.access_token,
    expiresAt: Date.now() + ttl * 1000
  });
  return data.access_token;
}

export function clearAccessToken(appId: string): void {
  tokenCache.delete(appId);
}

export async function getAccessToken(config: AppConfig): Promise<string> {
  const cached = tokenCache.get(config.wechatAppId);
  if (cached && cached.expiresAt > Date.now()) return cached.token;

  const pending = inflight.get(config.wechatAppId);
  if (pending) return pending;

  const request = fetchAccessToken(config).finally(() => {
    inflight.delete(config.wechatAppId);
  });
  inflight.set(config.wechatAppId, request);
  return request;
}

async function postSubscribeMessage(
  config: AppConfig,
  token: string,
  input: SubscribeMessageInput
): Promise<SubscribeMessageResult> {
  const endpoint = new URL("https://api.weixin.qq.com/cgi-bin/message/subscribe/send");
  endpoint.searchParams.set("access_token", token);

  const response = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      touser: input.openid,
      template_id: input.templateId,
      page: input.page,
      data: input.data,
      miniprogram_state: config.reminderMiniprogramState,
      lang: "zh_CN"
    }),
    signal: AbortSignal.timeout(8000)
  });

  let body: { errcode?: number; errmsg?: string } = {};
  try {
    body = (await response.json()) as typeof body;
  } catch {
    body = { errcode: -1, errmsg: `微信订阅消息返回了非 JSON 内容（HTTP ${response.status}）` };
  }

  const errcode = Number(body.errcode ?? 0);
  return {
    ok: response.ok && errcode === 0,
    errcode,
    errmsg: body.errmsg || (response.ok ? "" : `HTTP ${response.status}`)
  };
}

export async function sendSubscribeMessage(
  config: AppConfig,
  input: SubscribeMessageInput
): Promise<SubscribeMessageResult> {
  try {
    let token = await getAccessToken(config);
    let result = await postSubscribeMessage(config, token, input);

    // access_token 失效时只重试一次，避免把一次失败放大成循环。
    if (result.errcode === 40001 || result.errcode === 42001) {
      clearAccessToken(config.wechatAppId);
      token = await getAccessToken(config);
      result = await postSubscribeMessage(config, token, input);
    }
    return result;
  } catch (error) {
    return {
      ok: false,
      errcode: -1,
      errmsg: error instanceof Error ? error.message : "微信订阅消息请求失败"
    };
  }
}
