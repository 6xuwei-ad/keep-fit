import express, { type NextFunction, type Request, type Response } from "express";
import multer from "multer";
import { z } from "zod";
import type { AppConfig } from "./config.ts";
import type { Store } from "./store.ts";
import type {
  ActivityLevel,
  AppMeta,
  CreateMealInput,
  CustomFood,
  DaySummary,
  FoodCatalogItem,
  FoodCategory,
  FoodItem,
  Goal,
  Meal,
  MealItemInput,
  MealType,
  NutritionFacts,
  Profile,
  ReminderKind,
  Sex,
  Targets,
  TargetsMode,
  WeightTrendResponse
} from "../shared/types.ts";
import { buildDailyAdvice } from "../shared/advice.ts";
import { computeTargets, isBodyComplete } from "../shared/body.ts";
import { aggregateWeightWeeks, weekStartKey, weightChange } from "../shared/weight.ts";
import { applyAliases, normalizeAlias } from "./services/aliases.ts";
import {
  GOAL_TARGETS,
  caloriePercent,
  inferMealType,
  localDateKey,
  round,
  shiftDateKey,
  sumNutrition
} from "../shared/nutrition.ts";
import { AppError } from "./lib/errors.ts";
import { detectImage, saveImage } from "./lib/image.ts";
import { signSession, verifySession } from "./lib/session.ts";
import { FOOD_BY_ID, searchFoods, type FoodRecord } from "./data/foods.ts";
import { assembleAnalysis } from "./services/analysis.ts";
import { itemsTotal, makeFoodItem } from "./services/items.ts";
import { recognizeLabel } from "./services/label.ts";
import {
  REMINDER_KINDS,
  buildRemindersResponse,
  grantReminder,
  updateReminderSetting
} from "./services/reminders.ts";
import { buildWeeklyReportFor } from "./services/report.ts";
import { buildDemoRecognition, recognizeFood } from "./services/vision.ts";

const GOALS: Goal[] = ["fat-loss", "maintain", "muscle"];
const SEXES: Sex[] = ["female", "male"];
const ACTIVITY_LEVELS: ActivityLevel[] = [
  "sedentary",
  "light",
  "moderate",
  "active",
  "very-active"
];
const TARGETS_MODES: TargetsMode[] = ["auto", "manual"];
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

const templateCreateSchema = z.object({
  mealId: z.string().regex(/^[0-9a-f-]{36}$/i, "记录标识不合法")
});

const profileSchema = z.object({
  name: z.string().trim().min(1).max(20).optional(),
  goal: z.enum(GOALS as [Goal, ...Goal[]]).optional(),
  targets: targetsSchema.optional(),
  targetsMode: z.enum(TARGETS_MODES as [TargetsMode, ...TargetsMode[]]).optional(),
  recalculate: z.boolean().optional(),
  sex: z.enum(SEXES as [Sex, ...Sex[]]).nullable().optional(),
  age: z.number().int().min(18).max(80).nullable().optional(),
  heightCm: z.number().min(120).max(230).nullable().optional(),
  weightKg: z.number().min(30).max(250).nullable().optional(),
  activityLevel: z
    .enum(ACTIVITY_LEVELS as [ActivityLevel, ...ActivityLevel[]])
    .nullable()
    .optional()
});

const weightSchema = z.object({
  weightKg: z.coerce.number().min(30).max(250),
  date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "日期格式应为 YYYY-MM-DD")
    .optional()
});

const reminderUpdateSchema = z.object({
  enabled: z.boolean()
});

const portionsSchema = z
  .array(
    z.object({
      label: z.string().trim().min(1).max(12),
      grams: z.coerce.number().min(1).max(3000)
    })
  )
  .max(5)
  .optional();

const customNutritionSchema = z.object({
  kcal: z.coerce.number().min(0).max(900),
  protein: z.coerce.number().min(0).max(100),
  carbs: z.coerce.number().min(0).max(100),
  fat: z.coerce.number().min(0).max(100),
  fiber: z.coerce.number().min(0).max(100)
});

const customFoodSchema = z.object({
  name: z.string().trim().min(1).max(40),
  emoji: z.string().trim().max(8).optional(),
  category: z.enum(CATEGORIES as [FoodCategory, ...FoodCategory[]]).optional(),
  per100g: customNutritionSchema,
  portions: portionsSchema
});

