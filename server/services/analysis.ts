import { randomUUID } from "node:crypto";
import type { AnalysisResult, Targets } from "../../shared/types.ts";
import { buildMealAdvice, buildPlateQuality } from "../../shared/advice.ts";
import { mergeItems, itemsTotal, makeFoodItem, type RawVisionItem } from "./items.ts";

export interface AssembleInput {
  dishName: string;
  imageUrl: string;
  provider: "vision" | "demo";
  engine: string;
  notice: string | null;
  items: RawVisionItem[];
}

export function assembleAnalysis(input: AssembleInput, targets: Targets): AnalysisResult {
  const items = mergeItems(
    input.items.slice(0, 12).map((item) =>
      makeFoodItem({
        name: item.name,
        grams: item.grams,
        confidence: item.confidence,
        category: item.category,
        per100g: item.per100g,
        portionHint: item.portionHint
      })
    )
  );

  if (items.length === 0) {
    throw new Error("没有识别到可分析的食物");
  }

  const totals = itemsTotal(items);
  const quality = buildPlateQuality(items, totals, targets);
  const advice = buildMealAdvice(items, totals, targets);

  return {
    id: randomUUID(),
    dishName: input.dishName.trim().slice(0, 40) || "这一餐",
    imageUrl: input.imageUrl,
    engine: input.engine,
    provider: input.provider,
    notice: input.notice,
    items,
    totals,
    quality,
    advice,
    createdAt: new Date().toISOString()
  };
}
