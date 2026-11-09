import { z } from "zod";
import type { AppConfig } from "../config.ts";
import type { LabelResult, NutritionFacts } from "../../shared/types.ts";
import { clamp, round } from "../../shared/nutrition.ts";
import { AppError } from "../lib/errors.ts";

/**
 * 包装食品营养成分表 OCR。
 * 模型只负责“读出标签”，归一化、单位换算和上下限由服务端负责。
 */

const outputSchema = z.object({
  productName: z.string().min(1).max(40).optional(),
  basis: z.enum(["100g", "100ml", "serving"]).catch("100g"),
  servingSize: z.coerce.number().min(1).max(3000).optional(),
  servingUnit: z.enum(["g", "ml"]).catch("g"),
  energyKj: z.coerce.number().min(0).max(4000).optional(),
  kcal: z.coerce.number().min(0).max(900).optional(),
  protein: z.coerce.number().min(0).max(100),
  carbs: z.coerce.number().min(0).max(100),
  fat: z.coerce.number().min(0).max(100),
  fiber: z.coerce.number().min(0).max(100).optional(),
  sodium: z.coerce.number().min(0).max(10000).optional(),
  confidence: z.coerce.number().min(0).max(100).default(80),
  notice: z.string().max(100).optional()
});

export type LabelOcrInput = z.infer<typeof outputSchema>;

const SYSTEM_PROMPT = `你是「食刻」App 的包装食品营养成分表 OCR 引擎。

任务：读取照片里的营养成分表，只输出一个 JSON 对象，不要 Markdown、不要解释。格式：
{
  "productName": "包装上的产品名，看不到时写包装食品",
  "basis": "100g",
  "servingSize": 100,
  "servingUnit": "g",
  "energyKj": 1200,
  "kcal": 286,
  "protein": 8.2,
  "carbs": 45.1,
  "fat": 7.6,
  "fiber": 2.1,
  "sodium": 320,
  "confidence": 0.92,
  "notice": ""
}

规则：
1. basis 只能是 100g、100ml、serving。标签按每 100g 写就用 100g，按每 100ml 写就用 100ml，按每份写就用 serving 并填 servingSize 和 servingUnit。
2. 如果标签同时有“每 100g”和“每份”，优先读每 100g 那一列。
3. 能量可能是 kJ，填 energyKj；如果标签直接写 kcal，也填 kcal。不要自己编造没有的数字。
4. protein、carbs、fat、fiber 的单位是克；sodium 的单位是毫克。
5. 只读营养成分表，不要把配料表、广告语当成数值。
6. 字迹模糊或数字看不清时降低 confidence，不要猜一个看起来合理的数字。
7. 如果标签只有 NRV% 没有绝对数值，对应字段填 0，并在 notice 里写“只有NRV%，建议手动核对”。
8. notice 不超过 40 字；没有问题就留空。`;

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
        throw new AppError(502, "营养标签识别结果无法解析", "LABEL_BAD_JSON");
      }
    }
    throw new AppError(502, "营养标签识别结果无法解析", "LABEL_BAD_JSON");
  }
}