const aliasSchema = z.object({
  alias: z.string().trim().min(1).max(40),
  foodId: z.string().max(80).nullable().optional(),
  name: z.string().trim().min(1).max(40),
  emoji: z.string().trim().max(8).optional(),
  category: z.enum(CATEGORIES as [FoodCategory, ...FoodCategory[]]).optional(),
  per100g: customNutritionSchema,
  portionHint: z.string().trim().max(30).optional()
});

const CUSTOM_FOOD_ID = /^custom_[0-9a-f-]{36}$/i;

function isValidDateKey(value: string): boolean {
  const [year, month, day] = value.split("-").map(Number);
  if (!year || !month || !day) return false;
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
}

/** 体重不能记在未来；不传日期时默认今天。 */
function parseWeightDate(value: string | undefined): string {
  const today = localDateKey();
  const date = value ?? today;
  if (!isValidDateKey(date)) {
    throw new AppError(400, "日期不存在，请重新选择", "INVALID_WEIGHT_DATE");
  }
  if (date > today) {
    throw new AppError(400, "体重日期不能晚于今天", "WEIGHT_FUTURE");
  }
  return date;
}

function parseReminderKind(value: string): ReminderKind {
  if (!(REMINDER_KINDS as readonly string[]).includes(value)) {
    throw new AppError(400, "不支持的提醒类型", "INVALID_REMINDER_KIND");
  }
  return value as ReminderKind;
}

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
 * 2. x-device-id（未配置微信登录时的匿名设备模式）
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

function parseOptionalDate(value: unknown): string {
  if (value === undefined || value === null || value === "") return localDateKey();
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  throw new AppError(400, "日期格式应为 YYYY-MM-DD", "INVALID_DATE");
}

function toMealItemInput(item: FoodItem): MealItemInput {
  return {
    foodId: item.foodId,
    name: item.name,
    emoji: item.emoji,
    category: item.category,
    grams: item.grams,
    confidence: item.confidence,
    portionHint: item.portionHint,
    per100g: item.per100g
  };
}

function customFoodCatalog(food: CustomFood, name = food.name): FoodCatalogItem {
  return {
    id: food.id,
    name,
    emoji: food.emoji,
    category: food.category,
    per100g: food.per100g,
    portions: food.portions,
    source: "custom"
  };
}

function builtinFoodCatalog(food: FoodRecord): FoodCatalogItem {
  return {
    id: food.id,
    name: food.name,
    emoji: food.emoji,
    category: food.category,
    per100g: food.per100g,
    portions: food.portions,
    source: "builtin"
  };
}

