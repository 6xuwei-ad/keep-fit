import type { FoodCategory } from "../../shared/types.ts";

export const DEMO_DISH = "香煎豆腐彩虹能量碗";

/** 演示餐盘与 public/images/demo-bowl.jpg 对应。 */
export const DEMO_ITEMS: Array<{
  name: string;
  foodId: string;
  grams: number;
  confidence: number;
  category: FoodCategory;
}> = [
  { name: "香煎豆腐", foodId: "silken-tofu", grams: 120, confidence: 0.91, category: "protein" },
  { name: "水煮蛋", foodId: "egg", grams: 95, confidence: 0.96, category: "protein" },
  { name: "甜玉米粒", foodId: "corn", grams: 65, confidence: 0.89, category: "staple" },
  { name: "圣女果", foodId: "tomato", grams: 55, confidence: 0.87, category: "vegetable" },
  { name: "紫甘蓝", foodId: "purple-cabbage", grams: 35, confidence: 0.82, category: "vegetable" },
  { name: "黄瓜", foodId: "cucumber", grams: 50, confidence: 0.84, category: "vegetable" },
  { name: "毛豆", foodId: "edamame", grams: 35, confidence: 0.78, category: "protein" },
  { name: "生菜", foodId: "lettuce", grams: 30, confidence: 0.8, category: "vegetable" }
];

export const DEMO_IMAGE_URL = "/images/demo-bowl.jpg";
