/**
 * 前后端共享领域模型。这里只放纯数据类型，避免把服务端实现带进浏览器包。
 */

export type FoodCategory =
  | "protein"
  | "staple"
  | "vegetable"
  | "fruit"
  | "dairy"
  | "fat"
  | "dish"
  | "drink"
  | "other";

export type Goal = "fat-loss" | "maintain" | "muscle";

export type MealType = "breakfast" | "lunch" | "dinner" | "snack";

export interface NutritionFacts {
  kcal: number;
  protein: number;
  carbs: number;
  fat: number;
  fiber: number;
}

export interface Targets extends NutritionFacts {}

export interface Profile {
  deviceId: string;
  name: string;
  goal: Goal;
  targets: Targets;
  createdAt: string;
  updatedAt: string;
}

export interface FoodItem {
  id: string;
  foodId: string | null;
  name: string;
  emoji: string;
  category: FoodCategory;
  grams: number;
  confidence: number;
  portionHint: string;
  per100g: NutritionFacts;
  nutrition: NutritionFacts;
  source: "database" | "ai";
}

export type AdviceKind =
  | "protein"
  | "fiber"
  | "portion"
  | "fat"
  | "balance"
  | "water"
  | "timing";

export interface Advice {
  kind: AdviceKind;
  title: string;
  body: string;
}

export interface PlateQuality {
  score: number;
  label: string;
  summary: string;
}

export interface AnalysisResult {
  id: string;
  dishName: string;
  imageUrl: string;
  engine: string;
  provider: "vision" | "demo";
  notice: string | null;
  items: FoodItem[];
  totals: NutritionFacts;
  quality: PlateQuality;
  advice: Advice[];
  createdAt: string;
}

export interface MealItemInput {
  foodId?: string | null;
  name: string;
  emoji?: string;
  category?: FoodCategory;
  grams: number;
  confidence?: number;
  portionHint?: string;
  per100g: NutritionFacts;
}

export interface FoodCatalogItem {
  id: string;
  name: string;
  emoji: string;
  category: FoodCategory;
  per100g: NutritionFacts;
  portions: Array<{ label: string; grams: number }>;
}

export interface AnalyzeResponse {
  analysis: AnalysisResult;
  suggestedMealType: MealType;
}

export interface DayResponse {
  profile: Profile;
  summary: DaySummary;
}

export interface CreateMealInput {
  name: string;
  mealType: MealType;
  date: string;
  eatenAt: string;
  imageUrl: string | null;
  engine: string;
  items: MealItemInput[];
}

export interface Meal extends Omit<CreateMealInput, "items"> {
  id: string;
  totals: NutritionFacts;
  items: FoodItem[];
  createdAt: string;
}

export interface DaySummary {
  date: string;
  meals: Meal[];
  totals: NutritionFacts;
  targets: Targets;
  remaining: NutritionFacts;
  caloriePercent: number;
  advice: Advice[];
}

export interface AppMeta {
  visionEnabled: boolean;
  demoAllowed: boolean;
  wechatEnabled: boolean;
  model: string;
  version: string;
}

export interface ApiErrorBody {
  error: string;
  code?: string;
  details?: unknown;
}
