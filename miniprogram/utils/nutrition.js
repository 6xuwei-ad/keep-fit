const EMPTY = { kcal: 0, protein: 0, carbs: 0, fat: 0, fiber: 0 };

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function round(value, digits) {
  const factor = Math.pow(10, digits === undefined ? 1 : digits);
  return Math.round((Number(value) + Number.EPSILON) * factor) / factor;
}

function scale(per100g, grams) {
  const ratio = clamp(Number(grams) || 0, 0, 5000) / 100;
  return {
    kcal: round(per100g.kcal * ratio),
    protein: round(per100g.protein * ratio),
    carbs: round(per100g.carbs * ratio),
    fat: round(per100g.fat * ratio),
    fiber: round(per100g.fiber * ratio)
  };
}

function sum(items) {
  const total = { kcal: 0, protein: 0, carbs: 0, fat: 0, fiber: 0 };
  (items || []).forEach((item) => {
    const n = item.nutrition || EMPTY;
    total.kcal += Number(n.kcal) || 0;
    total.protein += Number(n.protein) || 0;
    total.carbs += Number(n.carbs) || 0;
    total.fat += Number(n.fat) || 0;
    total.fiber += Number(n.fiber) || 0;
  });
  return {
    kcal: round(total.kcal),
    protein: round(total.protein),
    carbs: round(total.carbs),
    fat: round(total.fat),
    fiber: round(total.fiber)
  };
}

function macroEnergy(nutrition) {
  const p = (nutrition.protein || 0) * 4;
  const c = (nutrition.carbs || 0) * 4;
  const f = (nutrition.fat || 0) * 9;
  const total = p + c + f;
  if (total <= 0) return { protein: 0, carbs: 0, fat: 0 };
  return {
    protein: Math.round((p / total) * 100),
    carbs: Math.round((c / total) * 100),
    fat: Math.round((f / total) * 100)
  };
}

function percent(value, target) {
  if (!target) return 0;
  return Math.round((value / target) * 100);
}

module.exports = {
  EMPTY,
  clamp,
  round,
  scale,
  sum,
  macroEnergy,
  percent
};
