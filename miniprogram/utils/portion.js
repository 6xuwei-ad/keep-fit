/**
 * 份量参照与剩饭折算。保持纯函数，方便页面复用和测试。
 */

const RATIO_OPTIONS = [
  { ratio: 1, label: "100%" },
  { ratio: 0.75, label: "75%" },
  { ratio: 0.5, label: "50%" },
  { ratio: 0.25, label: "25%" }
];

const CATEGORY_REFS = {
  protein: [{ label: "一掌心", grams: 100 }],
  staple: [{ label: "一拳头", grams: 100 }],
  vegetable: [{ label: "一把", grams: 100 }],
  fruit: [{ label: "一个拳头", grams: 150 }],
  dairy: [{ label: "一杯", grams: 200 }],
  fat: [{ label: "一勺", grams: 10 }],
  dish: [{ label: "一小份", grams: 150 }],
  drink: [{ label: "一杯", grams: 250 }],
  other: [{ label: "一小份", grams: 100 }]
};

function clampGrams(value) {
  return Math.max(1, Math.min(3000, Math.round(Number(value) || 0)));
}

function ratioOptions(selected) {
  return RATIO_OPTIONS.map((option) => ({
    ratio: option.ratio,
    label: option.label,
    active: option.ratio === selected
  }));
}

/** 从“半盒 · 150g”里提取份量标签与克数。 */
function parseHint(hint) {
  const text = String(hint || "").trim();
  const match = text.match(/(\d+(?:\.\d+)?)\s*g/i);
  if (!match) return null;
  const grams = clampGrams(Number(match[1]));
  if (!grams) return null;
  const label = text.split(/[·•]/)[0].trim();
  return { label: label || "参考份量", grams };
}

/**
 * 每种食物最多给 2 个可点击参照：
 * 优先用识别结果自带的份量提示，再用品类通用参照补足。
 */
function referencesFor(item) {
  const refs = [];
  const parsed = parseHint(item && item.portionHint);
  if (parsed) refs.push(parsed);

  const fallback = CATEGORY_REFS[(item && item.category) || "other"] || CATEGORY_REFS.other;
  for (let i = 0; i < fallback.length; i += 1) {
    const ref = fallback[i];
    if (refs.length >= 2) break;
    if (!refs.some((entry) => entry.grams === ref.grams)) refs.push(ref);
  }

  return refs.slice(0, 2);
}

/** 把整盘从“100% 的克数”折算到实际吃下的比例。 */
function applyRatio(items, ratio) {
  const safeRatio = Math.max(0.05, Math.min(1, Number(ratio) || 1));
  return (items || []).map((item) => {
    const baseGrams = Number(item.baseGrams) || Number(item.grams) || 1;
    return Object.assign({}, item, {
      baseGrams,
      grams: clampGrams(baseGrams * safeRatio)
    });
  });
}

/** 手动改克数时，反推出 100% 对应的克数，保证下次切比例不漂移。 */
function setGrams(item, grams, ratio) {
  const next = clampGrams(grams);
  const safeRatio = Math.max(0.05, Math.min(1, Number(ratio) || 1));
  return Object.assign({}, item, {
    grams: next,
    baseGrams: next / safeRatio
  });
}

module.exports = {
  RATIO_OPTIONS,
  ratioOptions,
  parseHint,
  referencesFor,
  applyRatio,
  setGrams
};
