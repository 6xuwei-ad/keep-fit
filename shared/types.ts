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

/** 一次体重记录，同一天只保留一条。 */
export interface WeightLog {
  id: string;
  date: string;
  weightKg: number;
  createdAt: string;
  updatedAt: string;
}

/** 一周（周一到周日）的平均体重。 */
export interface WeightWeek {
  weekStart: string;
  weekEnd: string;
  average: number;
  min: number;
  max: number;
  count: number;
}

/** 最近一次体重相对更早一条记录的变化。 */
export interface WeightChange {
  delta: number;
  fromWeight: number;
  toWeight: number;
  since: string;
  days: number;
}

export interface WeightTrendResponse {
  logs: WeightLog[];
  weeks: WeightWeek[];
  latest: WeightLog | null;
  latestWeek: WeightWeek | null;
  change: WeightChange | null;
  currentWeekStart: string;
  recordedThisWeek: boolean;
  profile: Profile;
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

export interface FoodPortion {
  label: string;
  grams: number;
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
  source: "database" | "ai" | "custom";
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

export interface CustomFood {
  id: string;
  name: string;
  emoji: string;
  category: FoodCategory;
  per100g: NutritionFacts;
  portions: FoodPortion[];
  createdAt: string;
  updatedAt: string;
}

export interface FoodCatalogItem {
  id: string;
  name: string;
  emoji: string;
  category: FoodCategory;
  per100g: NutritionFacts;
  portions: FoodPortion[];
  source?: "builtin" | "custom";
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

/** 周报里的一天：没有记录的日子也会占位，保证 7 根柱子对齐。 */
export interface WeekDay {
  date: string;
  weekday: number;
  label: string;
  shortLabel: string;
  recorded: boolean;
  isToday: boolean;
  isFuture: boolean;
  isWeekend: boolean;
  totals: NutritionFacts;
  mealCount: number;
  quality: number | null;
  calorieHit: boolean;
  proteinHit: boolean;
  caloriePercent: number;
}

/** 连续记录天数；今天还没记时从昨天开始算，避免白天显示断签。 */
export interface WeekStreak {
  current: number;
  longest: number;
  lastRecordedDate: string | null;
  activeToday: boolean;
}

/** 与上一自然周的对比，差值为 null 表示那一周没有可比较的记录。 */
export interface WeekComparison {
  weekStart: string;
  weekEnd: string;
  /** 本周还没过完时，只和上周同样的星期几对比，避免周一就显示“比上周少记 4 天”。 */
  partial: boolean;
  recordedDays: number;
  averageKcal: number | null;
  averageProtein: number | null;
  averageQuality: number | null;
  deltaRecordedDays: number;
  deltaKcal: number | null;
  deltaProtein: number | null;
  deltaQuality: number | null;
}

export interface WeekSummaryTip {
  title: string;
  body: string;
}

export interface WeekSummary {
  headline: string;
  body: string;
  tips: WeekSummaryTip[];
}

/** 周报只描述饮食记录，不包含体重和照片。 */
export interface WeeklyReport {
  weekStart: string;
  weekEnd: string;
  isCurrentWeek: boolean;
  today: string;
  days: WeekDay[];
  recordedDays: number;
  calorieHitDays: number;
  proteinHitDays: number;
  averageKcal: number | null;
  averageProtein: number | null;
  averageQuality: number | null;
  qualityLabel: string | null;
  streak: WeekStreak;
  comparison: WeekComparison;
  summary: WeekSummary;
  targets: Targets;
  canGoPrev: boolean;
  canGoNext: boolean;
  previousWeekStart: string | null;
  nextWeekStart: string | null;
}

/** 微信订阅消息的四种提醒，各自独立模板与授权。 */
export type ReminderKind = "lunch" | "dinner" | "weekly" | "streak";

export interface ReminderItem {
  kind: ReminderKind;
  label: string;
  description: string;
  time: string;
  timeLabel: string;
  enabled: boolean;
  /** 微信一次性订阅：每接受一次，服务端记一次可发送额度。 */
  remaining: number;
  lastSentAt: string | null;
  templateId: string;
  templateReady: boolean;
}

export interface ReminderCapability {
  wechatEnabled: boolean;
  templatesConfigured: boolean;
  canSend: boolean;
  reason: string;
  notice: string;
}

export interface RemindersResponse {
  capability: ReminderCapability;
  reminders: ReminderItem[];
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
