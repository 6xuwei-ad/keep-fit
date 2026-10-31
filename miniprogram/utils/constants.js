const GOAL_TARGETS = {
  "fat-loss": { kcal: 1600, protein: 120, carbs: 160, fat: 50, fiber: 25 },
  maintain: { kcal: 1900, protein: 110, carbs: 210, fat: 60, fiber: 25 },
  muscle: { kcal: 2300, protein: 150, carbs: 260, fat: 65, fiber: 30 }
};

const GOAL_LABELS = {
  "fat-loss": "减脂",
  maintain: "维持",
  muscle: "增肌"
};

const MEAL_TYPES = ["breakfast", "lunch", "dinner", "snack"];

const MEAL_TYPE_LABELS = {
  breakfast: "早餐",
  lunch: "午餐",
  dinner: "晚餐",
  snack: "加餐"
};

const CATEGORY_LABELS = {
  protein: "优质蛋白",
  staple: "主食",
  vegetable: "蔬菜",
  fruit: "水果",
  dairy: "乳制品",
  fat: "油脂",
  dish: "菜肴",
  drink: "饮品",
  other: "其他"
};

const ADVICE_ICONS = {
  protein: "🥩",
  fiber: "🥬",
  portion: "⚖️",
  fat: "💧",
  balance: "✨",
  water: "🥤",
  timing: "⏱️"
};

module.exports = {
  GOAL_TARGETS,
  GOAL_LABELS,
  MEAL_TYPES,
  MEAL_TYPE_LABELS,
  CATEGORY_LABELS,
  ADVICE_ICONS
};
