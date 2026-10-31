import express, { type NextFunction, type Request, type Response } from "express";
import fs from "node:fs";
import path from "node:path";
import multer from "multer";
import { z } from "zod";
import type { AppConfig } from "./config.ts";
import type { Store } from "./store.ts";
import type {
  AppMeta,
  CreateMealInput,
  DaySummary,
  FoodCategory,
  Goal,
  MealType,
  NutritionFacts,
  Targets
} from "../shared/types.ts";
import { buildDailyAdvice } from "../shared/advice.ts";
import {
  GOAL_TARGETS,
  caloriePercent,
  inferMealType,
  localDateKey,
  round,
  sumNutrition
} from "../shared/nutrition.ts";
import { AppError } from "./lib/errors.ts";
import { detectImage, saveImage } from "./lib/image.ts";
import { signSession, verifySession } from "./lib/session.ts";
import { searchFoods } from "./data/foods.ts";
import { assembleAnalysis } from "./services/analysis.ts";
import { itemsTotal, makeFoodItem } from "./services/items.ts";
import { buildDemoRecognition, recognizeFood } from "./services/vision.ts";

const GOALS: Goal[] = ["fat-loss", "maintain", "muscle"];
const MEAL_TYPES: MealType[] = ["breakfast", "lunch", "dinner", "snack"];
const CATEGORIES: FoodCategory[] = [
  "protein",
  "staple",
  "vegetable",
  "fruit",
  "dairy",
  "fat",
  "dish",
  "drink",
  "other"
];

const nutritionSchema = z.object({
  kcal: z.coerce.number().min(0).max(1000),
  protein: z.coerce.number().min(0).max(200),
  carbs: z.coerce.number().min(0).max(200),
  fat: z.coerce.number().min(0).max(200),
  fiber: z.coerce.number().min(0).max(100)
});

const targetsSchema = z.object({
  kcal: z.coerce.number().min(800).max(5000),
  protein: z.coerce.number().min(30).max(300),
  carbs: z.coerce.number().min(30).max(600),
  fat: z.coerce.number().min(15).max(200),
  fiber: z.coerce.number().min(10).max(80)
});

const itemInputSchema = z.object({
  name: z.string().min(1).max(40),
  foodId: z.string().max(60).nullable().optional(),
  emoji: z.string().max(8).optional(),
  category: z.enum(CATEGORIES as [FoodCategory, ...FoodCategory[]]).optional(),
  grams: z.coerce.number().min(1).max(3000),
  confidence: z.coerce.number().min(0).max(1).optional(),
  portionHint: z.string().max(30).optional(),
  per100g: nutritionSchema
});

const createMealSchema = z.object({
  name: z.string().min(1).max(40),
  mealType: z.enum(MEAL_TYPES as [MealType, ...MealType[]]),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "日期格式应为 YYYY-MM-DD"),
  eatenAt: z.string().refine((value) => Number.isFinite(Date.parse(value)), "无效的用餐时间"),
  imageUrl: z
    .string()
    .max(300)
    .nullable()
    .refine(
      (value) => value === null || value.startsWith("/uploads/") || value.startsWith("/images/"),
      "图片来源不合法"
    ),
  engine: z.string().min(1).max(80),
  items: z.array(itemInputSchema).min(1).max(20)
});

const profileSchema = z.object({
  name: z.string().trim().min(1).max(20).optional(),
  goal: z.enum(GOALS as [Goal, ...Goal[]]).optional(),
  targets: targetsSchema.optional()
});

function asyncRoute(
  handler: (req: Request, res: Response, next: NextFunction) => Promise<unknown>
) {
  return (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(handler(req, res, next)).catch(next);
  };
}

const IDENTITY_PATTERN = /^[A-Za-z0-9_-]{8,64}$/;

/**
 * 支持两种身份：
 * 1. Authorization: Bearer <session token>（微信登录后签发）
 * 2. x-device-id（Web/PWA 与未配置微信登录时的匿名设备）
 */
function getDeviceId(req: Request, config: AppConfig): string {
  const authorization = req.header("authorization") ?? "";
  if (authorization.startsWith("Bearer ")) {
    const payload = verifySession(authorization.slice(7).trim(), config.sessionSecret);
    if (!payload || !IDENTITY_PATTERN.test(payload.sub)) {
      throw new AppError(401, "登录状态已失效，请重新进入小程序", "SESSION_INVALID");
    }
    return payload.sub;
  }

  const raw = req.header("x-device-id") ?? "";
  const value = raw.trim();
  if (!IDENTITY_PATTERN.test(value)) {
    throw new AppError(400, "缺少有效的设备标识", "DEVICE_REQUIRED");
  }
  return value;
}

