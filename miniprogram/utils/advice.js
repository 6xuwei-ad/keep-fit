const nutrition = require("./nutrition");

function qualityLabel(score) {
  if (score >= 88) return "非常均衡";
  if (score >= 75) return "相当不错";
  if (score >= 60) return "还有提升空间";
  return "需要调整";
}

/**
 * 与 shared/advice.ts 保持同一套规则；修改时请两边同步。
 */
function plateQuality(items, totals, targets) {
  const mealKcalBudget = targets.kcal * 0.35;
  const proteinTarget = targets.protein * 0.35;
  const vegCount = (items || []).filter(
    (item) => item.category === "vegetable" || item.category === "fruit"
  ).length;
  const energy = nutrition.macroEnergy(totals);
  const proteinScore = Math.min(1, totals.protein / Math.max(proteinTarget, 1)) * 24;
  const fiberScore = Math.min(1, totals.fiber / 7) * 16;
  const varietyScore = (Math.min(vegCount, 3) / 3) * 10;

  let score = 43 + proteinScore + fiberScore + varietyScore;
  if (energy.fat > 42) score -= 9;
  if (totals.kcal > mealKcalBudget * 1.55) score -= 8;
  if (totals.kcal < mealKcalBudget * 0.45) score -= 5;
  score = Math.round(Math.min(98, Math.max(30, score)));

  let summary = "三大营养素搭配平稳，继续保持。";
  if (totals.protein < proteinTarget * 0.6) {
    summary = "蔬菜和主食有了，蛋白质还可以再补一点。";
  } else if (totals.fiber < 4) {
    summary = "蛋白质表现不错，膳食纤维稍显不足。";
  } else if (energy.fat > 42) {
    summary = "整体不错，但油脂提供的热量占比偏高。";
  } else if (vegCount === 0) {
    summary = "热量控制得可以，餐盘颜色还可以更丰富。";
  } else if (score >= 80) {
    summary = "蛋白质、纤维和蔬菜都在线，是一餐漂亮的组合。";
  }

  return { score, label: qualityLabel(score), summary };
}

function unique(tips) {
  const seen = {};
  return tips.filter((tip) => {
    if (seen[tip.kind]) return false;
    seen[tip.kind] = true;
    return true;
  });
}

function mealAdvice(items, totals, targets) {
  const mealBudget = targets.kcal * 0.35;
  const proteinTarget = targets.protein * 0.35;
  const vegCount = (items || []).filter((item) => item.category === "vegetable").length;
  const energy = nutrition.macroEnergy(totals);
  const tips = [];

  if (totals.kcal > mealBudget * 1.35) {
    tips.push({
      kind: "portion",
      title: "这一餐份量偏大",
      body: `约 ${Math.round(totals.kcal)} kcal，比一餐建议量高 ${Math.round(
        ((totals.kcal - mealBudget) / mealBudget) * 100
      )}%。先吃到八分饱，主食留三分之一，通常就够。`
    });
  }

  if (totals.protein < proteinTarget * 0.72) {
    tips.push({
      kind: "protein",
      title: "补一掌心蛋白质",
      body: `这一餐蛋白质约 ${Math.round(totals.protein)}g，还差约 ${Math.max(
        0,
        Math.round(proteinTarget - totals.protein)
      )}g。加 1 个鸡蛋、100g 希腊酸奶，或半块豆腐，饱腹感会更稳。`
    });
  }

  if (totals.fiber < 5 || vegCount === 0) {
    tips.push({
      kind: "fiber",
      title: "让餐盘多一点绿色",
      body:
        vegCount === 0
          ? "没有识别到蔬菜。下一餐加 200g 深色蔬菜（约两拳头），纤维和微量元素会更完整。"
          : `膳食纤维约 ${Math.round(totals.fiber)}g，略低于一餐目标。加一小份西兰花或菠菜，就能补上 3–5g。`
    });
  }

  if (energy.fat > 42) {
    tips.push({
      kind: "fat",
      title: "留意看不见的油",
      body: `脂肪提供了约 ${energy.fat}% 的热量。酱汁、煎炒用油往往是大头，下次可以少一勺油或改用清蒸、凉拌。`
    });
  }

  if (tips.length < 3 && totals.protein >= proteinTarget * 0.9 && totals.fiber >= 5) {
    tips.push({
      kind: "balance",
      title: "这餐搭配很稳",
      body: "蛋白质与纤维都达标，餐盘颜色也丰富。保持这个组合，比刻意少吃更容易长期坚持。"
    });
  }

  if (tips.length < 3) {
    tips.push({
      kind: "water",
      title: "配一杯无糖饮品",
      body: "随餐喝 300–500ml 水或无糖茶，既能帮助判断饱腹感，也能减少把口渴误当成饥饿。"
    });
  }

  if (tips.length < 3) {
    tips.push({
      kind: "timing",
      title: "慢一点，给饱腹感留时间",
      body: "从第一口到感觉饱，身体大约需要 15–20 分钟。放下筷子多咀嚼几次，往往能自然少吃 10%。"
    });
  }

  if (tips.length < 3) {
    tips.push({
      kind: "balance",
      title: "把这份餐盘记住",
      body: "主食、蛋白质和蔬菜都有出现，是值得复用的一餐组合。下次按同样比例搭配，不用重新计算。"
    });
  }

  return unique(tips).slice(0, 3);
}

module.exports = {
  plateQuality,
  mealAdvice
};
