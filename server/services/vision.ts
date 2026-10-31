import { z } from "zod";
import type { AppConfig } from "../config.ts";
import type { FoodCategory } from "../../shared/types.ts";
import { DEMO_DISH, DEMO_ITEMS } from "../data/demo.ts";
import { AppError } from "../lib/errors.ts";
import type { RawVisionItem } from "./items.ts";

const CATEGORIES = [
  "protein",
  "staple",
  "vegetable",
  "fruit",
  "dairy",
  "fat",
  "dish",
  "drink",
  "other"
] as const satisfies readonly FoodCategory[];

const nutritionSchema = z.object({
  kcal: z.coerce.number().min(0).max(900),
  protein: z.coerce.number().min(0).max(100),
  carbs: z.coerce.number().min(0).max(100),
  fat: z.coerce.number().min(0).max(100),
  fiber: z.coerce.number().min(0).max(100).default(0)
});

const itemSchema = z.object({
  name: z.string().min(1).max(40),
  grams: z.coerce.number().min(1).max(3000),
  confidence: z.coerce.number().min(0).max(100).default(70),
  category: z.enum(CATEGORIES).catch("other"),
  per100g: nutritionSchema.optional(),
  portionHint: z.string().max(30).optional()
});

const outputSchema = z.object({
  dishName: z.string().min(1).max(40).optional(),
  items: z.array(itemSchema).min(1).max(12)
});

export interface Recognition {
  dishName: string;
  items: RawVisionItem[];
  provider: "vision" | "demo";
  engine: string;
  notice: string | null;
}

const SYSTEM_PROMPT = `你是「食刻」App 的食物视觉分析引擎，也是一名严谨的中国注册营养师。

任务：识别照片中所有可食用的食物，拆解混合菜肴的主要食材，并估算用户实际会吃下的重量。

必须只输出一个 JSON 对象，不要 Markdown、不要解释。格式：
{
  "dishName": "这一餐的简短名称",
  "items": [
    {
      "name": "食物中文名",
      "grams": 120,
      "confidence": 0.86,
      "category": "protein",
      "per100g": {"kcal": 165, "protein": 31, "carbs": 0, "fat": 3.6, "fiber": 0},
      "portionHint": "约一掌心"
    }
  ]
}

规则：
1. 识别 1–10 种可见食物；混合菜按主要食材拆开，例如“青椒肉丝”拆成青椒与猪肉。
2. grams 是照片中这一份的可食部分熟重，1–3000 的整数；仅凭画面不确定时给保守估计，并降低 confidence。
3. category 只能是 protein、staple、vegetable、fruit、dairy、fat、dish、drink、other 之一。
4. per100g 填该食物每 100g 的热量(kcal)、蛋白质、碳水、脂肪、膳食纤维（克），使用中国食物成分表或 USDA 的常见近似值。
5. 不要虚构画面中不存在的食物；看不清时给出最可能名称，confidence 不高于 0.5。
6. 油、酱汁、糖如果明显可见或菜品明显重油，单独列出或计入对应食材，不要忽略。
7. dishName 用自然的中文，例如“香煎豆腐彩虹能量碗”，不超过 20 字。`;

function demoRecognition(notice: string): Recognition {
  return {
    dishName: DEMO_DISH,
    items: DEMO_ITEMS.map((item) => ({
      name: item.name,
      grams: item.grams,
      confidence: item.confidence,
      category: item.category
    })),
    provider: "demo",
    engine: "食刻演示引擎",
    notice
  };
}

export function buildDemoRecognition(): Recognition {
  return demoRecognition(
    "演示模式：当前结果来自内置示例餐盘。配置 VISION_API_KEY 后，上传的照片会由视觉模型真实识别。"
  );
}

function parseModelJson(content: string): unknown {
  const clean = content
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/i, "");
  try {
    return JSON.parse(clean);
  } catch {
    const start = clean.indexOf("{");
    const end = clean.lastIndexOf("}");
    if (start >= 0 && end > start) {
      try {
        return JSON.parse(clean.slice(start, end + 1));
      } catch {
        throw new AppError(502, "视觉模型返回了无法解析的内容", "VISION_BAD_JSON");
      }
    }
    throw new AppError(502, "视觉模型返回了无法解析的内容", "VISION_BAD_JSON");
  }
}

