import assert from "node:assert/strict";
import test from "node:test";
import { signSession, verifySession } from "../lib/session.ts";

test("签名会话可以被验证，篡改后失效", () => {
  const secret = "test-session-secret";
  const { token, expiresAt } = signSession("wx_test_user_123", secret, 3600);
  const payload = verifySession(token, secret);
  assert.equal(payload?.sub, "wx_test_user_123");
  assert.ok(expiresAt > Math.floor(Date.now() / 1000));
  assert.equal(verifySession(`${token}x`, secret), null);
  assert.equal(verifySession(token, "wrong-secret"), null);
});

test("过期的会话不会被接受", () => {
  const secret = "test-session-secret";
  const { token } = signSession("wx_test_user_123", secret, -10);
  assert.equal(verifySession(token, secret), null);
});
