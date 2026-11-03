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

export type Sex = "female" | "male";

export type ActivityLevel = "sedentary" | "light" | "moderate" | "active" | "very-active";

export type TargetsMode = "auto" | "manual";

export type MealType = "breakfast" | "lunch" | "dinner" | "snack";

export interface NutritionFacts {
  kcal: number;
  protein: number;
  carbs: number;
  fat: number;
  fiber: number;
}

export interface Targets extends NutritionFacts {}

export interface BodyProfile {
  sex: Sex | null;
  age: number | null;
  heightCm: number | null;
  weightKg: number | null;
  activityLevel: ActivityLevel | null;
}

export interface BodyMetrics {
  bmr: number;
  tdee: number;
}

export interface Profile extends BodyProfile {
  deviceId: string;
  name: string;
  goal: Goal;
  targets: Targets;
  targetsMode: TargetsMode;
  bmr: number | null;
  tdee: number | null;
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

/** 保存下来的一餐，用来在首页或日记里一键重记。 */
export interface MealTemplate {
  id: string;
  name: string;
  mealType: MealType;
  imageUrl: string | null;
  items: MealItemInput[];
  itemCount: number;
  totals: NutritionFacts;
  useCount: number;
  createdAt: string;
  lastUsedAt: string;
}

/** 昨天的某餐，首页可一键复制到今天。 */
export interface RepeatMeal {
  id: string;
  name: string;
  mealType: MealType;
  imageUrl: string | null;
  emoji: string;
  itemCount: number;
  totals: NutritionFacts;
}

export interface RepeatResponse {
  templates: MealTemplate[];
  yesterday: RepeatMeal[];
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