/** 复制 / 常用餐都走这里：服务端重新计算营养，不信任存下来的总量。 */
function insertMealFromItems(
  store: Store,
  deviceId: string,
  meta: {
    name: string;
    mealType: MealType;
    date: string;
    imageUrl: string | null;
    engine: string;
  },
  rawItems: MealItemInput[]
): Meal {
  const items = rawItems.map((item) =>
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
  return store.insertMeal(
    deviceId,
    {
      ...meta,
      eatenAt: new Date().toISOString(),
      items
    },
    items,
    totals
  );
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

      const current = store.ensureProfile(deviceId);
      const body = {
        sex: parsed.data.sex !== undefined ? parsed.data.sex : current.sex,
        age: parsed.data.age !== undefined ? parsed.data.age : current.age,
        heightCm:
          parsed.data.heightCm !== undefined ? parsed.data.heightCm : current.heightCm,
        weightKg:
          parsed.data.weightKg !== undefined ? parsed.data.weightKg : current.weightKg,
        activityLevel:
          parsed.data.activityLevel !== undefined
            ? parsed.data.activityLevel
            : current.activityLevel
      };
      const goal = parsed.data.goal ?? current.goal;
      const hasBodyPatch =
        parsed.data.sex !== undefined ||
        parsed.data.age !== undefined ||
        parsed.data.heightCm !== undefined ||
        parsed.data.weightKg !== undefined ||
        parsed.data.activityLevel !== undefined;
      const wantsAuto =
        parsed.data.recalculate === true || parsed.data.targetsMode === "auto";

      let targets = parsed.data.targets;
      let targetsMode: TargetsMode | undefined;

      if (targets) {
        targetsMode = "manual";
      } else if (wantsAuto) {
        if (!isBodyComplete(body)) {
          throw new AppError(
            400,
            "请先填写完整的性别、年龄、身高、体重和活动量",
            "BODY_INCOMPLETE"
          );
        }
        targets = computeTargets(body, goal).targets;
        targetsMode = "auto";
      } else if (
        current.targetsMode === "auto" &&
        isBodyComplete(body) &&
        (hasBodyPatch || parsed.data.goal !== undefined)
      ) {
        targets = computeTargets(body, goal).targets;
        targetsMode = "auto";
      } else if (current.targetsMode === "auto" && !isBodyComplete(body)) {
        targetsMode = "manual";
      } else if (parsed.data.goal) {
        targets = GOAL_TARGETS[goal];
        targetsMode = "manual";
      } else if (parsed.data.targetsMode === "manual") {
        targetsMode = "manual";
      }

      const profile: Profile = store.updateProfile(deviceId, {
        ...(parsed.data.name ? { name: parsed.data.name } : {}),
        ...(parsed.data.goal ? { goal: parsed.data.goal } : {}),
        ...body,
        ...(targets ? { targets } : {}),
        ...(targetsMode ? { targetsMode } : {})
      });

      // 目标页修改体重时顺手记下今天的体重，避免档案与趋势出现两个数字。
      if (
        parsed.data.weightKg !== undefined &&
        parsed.data.weightKg !== null &&
        (current.weightKg === null ||
          Math.abs(current.weightKg - parsed.data.weightKg) >= 0.001)
      ) {
        store.upsertWeightLog(deviceId, {
          date: localDateKey(),
          weightKg: round(parsed.data.weightKg, 1)
        });
      }

      res.json({ profile });
    })
  );

  app.get(
    "/api/weights",
    asyncRoute(async (req, res) => {
      const deviceId = getDeviceId(req, config);
      const profile = store.ensureProfile(deviceId);
      const today = localDateKey();
      const logs = store.listWeightLogs(deviceId, 365);
      const weeks = aggregateWeightWeeks(logs, 12);
      const latest = logs.length > 0 ? (logs[logs.length - 1] ?? null) : null;
      const latestWeek = weeks.length > 0 ? (weeks[weeks.length - 1] ?? null) : null;
      const currentWeekStart = weekStartKey(today);

      const payload: WeightTrendResponse = {
        logs,
        weeks,
        latest,
        latestWeek,
        change: weightChange(logs, 28),
        currentWeekStart,
        recordedThisWeek: logs.some(
          (log) => log.date >= currentWeekStart && log.date <= today
        ),
        profile
      };
      res.json(payload);
    })
  );

  app.post(
    "/api/weights",
    asyncRoute(async (req, res) => {
      const deviceId = getDeviceId(req, config);
      const parsed = weightSchema.safeParse(req.body);
      if (!parsed.success) {
        throw new AppError(
          400,
          "体重需要在 30–250kg 之间",
          "INVALID_WEIGHT",
          parsed.error.issues
        );
      }
      const date = parseWeightDate(parsed.data.date);
      const result = store.upsertWeightLog(deviceId, {
        date,
        weightKg: round(parsed.data.weightKg, 1)
      });
      const synced = store.syncWeightToProfile(deviceId);
      res.status(result.created ? 201 : 200).json({
        log: result.log,
        created: result.created,
        profile: synced.profile,
        targetsUpdated: synced.targetsUpdated
      });
    })
  );

  app.delete(
    "/api/weights/:id",
    asyncRoute(async (req, res) => {
      const deviceId = getDeviceId(req, config);
      const id = String(req.params.id ?? "");
      if (!/^[0-9a-f-]{36}$/i.test(id)) {
        throw new AppError(400, "体重记录标识不合法", "INVALID_ID");
      }
      if (!store.deleteWeightLog(deviceId, id)) {
        throw new AppError(404, "没有找到这条体重记录", "WEIGHT_NOT_FOUND");
      }
      const synced = store.syncWeightToProfile(deviceId);
      res.json({ profile: synced.profile, targetsUpdated: synced.targetsUpdated });
    })
  );

  app.get(
    "/api/reports/weekly",
    asyncRoute(async (req, res) => {
      const deviceId = getDeviceId(req, config);
      const requested =
        typeof req.query.weekStart === "string" ? req.query.weekStart : null;
      res.json(buildWeeklyReportFor(store, deviceId, requested));
    })
  );

  app.get(
    "/api/reminders",
    asyncRoute(async (req, res) => {
      const deviceId = getDeviceId(req, config);
      res.json(buildRemindersResponse(config, store, deviceId));
    })
  );

  app.put(
    "/api/reminders/:kind",
    asyncRoute(async (req, res) => {
      const deviceId = getDeviceId(req, config);
      const kind = parseReminderKind(String(req.params.kind ?? ""));
      const parsed = reminderUpdateSchema.safeParse(req.body);
      if (!parsed.success) {
        throw new AppError(400, "提醒开关参数不完整", "INVALID_REMINDER", parsed.error.issues);
      }
      res.json(updateReminderSetting(config, store, deviceId, kind, parsed.data.enabled));
    })
  );

  app.post(
    "/api/reminders/:kind/grant",
    asyncRoute(async (req, res) => {
      const deviceId = getDeviceId(req, config);
      const kind = parseReminderKind(String(req.params.kind ?? ""));
      if (!config.reminderTemplates[kind]) {
        throw new AppError(
          400,
          "该提醒还没有配置订阅消息模板",
          "REMINDER_TEMPLATE_MISSING"
        );
      }
      res.status(201).json(grantReminder(config, store, deviceId, kind));
    })
  );

  app.get(
    "/api/custom-foods",
    asyncRoute(async (req, res) => {
      const deviceId = getDeviceId(req, config);
      res.json({ foods: store.listCustomFoods(deviceId) });
    })
  );

  app.post(
    "/api/custom-foods",
    asyncRoute(async (req, res) => {
      const deviceId = getDeviceId(req, config);
      const parsed = customFoodSchema.safeParse(req.body);
      if (!parsed.success) {
        throw new AppError(
          400,
          "自定义食物信息不完整",
          "INVALID_CUSTOM_FOOD",
          parsed.error.issues
        );
      }
      if (store.findCustomFoodByName(deviceId, parsed.data.name)) {
        throw new AppError(409, "已经有同名食物了", "CUSTOM_FOOD_EXISTS");
      }
      const food = store.createCustomFood(deviceId, {
        name: parsed.data.name,
        emoji: parsed.data.emoji || "🍽️",
        category: parsed.data.category ?? "other",
        per100g: parsed.data.per100g,
        portions: parsed.data.portions ?? []
      });
      res.status(201).json({ food });
    })
  );

  app.put(
    "/api/custom-foods/:id",
    asyncRoute(async (req, res) => {
      const deviceId = getDeviceId(req, config);
      const id = String(req.params.id ?? "");
      if (!CUSTOM_FOOD_ID.test(id)) {
        throw new AppError(400, "自定义食物标识不合法", "INVALID_ID");
      }
      if (!store.getCustomFood(deviceId, id)) {
        throw new AppError(404, "没有找到这个自定义食物", "CUSTOM_FOOD_NOT_FOUND");
      }
      const parsed = customFoodSchema.safeParse(req.body);
      if (!parsed.success) {
        throw new AppError(
          400,
          "自定义食物信息不完整",
          "INVALID_CUSTOM_FOOD",
          parsed.error.issues
        );
      }
      const sameName = store.findCustomFoodByName(deviceId, parsed.data.name);
      if (sameName && sameName.id !== id) {
        throw new AppError(409, "已经有同名食物了", "CUSTOM_FOOD_EXISTS");
      }
      const food = store.updateCustomFood(deviceId, id, {
        name: parsed.data.name,
        emoji: parsed.data.emoji || "🍽️",
        category: parsed.data.category ?? "other",
        per100g: parsed.data.per100g,
        portions: parsed.data.portions ?? []
      });
      if (!food) throw new AppError(404, "没有找到这个自定义食物", "CUSTOM_FOOD_NOT_FOUND");
      res.json({ food });
    })
  );

  app.delete(
    "/api/custom-foods/:id",
    asyncRoute(async (req, res) => {
      const deviceId = getDeviceId(req, config);
      const id = String(req.params.id ?? "");
      if (!CUSTOM_FOOD_ID.test(id)) {
        throw new AppError(400, "自定义食物标识不合法", "INVALID_ID");
      }
      if (!store.deleteCustomFood(deviceId, id)) {
        throw new AppError(404, "没有找到这个自定义食物", "CUSTOM_FOOD_NOT_FOUND");
      }
      res.status(204).end();
    })
  );

  app.post(
    "/api/aliases",
    asyncRoute(async (req, res) => {
      const deviceId = getDeviceId(req, config);
      const parsed = aliasSchema.safeParse(req.body);
      if (!parsed.success) {
        throw new AppError(400, "别名参数不完整", "INVALID_ALIAS", parsed.error.issues);
      }
      const alias = normalizeAlias(parsed.data.alias);
      if (!alias) throw new AppError(400, "别名不能为空", "INVALID_ALIAS");
      const saved = store.upsertAlias(deviceId, {
        alias,
        foodId: parsed.data.foodId ?? null,
        name: parsed.data.name,
        emoji: parsed.data.emoji || "🍽️",
        category: parsed.data.category ?? "other",
        per100g: parsed.data.per100g,
        portionHint: parsed.data.portionHint || ""
      });
      res.status(201).json({ alias: saved });
    })
  );

  app.get(
    "/api/foods",
    asyncRoute(async (req, res) => {
      const deviceId = getDeviceId(req, config);
      if (req.query.recent === "1") {
        const recent = store.listRecentFoods(deviceId, 20).map((entry) => {
          const custom = entry.foodId
            ? store.getCustomFood(deviceId, entry.foodId)
            : null;
          if (custom) {
            // 保留用户上次看到的菜名，营养值仍用自定义食物。
            return customFoodCatalog(custom, entry.name || custom.name);
          }

          const food = entry.foodId ? FOOD_BY_ID.get(entry.foodId) : null;
          if (food) {
            return {
              id: food.id,
              // 保留用户上次看到的菜名（可能是“香煎豆腐”），营养值仍用食物库。
              name: entry.name || food.name,
              emoji: food.emoji,
              category: food.category,
              per100g: food.per100g,
              portions: food.portions,
              source: "builtin"
            };
          }
          return {
            id: entry.foodId ?? `recent-${entry.name}`,
            name: entry.name,
            emoji: entry.emoji,
            category: entry.category,
            per100g: entry.per100g,
            portions: []
          };
        });
        res.json({ foods: recent });
        return;
      }

      const query = typeof req.query.q === "string" ? req.query.q.slice(0, 30) : "";
      const normalized = query.trim().toLowerCase();
      const customFoods = store
        .listCustomFoods(deviceId, 100)
        .filter((food) => !normalized || food.name.toLowerCase().includes(normalized))
        .slice(0, 8)
        .map((food) => customFoodCatalog(food));
      const customNames = new Set(customFoods.map((food) => food.name.trim().toLowerCase()));
      const builtIn = searchFoods(query)
        .filter((food) => !customNames.has(food.name.trim().toLowerCase()))
        .map(builtinFoodCatalog);
      res.json({ foods: [...customFoods, ...builtIn].slice(0, 24) });
    })
  );

  app.get(
    "/api/repeat",
    asyncRoute(async (req, res) => {
      const deviceId = getDeviceId(req, config);
      store.ensureProfile(deviceId);
      const yesterdayKey = shiftDateKey(localDateKey(), -1);
      const yesterday = store
        .listMeals(deviceId, yesterdayKey)
        .slice(-4)
        .map((meal) => ({
          id: meal.id,
          name: meal.name,
          mealType: meal.mealType,
          imageUrl: meal.imageUrl,
          emoji: (meal.items[0] && meal.items[0].emoji) || "🍽️",
          itemCount: meal.items.length,
          totals: meal.totals
        }));

      res.json({
        templates: store.listTemplates(deviceId, 12),
        yesterday
      });
    })
  );

  app.post(
    "/api/templates",
    asyncRoute(async (req, res) => {
      const deviceId = getDeviceId(req, config);
      const parsed = templateCreateSchema.safeParse(req.body);
      if (!parsed.success) {
        throw new AppError(400, "常用餐参数不完整", "INVALID_TEMPLATE", parsed.error.issues);
      }
      const meal = store.getMeal(deviceId, parsed.data.mealId);
      if (!meal) throw new AppError(404, "没有找到这条饮食记录", "MEAL_NOT_FOUND");

      const result = store.upsertTemplate(deviceId, {
        name: meal.name,
        mealType: meal.mealType,
        imageUrl: meal.imageUrl,
        items: meal.items.map(toMealItemInput),
        totals: meal.totals
      });
      res.status(result.created ? 201 : 200).json({
        template: result.template,
        updated: !result.created
      });
    })
  );

  app.post(
    "/api/templates/:id/log",
    asyncRoute(async (req, res) => {
      const deviceId = getDeviceId(req, config);
      const id = String(req.params.id ?? "");
      if (!/^[0-9a-f-]{36}$/i.test(id)) {
        throw new AppError(400, "常用餐标识不合法", "INVALID_ID");
      }
      const template = store.getTemplate(deviceId, id);
      if (!template) throw new AppError(404, "没有找到这个常用餐", "TEMPLATE_NOT_FOUND");

      const meal = insertMealFromItems(
        store,
        deviceId,
        {
          name: template.name,
          mealType: template.mealType,
          date: parseOptionalDate(req.body?.date),
          imageUrl: null,
          engine: "常用餐"
        },
        template.items
      );
      store.touchTemplate(deviceId, id);
      res.status(201).json({ meal });
    })
  );

  app.delete(
    "/api/templates/:id",
    asyncRoute(async (req, res) => {
      const deviceId = getDeviceId(req, config);
      const id = String(req.params.id ?? "");
      if (!/^[0-9a-f-]{36}$/i.test(id)) {
        throw new AppError(400, "常用餐标识不合法", "INVALID_ID");
      }
      if (!store.deleteTemplate(deviceId, id)) {
        throw new AppError(404, "没有找到这个常用餐", "TEMPLATE_NOT_FOUND");
      }
      res.status(204).end();
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

  app.post(
    "/api/meals/:id/copy",
    asyncRoute(async (req, res) => {
      const deviceId = getDeviceId(req, config);
      const id = String(req.params.id ?? "");
      if (!/^[0-9a-f-]{36}$/i.test(id)) {
        throw new AppError(400, "记录标识不合法", "INVALID_ID");
      }
      const source = store.getMeal(deviceId, id);
      if (!source) throw new AppError(404, "没有找到这条饮食记录", "MEAL_NOT_FOUND");

      const meal = insertMealFromItems(
        store,
        deviceId,
        {
          name: source.name,
          mealType: source.mealType,
          date: parseOptionalDate(req.body?.date),
          imageUrl: source.imageUrl,
          engine: source.engine
        },
        source.items.map(toMealItemInput)
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
          items: applyAliases(recognition.items, store.listAliases(deviceId))
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
    "/api/analyze/label",
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
      if (!req.file) throw new AppError(400, "请上传一张营养成分表照片", "IMAGE_REQUIRED");
      if (!config.visionEnabled) {
        throw new AppError(501, "营养标签识别需要配置视觉模型", "VISION_REQUIRED");
      }

      const detected = detectImage(req.file.buffer);
      if (!detected) {
        throw new AppError(415, "图片内容无法识别，请换一张 JPG、PNG 或 WebP 图片", "INVALID_IMAGE");
      }

      const label = await recognizeLabel(
        { buffer: req.file.buffer, mimetype: detected.mime },
        config
      );
      const saved = await saveImage(config.uploadDir, req.file.buffer, detected);
      res.status(201).json({ label: { ...label, imageUrl: saved.url } });
    })
  );

  app.use("/uploads", express.static(config.uploadDir, {
    maxAge: "7d",
    immutable: true
  }));
  app.use("/uploads", (_req, res) => {
    res.status(404).json({ error: "图片不存在", code: "IMAGE_NOT_FOUND" });
  });

  // 示例餐盘图片，供小程序演示识别直接访问。
  app.use(express.static(config.publicDir, { maxAge: "1d" }));
  app.use("/images", (_req, res) => {
    res.status(404).end();
  });

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