async function requestLabel(
  image: { buffer: Buffer; mimetype: string },
  config: AppConfig,
  withJsonMode: boolean
): Promise<LabelOcrInput> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), config.visionTimeoutMs);

  try {
    const body: Record<string, unknown> = {
      model: config.visionModel,
      temperature: 0.1,
      max_tokens: 900,
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        {
          role: "user",
          content: [
            {
              type: "text",
              text: "请读取这张包装营养成分表，按约定 JSON 输出。注意 kJ 与 kcal、每 100g 与每份的区别。"
            },
            {
              type: "image_url",
              image_url: {
                url: `data:${image.mimetype};base64,${image.buffer.toString("base64")}`,
                detail: "high"
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
          ? "营养标签识别太频繁，请稍后再试"
          : "营养标签识别服务调用失败",
        "LABEL_UPSTREAM",
        { status: response.status, body: text.slice(0, 500) }
      );
    }

    const payload = (await response.json()) as {
      choices?: Array<{
        message?: { content?: string | Array<{ type?: string; text?: string }> };
      }>;
    };
    const rawContent = payload.choices?.[0]?.message?.content;
    const content = Array.isArray(rawContent)
      ? rawContent.map((part) => part.text ?? "").join("")
      : rawContent;
    if (!content) {
      throw new AppError(502, "营养标签没有识别出内容", "LABEL_EMPTY");
    }

    const parsed = parseModelJson(content) as Record<string, unknown>;
    const candidate = {
      ...parsed,
      productName:
        parsed.productName ?? parsed["产品名称"] ?? parsed.name ?? parsed["品名"],
      energyKj: parsed.energyKj ?? parsed["能量(kJ)"] ?? parsed["能量"],
      kcal: parsed.kcal ?? parsed["热量"] ?? parsed["能量(kcal)"],
      protein: parsed.protein ?? parsed["蛋白质"],
      carbs: parsed.carbs ?? parsed["碳水化合物"] ?? parsed["碳水"],
      fat: parsed.fat ?? parsed["脂肪"],
      fiber: parsed.fiber ?? parsed["膳食纤维"],
      sodium: parsed.sodium ?? parsed["钠"]
    };
    const result = outputSchema.safeParse(candidate);
    if (!result.success) {
      throw new AppError(
        502,
        "营养标签识别结果不完整",
        "LABEL_SCHEMA",
        result.error.issues
      );
    }
    return result.data;
  } catch (error) {
    if (error instanceof AppError) throw error;
    if (error instanceof Error && error.name === "AbortError") {
      throw new AppError(504, "营养标签识别超时，请换一张更清晰的照片", "LABEL_TIMEOUT");
    }
    throw new AppError(502, "营养标签识别连接失败", "LABEL_NETWORK");
  } finally {
    clearTimeout(timer);
  }
}

function clampNumber(value: number, max: number): number {
  return round(clamp(Number.isFinite(value) ? value : 0, 0, max), 1);
}

/**
 * 把模型读到的标签归一化成每 100g / 100ml 的营养值。
 * 标签按“每份”写时，用 servingSize 折算；只有 kJ 时按 4.184 换成 kcal。
 */
export function normalizeLabel(
  input: LabelOcrInput,
  imageUrl = "",
  engine = ""
): LabelResult {
  const servingSize =
    input.servingSize && input.servingSize > 0 ? input.servingSize : 100;
  const servingUnit =
    input.basis === "100ml" || input.servingUnit === "ml" ? "ml" : "g";
  const divisor = input.basis === "serving" ? servingSize / 100 : 1;
  const kcalValue =
    input.kcal !== undefined && input.kcal > 0
      ? input.kcal
      : input.energyKj
        ? input.energyKj / 4.184
        : 0;

  const per100g: NutritionFacts = {
    kcal: clampNumber(kcalValue / divisor, 900),
    protein: clampNumber(input.protein / divisor, 100),
    carbs: clampNumber(input.carbs / divisor, 100),
    fat: clampNumber(input.fat / divisor, 100),
    fiber: clampNumber((input.fiber ?? 0) / divisor, 100)
  };
  const basis =
    input.basis === "100ml" || (input.basis === "serving" && servingUnit === "ml")
      ? "100ml"
      : "100g";
  const confidence =
    input.confidence > 1 ? input.confidence / 100 : input.confidence;

  return {
    productName: (input.productName || "包装食品").trim().slice(0, 40),
    per100g,
    basis,
    servingSize,
    servingUnit,
    energyKj:
      input.energyKj !== undefined ? round(input.energyKj / divisor, 0) : null,
    sodium: input.sodium !== undefined ? round(input.sodium / divisor, 0) : null,
    confidence: Math.round(clamp(confidence, 0, 1) * 100) / 100,
    notice:
      input.notice?.trim() ||
      `数值来自包装标签，已按每 ${basis === "100ml" ? "100ml" : "100g"} 归一化；请核对单位和份量。`,
    imageUrl,
    engine
  };
}

export async function recognizeLabel(
  image: { buffer: Buffer; mimetype: string },
  config: AppConfig
): Promise<LabelResult> {
  if (!config.visionEnabled) {
    throw new AppError(
      501,
      "营养标签识别需要配置视觉模型",
      "VISION_REQUIRED"
    );
  }

  try {
    try {
      const parsed = await requestLabel(image, config, true);
      return normalizeLabel(parsed, "", config.visionModel);
    } catch (error) {
      const details = error instanceof AppError ? error.details : undefined;
      const status =
        details && typeof details === "object" && "status" in details
          ? Number((details as { status?: unknown }).status)
          : 0;
      // 部分兼容网关不支持 response_format，去掉后重试一次。
      if (status === 400 || status === 422) {
        const parsed = await requestLabel(image, config, false);
        return normalizeLabel(parsed, "", config.visionModel);
      }
      throw error;
    }
  } catch (error) {
    if (error instanceof AppError) throw error;
    throw new AppError(502, "营养标签识别失败，请稍后重试", "LABEL_ERROR");
  }
}
