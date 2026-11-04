import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import { createApp } from "./app.ts";
import { loadConfig } from "./config.ts";
import { Store } from "./store.ts";

const config = loadConfig();
fs.mkdirSync(config.uploadDir, { recursive: true });

const store = new Store(path.join(config.dataDir, "shike.db"));
const app = createApp({ config, store });

const server = app.listen(config.port, "0.0.0.0", () => {
  const mode = config.visionEnabled ? `视觉模型 · ${config.visionModel}` : "演示识别";
  console.log("");
  console.log("  食刻 SHIKE");
  console.log(`  API      http://127.0.0.1:${config.port}`);
  console.log(`  模式     ${mode}`);
  console.log(`  微信登录 ${config.wechatEnabled ? "已启用" : "未配置（小程序回落设备模式）"}`);
  console.log(`  数据     ${path.join(config.dataDir, "shike.db")}`);
  if (process.env.NODE_ENV === "production" && !process.env.SESSION_SECRET) {
    console.warn("  [warn] 生产环境缺少 SESSION_SECRET，当前使用开发默认值，请立即配置。");
  }
  console.log("");
});

function shutdown(signal: string) {
  console.log(`\n[server] ${signal}, closing...`);
  server.close(() => {
    store.close();
    process.exit(0);
  });
  setTimeout(() => process.exit(1), 5000).unref();
}

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));
