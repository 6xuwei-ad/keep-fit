import assert from "node:assert/strict";
import { once } from "node:events";
import http from "node:http";
import type { AddressInfo } from "node:net";
import test from "node:test";
import { loadConfig } from "../config.ts";
import { recognizeFood } from "../services/vision.ts";

test("解析 OpenAI 兼容视觉模型的 JSON 结果", async (t) => {
  let receivedAuth = "";
  const server = http.createServer((req, res) => {
    receivedAuth = String(req.headers.authorization ?? "");
    req.resume();
    req.on("end", () => {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(
        JSON.stringify({
          choices: [
            {
              message: {
                content:
                  '{"dishName":"鸡胸肉沙拉","items":[{"name":"鸡胸肉","grams":120,"confidence":0.91,"category":"protein","per100g":{"kcal":165,"protein":31,"carbs":0,"fat":3.6,"fiber":0}},{"name":"生菜","grams":80,"confidence":0.86,"category":"vegetable","per100g":{"kcal":15,"protein":1.4,"carbs":2.9,"fat":0.2,"fiber":1.3}}]}'
              }
            }
          ]
        })
      );
    });
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const port = (server.address() as AddressInfo).port;

  t.after(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  const config = loadConfig({
    visionEnabled: true,
    allowDemo: false,
    visionApiKey: "test-key",
    visionBaseUrl: `http://127.0.0.1:${port}/v1`,
    visionModel: "test-vision",
    visionTimeoutMs: 5000
  });

  const result = await recognizeFood(
    { buffer: Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0, 0, 0, 0, 0]), mimetype: "image/jpeg" },
    config
  );

  assert.equal(receivedAuth, "Bearer test-key");
  assert.equal(result.provider, "vision");
  assert.equal(result.engine, "test-vision");
  assert.equal(result.dishName, "鸡胸肉沙拉");
  assert.equal(result.items.length, 2);
  assert.equal(result.items[0]?.name, "鸡胸肉");
  assert.equal(result.items[1]?.category, "vegetable");
});