async function requestVision(
  image: { buffer: Buffer; mimetype: string },
  config: AppConfig,
  withJsonMode: boolean
): Promise<Recognition> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), config.visionTimeoutMs);

  try {
    const body: Record<string, unknown> = {
      model: config.visionModel,
      temperature: 0.2,
      max_tokens: 1600,
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        {
          role: "user",
          content: [
            {
              type: "text",
              text: "请分析这张餐食照片，按约定 JSON 输出。注意区分主食、蛋白质与蔬菜，克数按这一份可食部分估算。"
            },
            {
              type: "image_url",
              image_url: {
                url: `data:${image.mimetype};base64,${image.buffer.toString("base64")}`,
                detail: "low"
              }
            }
          ]
        }
      ]
    };
    if (withJsonMode) body.response_format = { type: "json_object" };

    const response = await fetch(`${config.visionBaseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${config.visionApiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify(body),
      signal: controller.signal
    });

    if (!response.ok) {
      const text = await response.text();
      throw new AppError(
        response.status === 429 ? 429 : 502,
        response.status === 429
          ? "视觉识别请求过于频繁，请稍后再试"
          : "视觉模型调用失败",
        "VISION_UPSTREAM",
        { status: response.status, body: text.slice(0, 500) }
      );
    }

    const payload = (await response.json()) as {
      choices?: Array<{ message?: { content?: string | Array<{ type?: string; text?: string }> } }>;
    };
    const rawContent = payload.choices?.[0]?.message?.content;
    const content = Array.isArray(rawContent)
      ? rawContent.map((part) => part.text ?? "").join("")
      : rawContent;

    if (!content) {
      throw new AppError(502, "视觉模型没有返回识别结果", "VISION_EMPTY");
    }

    const parsed = parseModelJson(content) as Record<string, unknown>;
    const candidate = {
      dishName: parsed.dishName ?? parsed.dish_name ?? parsed.name,
      items: parsed.items ?? parsed.foods ?? parsed.food_items
    };
    const result = outputSchema.safeParse(candidate);
    if (!result.success) {
      throw new AppError(502, "视觉模型返回的数据结构不完整", "VISION_SCHEMA", result.error.issues);
    }

    return {
      dishName: result.data.dishName ?? "这一餐",
      items: result.data.items.map((item) => ({
        name: item.name,
        grams: Math.round(item.grams),
        confidence: item.confidence > 1 ? item.confidence / 100 : item.confidence,
        category: item.category,
        per100g: item.per100g
          ? { ...item.per100g, fiber: item.per100g.fiber ?? 0 }
          : undefined,
        portionHint: item.portionHint
      })),
      provider: "vision",
      engine: config.visionModel,
      notice: null
    };
  } catch (error) {
    if (error instanceof AppError) throw error;
    if (error instanceof Error && error.name === "AbortError") {
      throw new AppError(504, "视觉识别超时，请重试或换一张更小的照片", "VISION_TIMEOUT");
    }
    throw new AppError(502, "视觉模型连接失败", "VISION_NETWORK");
  } finally {
    clearTimeout(timer);
  }
}

export async function recognizeFood(
  image: { buffer: Buffer; mimetype: string },
  config: AppConfig
): Promise<Recognition> {
  if (!config.visionEnabled) {
    return buildDemoRecognition();
  }

  try {
    try {
      return await requestVision(image, config, true);
    } catch (error) {
      const details = error instanceof AppError ? error.details : undefined;
      const status =
        details && typeof details === "object" && "status" in details
          ? Number((details as { status?: unknown }).status)
          : 0;
      // 部分兼容网关不支持 response_format，去掉后重试一次。
      if (status === 400 || status === 422) {
        return await requestVision(image, config, false);
      }
      throw error;
    }
  } catch (error) {
    if (!config.allowDemo) {
      if (error instanceof AppError) throw error;
      throw new AppError(502, "视觉模型返回异常，请稍后重试", "VISION_ERROR");
    }
    const reason = error instanceof AppError ? error.message : "识别服务暂时不可用";
    console.warn(`[vision] ${reason}`);
    return demoRecognition(
      `视觉模型暂时不可用（${reason}），已切换到演示餐盘。配置与网络恢复后可重试。`
    );
  }
}
