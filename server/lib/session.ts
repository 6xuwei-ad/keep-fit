import { createHmac, timingSafeEqual } from "node:crypto";

export interface SessionPayload {
  sub: string;
  iat: number;
  exp: number;
  v: 1;
}

function base64url(value: Buffer | string): string {
  return Buffer.from(value).toString("base64url");
}

function sign(value: string, secret: string): string {
  return createHmac("sha256", secret).update(value).digest("base64url");
}

export function signSession(
  identity: string,
  secret: string,
  ttlSeconds = 30 * 24 * 60 * 60
): { token: string; expiresAt: number } {
  const now = Math.floor(Date.now() / 1000);
  const payload: SessionPayload = {
    sub: identity,
    iat: now,
    exp: now + ttlSeconds,
    v: 1
  };
  const encoded = base64url(JSON.stringify(payload));
  return { token: `${encoded}.${sign(encoded, secret)}`, expiresAt: payload.exp };
}

export function verifySession(token: string, secret: string): SessionPayload | null {
  const [encoded, signature] = token.split(".");
  if (!encoded || !signature) return null;

  try {
    const expected = sign(encoded, secret);
    const provided = Buffer.from(signature, "base64url");
    const expectedBuffer = Buffer.from(expected, "base64url");
    if (provided.length !== expectedBuffer.length) return null;
    if (!timingSafeEqual(provided, expectedBuffer)) return null;

    const payload = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8")) as SessionPayload;
    if (payload.v !== 1 || typeof payload.sub !== "string" || typeof payload.exp !== "number") {
      return null;
    }
    if (payload.exp <= Math.floor(Date.now() / 1000)) return null;
    return payload;
  } catch {
    return null;
  }
}
