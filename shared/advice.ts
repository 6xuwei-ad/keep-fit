import type { Advice, FoodItem, NutritionFacts, PlateQuality, Targets } from "./types.ts";
import { clamp, macroEnergy, round } from "./nutrition.ts";

function uniqueAdvice(list: Advice[]): Advice[] {
  const seen = new Set<string>();
  return list.filter((tip) => {
    if (seen.has(tip.kind)) return false;
    seen.add(tip.kind);
    return true;
  });
}

function qualityLabel(score: number): string {
  if (score >= 88) return "非常均衡";
  if (score >= 75) return "相当不错";
  if (score >= 60) return "还有提升空间";
  return "需要调整";
}

/**
 * 一餐的“餐盘质量”评分。不是医学指标，目的是把蛋白质、纤维、蔬菜多样性
 * 与脂肪占比转译成用户能理解的一个相对分数。
 */
export function buildPlateQuality(
  items: Array<Pick<FoodItem, "category" | "name"> & { nutrition: NutritionFacts }>,
  totals: NutritionFacts,
  targets: Targets
): PlateQuality {
  const mealKcalBudget = targets.kcal * 0.35;
  const proteinTarget = targets.protein * 0.35;
  const vegCount = items.filter(
    (item) => item.category === "vegetable" || item.category === "fruit"
  ).length;
  const proteinScore = clamp(totals.protein / Math.max(proteinTarget, 1), 0, 1) * 24;
  const fiberScore = clamp(totals.fiber / 7, 0, 1) * 16;
  const varietyScore = (Math.min(vegCount, 3) / 3) * 10;
  const energy = macroEnergy(totals);
  let score = 43 + proteinScore + fiberScore + varietyScore;
  if (energy.fat > 42) score -= 9;
  if (totals.kcal > mealKcalBudget * 1.55) score -= 8;
  if (totals.kcal < mealKcalBudget * 0.45) score -= 5;
  score = Math.round(clamp(score, 30, 98));

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

/** 规则式建议，保证无网络、无模型时也能给出稳定可解释的反馈。 */
export function buildMealAdvice(
  items: Array<Pick<FoodItem, "category" | "name"> & { nutrition: NutritionFacts }>,
  totals: NutritionFacts,
  targets: Targets
): Advice[] {
  const mealBudget = targets.kcal * 0.35;
  const proteinTarget = targets.protein * 0.35;
  const vegCount = items.filter((item) => item.category === "vegetable").length;
  const energy = macroEnergy(totals);
  const tips: Advice[] = [];

  if (totals.kcal > mealBudget * 1.35) {
    tips.push({
      kind: "portion",
      title: "这一餐份量偏大",
      body: `约 ${round(totals.kcal, 0)} kcal，比一餐建议量高 ${Math.round(
        ((totals.kcal - mealBudget) / mealBudget) * 100
      )}%。先吃到八分饱，主食留三分之一，通常就够。`
    });
  }

  if (totals.protein < proteinTarget * 0.72) {
    const gap = Math.max(0, Math.round(proteinTarget - totals.protein));
    tips.push({
      kind: "protein",
      title: "补一掌心蛋白质",
      body: `这一餐蛋白质约 ${round(totals.protein, 0)}g，还差约 ${gap}g。加 1 个鸡蛋、100g 希腊酸奶，或半块豆腐，饱腹感会更稳。`
    });
  }

  if (totals.fiber < 5 || vegCount === 0) {
    tips.push({
      kind: "fiber",
      title: "让餐盘多一点绿色",
      body:
        vegCount === 0
          ? "没有识别到蔬菜。下一餐加 200g 深色蔬菜（约两拳头），纤维和微量元素会更完整。"
          : `膳食纤维约 ${round(totals.fiber, 1)}g，略低于一餐目标。加一小份西兰花或菠菜，就能补上 3–5g。`
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

  return uniqueAdvice(tips).slice(0, 3);
}

/** 日记页的今日建议，根据当天累计摄入动态生成。 */
export function buildDailyAdvice(
  totals: NutritionFacts,
  targets: Targets,
  mealCount: number,
  caloriePercent: number
): Advice[] {
  const tips: Advice[] = [];
  const remainingKcal = Math.round(targets.kcal - totals.kcal);
  const remainingProtein = Math.round(targets.protein - totals.protein);
  const remainingFiber = Math.round(targets.fiber - totals.fiber);

  if (mealCount === 0) {
    return [
      {
        kind: "balance",
        title: "从第一张照片开始",
        body: "拍下接下来吃的一餐，食刻会帮你把食物拆开、按克数计算，再给出这一餐的调整方向。"
      },
      {
        kind: "protein",
        title: "今天优先吃够蛋白质",
        body: `目标 ${targets.protein}g。把蛋白质平均分到三餐，比晚餐一次补更容易吸收，也更抗饿。`
      },
      {
        kind: "fiber",
        title: "让蔬菜占到餐盘一半",
        body: "每天 300–500g 蔬菜、其中一半深色蔬菜，是简单又有效的饱腹策略。"
      }
    ];
  }

  if (remainingKcal < 0) {
    tips.push({
      kind: "portion",
      title: `今天超出约 ${Math.abs(remainingKcal)} kcal`,
      body: "偶尔一天不用自责。下一餐回到正常份量，优先选择蛋白质和蔬菜，不需要用跳餐来“抵消”。"
    });
  } else if (caloriePercent >= 80) {
    tips.push({
      kind: "portion",
      title: `今天还剩 ${remainingKcal} kcal`,
      body: "如果晚上容易饿，可以留一份 150–200 kcal 的加餐，例如无糖酸奶加蓝莓，比硬扛更可持续。"
    });
  } else {
    tips.push({
      kind: "balance",
      title: "热量节奏很从容",
      body: `已摄入 ${Math.round(caloriePercent)}%，还有 ${remainingKcal} kcal 的空间。下一餐把蛋白质和蔬菜吃够，不必刻意少吃。`
    });
  }

  if (remainingProtein > targets.protein * 0.25) {
    tips.push({
      kind: "protein",
      title: `蛋白质还差约 ${remainingProtein}g`,
      body: "晚餐可以安排一掌心鱼虾或鸡胸，再配一份豆制品；比只吃沙拉更不容易半夜饿。"
    });
  }

  if (remainingFiber > targets.fiber * 0.35) {
    tips.push({
      kind: "fiber",
      title: `纤维还差约 ${remainingFiber}g`,
      body: "用一份粗粮替换精米面，再加两拳头蔬菜，通常就能补足。水果选完整果实，不用果汁代替。"
    });
  }

  if (tips.length < 3) {
    tips.push({
      kind: "water",
      title: "别忽略喝水量",
      body: "成年人大约每天 1500–1700ml 饮水。把水杯放在手边，比等到口渴再喝更容易做到。"
    });
  }

  return uniqueAdvice(tips).slice(0, 3);
}
