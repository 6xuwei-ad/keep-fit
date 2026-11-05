import type { FoodAlias } from "../store.ts";
import type { RawVisionItem } from "./items.ts";

/**
 * 用户确认过的叫法优先于模型原始名称。
 * 只做字符串归一化，不改变食物本身的营养值。
 */
export function normalizeAlias(value: string): string {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[（(].*?[）)]/g, "")
    .replace(/[\s·•\-—_/]/g, "")
    .replace(/[，,。.]/g, "");
}

export function applyAliases(items: RawVisionItem[], aliases: FoodAlias[]): RawVisionItem[] {
  if (aliases.length === 0) return items;
  const byAlias = new Map<string, FoodAlias>();
  for (const entry of aliases) {
    const key = normalizeAlias(entry.alias);
    // 列表按更新时间倒序，冲突时保留更新的一条。
    if (!byAlias.has(key)) byAlias.set(key, entry);
  }

  return items.map((item) => {
    const alias = byAlias.get(normalizeAlias(item.name));
    if (!alias) return item;
    return {
      ...item,
      name: alias.name,
      emoji: alias.emoji,
      category: alias.category,
      per100g: alias.per100g,
      portionHint: alias.portionHint || item.portionHint,
      foodId: alias.foodId,
      // 用户亲手确认过的食物，不再让模型置信度干扰判断。
      confidence: Math.max(item.confidence, 0.9)
    };
  });
}