const wechatLoginSchema = z.object({
  code: z.string().min(4).max(128)
});

function parseDate(value: unknown): string {
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  return localDateKey();
}

function sumMealTotals(meals: Array<{ totals: NutritionFacts }>): NutritionFacts {
  return sumNutrition(meals.map((meal) => ({ nutrition: meal.totals })));
}

function subtractTargets(targets: Targets, totals: NutritionFacts): NutritionFacts {
  return {
    kcal: round(targets.kcal - totals.kcal, 0),
    protein: round(targets.protein - totals.protein),
    carbs: round(targets.carbs - totals.carbs),
    fat: round(targets.fat - totals.fat),
    fiber: round(targets.fiber - totals.fiber)
  };
}

function createAnalyzeLimiter(max = 20, windowMs = 10 * 60 * 1000) {
  const hits = new Map<string, number[]>();
  return (deviceId: string): boolean => {
    const now = Date.now();
    const recent = (hits.get(deviceId) ?? []).filter((time) => now - time < windowMs);
    if (recent.length >= max) {
      hits.set(deviceId, recent);
      return false;
    }
    recent.push(now);
    hits.set(deviceId, recent);
    return true;
  };
}

export interface CreateAppOptions {
  config: AppConfig;
  store: Store;
}

export function createApp({ config, store }: CreateAppOptions) {
  const app = express();
  app.disable("x-powered-by");
  app.use((_req, res, next) => {
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("X-Frame-Options", "DENY");
    res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
    res.setHeader("Permissions-Policy", "camera=(self)");
    next();
  });
  app.use(express.json({ limit: "1mb" }));
  app.set("trust proxy", "loopback");

  const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 8 * 1024 * 1024, files: 1 },
    fileFilter: (_req, file, callback) => {
      const allowed = ["image/jpeg", "image/png", "image/webp"];
      if (!allowed.includes(file.mimetype)) {
        callback(new AppError(415, "仅支持 JPG、PNG 或 WebP 图片", "UNSUPPORTED_TYPE"));
        return;
      }
      callback(null, true);
    }
  });

  const checkAnalyzeLimit = createAnalyzeLimiter();

  const meta: AppMeta = {
    visionEnabled: config.visionEnabled,
    demoAllowed: config.allowDemo,
    wechatEnabled: config.wechatEnabled,
    model: config.visionEnabled ? config.visionModel : "演示引擎",
    version: config.version
  };

  app.get("/api/health", (_req, res) => {
    res.json({ ok: true, mode: config.visionEnabled ? "vision" : "demo", version: config.version });
  });

  app.get("/api/meta", (_req, res) => {
    res.json(meta);
  });

  /**
   * 微信小程序登录。未配置 WECHAT_APPID / WECHAT_SECRET 时返回 501，
   * 小程序会自动回落到本地设备 ID，便于本地开发。
   */
  app.post(
    "/api/auth/wechat",
    asyncRoute(async (req, res) => {
      if (!config.wechatEnabled) {
        throw new AppError(
          501,
          "服务端尚未配置微信登录，请使用设备模式运行",
          "WECHAT_NOT_CONFIGURED"
        );
      }
      const parsed = wechatLoginSchema.safeParse(req.body);
      if (!parsed.success) {
        throw new AppError(400, "微信登录参数不完整", "INVALID_WECHAT_CODE");
      }

      const endpoint = new URL("https://api.weixin.qq.com/sns/jscode2session");
      endpoint.searchParams.set("appid", config.wechatAppId);
      endpoint.searchParams.set("secret", config.wechatSecret);
      endpoint.searchParams.set("js_code", parsed.data.code);
      endpoint.searchParams.set("grant_type", "authorization_code");

      let upstream: globalThis.Response;
      try {
        upstream = await fetch(endpoint, { signal: AbortSignal.timeout(8000) });
      } catch {
        throw new AppError(502, "连接微信登录服务失败，请稍后重试", "WECHAT_NETWORK");
      }

      let data: {
        openid?: string;
        session_key?: string;
        unionid?: string;
        errcode?: number;
        errmsg?: string;
      };
      try {
        data = (await upstream.json()) as typeof data;
      } catch {
        throw new AppError(502, "微信登录服务返回了异常内容", "WECHAT_BAD_RESPONSE");
      }
      if (!upstream.ok || !data.openid) {
        throw new AppError(401, "微信登录失败，请重新进入小程序", "WECHAT_LOGIN_FAILED", {
          errcode: data.errcode,
          errmsg: data.errmsg
        });
      }

      const identity = `wx_${data.openid}`.slice(0, 64);
      if (!IDENTITY_PATTERN.test(identity)) {
        throw new AppError(500, "微信身份格式异常", "WECHAT_IDENTITY_INVALID");
      }

      const profile = store.ensureProfile(identity);
      const session = signSession(identity, config.sessionSecret, config.sessionTtlSeconds);
      res.json({
        token: session.token,
        identity,
        expiresAt: session.expiresAt,
        profile
      });
    })
  );

  app.get(
    "/api/profile",
    asyncRoute(async (req, res) => {
      const deviceId = getDeviceId(req, config);
      res.json({ profile: store.ensureProfile(deviceId) });
    })
  );

  app.put(
    "/api/profile",
    asyncRoute(async (req, res) => {
      const deviceId = getDeviceId(req, config);
      const parsed = profileSchema.safeParse(req.body);
      if (!parsed.success) {
        throw new AppError(400, "目标设置不完整或超出范围", "INVALID_PROFILE", parsed.error.issues);
      }
      const targetFromGoal = parsed.data.goal
        ? GOAL_TARGETS[parsed.data.goal]
        : undefined;
      const targets = parsed.data.targets ?? targetFromGoal;
      const profile = store.updateProfile(deviceId, {
        ...(parsed.data.name ? { name: parsed.data.name } : {}),
        ...(parsed.data.goal ? { goal: parsed.data.goal } : {}),
        ...(targets ? { targets } : {})
      });
      res.json({ profile });
    })
  );

  app.get(
    "/api/foods",
    asyncRoute(async (req, res) => {
      getDeviceId(req, config);
      const query = typeof req.query.q === "string" ? req.query.q.slice(0, 30) : "";
      const foods = searchFoods(query).map((food) => ({
        id: food.id,
        name: food.name,
        emoji: food.emoji,
        category: food.category,
        per100g: food.per100g,
        portions: food.portions
      }));
      res.json({ foods });
    })
  );

  app.get(
    "/api/meals",
    asyncRoute(async (req, res) => {
      const deviceId = getDeviceId(req, config);
      store.ensureProfile(deviceId);
      const date = parseDate(req.query.date);
      res.json({ date, meals: store.listMeals(deviceId, date) });
    })
  );

  app.get(
    "/api/day",
    asyncRoute(async (req, res) => {
      const deviceId = getDeviceId(req, config);
      const profile = store.ensureProfile(deviceId);
      const date = parseDate(req.query.date);
      const meals = store.listMeals(deviceId, date);
      const totals = sumMealTotals(meals);
      const percent = caloriePercent(totals.kcal, profile.targets.kcal);
      const summary: DaySummary = {
        date,
        meals,
        totals,
        targets: profile.targets,
        remaining: subtractTargets(profile.targets, totals),
        caloriePercent: percent,
        advice: buildDailyAdvice(totals, profile.targets, meals.length, percent)
      };
      res.json({ profile, summary });
    })
  );

  app.post(
    "/api/meals",
    asyncRoute(async (req, res) => {
      const deviceId = getDeviceId(req, config);
      store.ensureProfile(deviceId);
      const parsed = createMealSchema.safeParse(req.body);
      if (!parsed.success) {
        throw new AppError(400, "饮食记录格式不正确", "INVALID_MEAL", parsed.error.issues);
      }

      const input = parsed.data as CreateMealInput;
      const items = input.items.map((item) =>
        makeFoodItem({
          name: item.name,
          grams: item.grams,
          confidence: item.confidence,
          category: item.category,
          per100g: item.per100g,
          portionHint: item.portionHint,
          foodId: item.foodId ?? null
        })
      );
      const totals = itemsTotal(items);
      const meal = store.insertMeal(
        deviceId,
        {
          ...input,
          eatenAt: new Date(input.eatenAt).toISOString(),
          imageUrl: input.imageUrl
        },
        items,
        totals
      );
      res.status(201).json({ meal });
    })
  );

  app.delete(
    "/api/meals/:id",
    asyncRoute(async (req, res) => {
      const deviceId = getDeviceId(req, config);
      const id = String(req.params.id ?? "");
      if (!/^[0-9a-f-]{36}$/i.test(id)) {
        throw new AppError(400, "记录标识不合法", "INVALID_ID");
      }
      const deleted = store.deleteMeal(deviceId, id);
      if (!deleted) throw new AppError(404, "没有找到这条饮食记录", "MEAL_NOT_FOUND");
      res.status(204).end();
    })
  );

  app.post(
    "/api/analyze/demo",
    asyncRoute(async (req, res) => {
      const deviceId = getDeviceId(req, config);
      if (!checkAnalyzeLimit(deviceId)) {
        throw new AppError(429, "识别次数有点多，休息 10 分钟再试", "RATE_LIMITED");
      }
      const profile = store.ensureProfile(deviceId);
      const recognition = buildDemoRecognition();
      const analysis = assembleAnalysis(
        {
          dishName: recognition.dishName,
          imageUrl: "/images/demo-bowl.jpg",
          provider: "demo",
          engine: recognition.engine,
          notice: recognition.notice,
          items: recognition.items
        },
        profile.targets
      );

      res.status(201).json({
        analysis,
        suggestedMealType:
          typeof req.body?.mealType === "string" && MEAL_TYPES.includes(req.body.mealType as MealType)
            ? (req.body.mealType as MealType)
            : inferMealType()
      });
    })
  );

  app.post(
    "/api/analyze",
    (req, res, next) => {
      upload.single("image")(req, res, (error) => {
        if (error) next(error);
        else next();
      });
    },
    asyncRoute(async (req, res) => {
      const deviceId = getDeviceId(req, config);
      if (!checkAnalyzeLimit(deviceId)) {
        throw new AppError(429, "识别次数有点多，休息 10 分钟再试", "RATE_LIMITED");
      }
      if (!req.file) throw new AppError(400, "请上传一张餐食照片", "IMAGE_REQUIRED");

      const detected = detectImage(req.file.buffer);
      if (!detected) {
        throw new AppError(415, "图片内容无法识别，请换一张 JPG、PNG 或 WebP 图片", "INVALID_IMAGE");
      }

      const profile = store.ensureProfile(deviceId);
      const saved = await saveImage(config.uploadDir, req.file.buffer, detected);
      const recognition = await recognizeFood(
        { buffer: req.file.buffer, mimetype: detected.mime },
        config
      );
      const analysis = assembleAnalysis(
        {
          dishName: recognition.dishName,
          imageUrl: saved.url,
          provider: recognition.provider,
          engine: recognition.engine,
          notice: recognition.notice,
          items: recognition.items
        },
        profile.targets
      );

      res.status(201).json({
        analysis,
        suggestedMealType:
          typeof req.body?.mealType === "string" && MEAL_TYPES.includes(req.body.mealType as MealType)
            ? (req.body.mealType as MealType)
            : inferMealType()
      });
    })
  );

  app.use("/uploads", express.static(config.uploadDir, {
    maxAge: "7d",
    immutable: true
  }));
  app.use("/uploads", (_req, res) => {
    res.status(404).json({ error: "图片不存在", code: "IMAGE_NOT_FOUND" });
  });

  // 开发态 API 也需要提供示例图/图标，供微信小程序直接访问。
  app.use(express.static(config.publicDir, { maxAge: "1d" }));
  app.use("/images", (_req, res) => {
    res.status(404).end();
  });

  if (fs.existsSync(config.distDir)) {
    app.use(express.static(config.distDir, { index: false, maxAge: "1h" }));
    app.use((req, res, next) => {
      if (req.method !== "GET" && req.method !== "HEAD") {
        next();
        return;
      }
      if (req.path.startsWith("/api/") || req.path.startsWith("/uploads/")) {
        next();
        return;
      }
      res.sendFile(path.join(config.distDir, "index.html"));
    });
  }

  app.use("/api", (_req, res) => {
    res.status(404).json({ error: "接口不存在", code: "NOT_FOUND" });
  });

  app.use((error: unknown, _req: Request, res: Response, _next: NextFunction) => {
    if (error instanceof multer.MulterError) {
      const message =
        error.code === "LIMIT_FILE_SIZE" ? "照片不能超过 8MB" : "照片上传失败，请重试";
      res.status(error.code === "LIMIT_FILE_SIZE" ? 413 : 400).json({
        error: message,
        code: error.code
      });
      return;
    }
    if (error instanceof AppError) {
      res.status(error.status).json({
        error: error.message,
        code: error.code,
        ...(error.details ? { details: error.details } : {})
      });
      return;
    }
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: "请求数据不合法", code: "VALIDATION_ERROR" });
      return;
    }
    console.error("[server] unhandled error", error);
    res.status(500).json({ error: "服务器开小差了，请稍后再试", code: "INTERNAL_ERROR" });
  });

  return app;
}
