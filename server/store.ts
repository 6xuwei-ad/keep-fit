import { randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import type {
  ActivityLevel,
  BodyProfile,
  CreateMealInput,
  CustomFood,
  FoodCategory,
  FoodItem,
  Goal,
  Meal,
  MealItemInput,
  MealTemplate,
  MealType,
  NutritionFacts,
  Profile,
  ReminderKind,
  Sex,
  Targets,
  TargetsMode,
  WeightLog
} from "../shared/types.ts";
import { DEFAULT_TARGETS, round } from "../shared/nutrition.ts";
import { bodyMetrics, computeTargets, isBodyComplete } from "../shared/body.ts";

interface ProfileRow {
  device_id: string;
  name: string;
  goal: string;
  sex: string | null;
  age: number | null;
  height_cm: number | null;
  weight_kg: number | null;
  activity_level: string | null;
  targets_mode: string;
  target_kcal: number;
  target_protein: number;
  target_carbs: number;
  target_fat: number;
  target_fiber: number;
  created_at: string;
  updated_at: string;
}

interface MealRow {
  id: string;
  device_id: string;
  date: string;
  eaten_at: string;
  meal_type: string;
  name: string;
  image_url: string | null;
  engine: string;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  fiber: number;
  created_at: string;
}

interface ItemRow {
  id: string;
  food_id: string | null;
  name: string;
  emoji: string;
  category: string;
  grams: number;
  confidence: number;
  portion_hint: string;
  per100g_json: string;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  fiber: number;
  source: string;
}

interface TemplateRow {
  id: string;
  device_id: string;
  name: string;
  meal_type: string;
  image_url: string | null;
  items_json: string;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  fiber: number;
  use_count: number;
  created_at: string;
  updated_at: string;
  last_used_at: string;
}

interface WeightRow {
  id: string;
  device_id: string;
  date: string;
  weight_kg: number;
  created_at: string;
  updated_at: string;
}

interface CustomFoodRow {
  id: string;
  device_id: string;
  name: string;
  emoji: string;
  category: string;
  per100g_json: string;
  portions_json: string;
  created_at: string;
  updated_at: string;
}

interface AliasRow {
  device_id: string;
  alias: string;
  food_id: string | null;
  name: string;
  emoji: string;
  category: string;
  per100g_json: string;
  portion_hint: string;
  updated_at: string;
}

interface ReminderSettingsRow {
  device_id: string;
  lunch_enabled: number;
  dinner_enabled: number;
  weekly_enabled: number;
  streak_enabled: number;
  updated_at: string;
}

interface ReminderGrantRow {
  device_id: string;
  kind: string;
  remaining: number;
  last_sent_on: string | null;
  last_sent_at: string | null;
  last_accepted_at: string | null;
  last_attempt_on: string | null;
  last_attempt_at: string | null;
}

export interface ReminderSettings extends Record<ReminderKind, boolean> {
  deviceId: string;
  updatedAt: string;
}

export interface ReminderGrant {
  kind: ReminderKind;
  remaining: number;
  lastSentOn: string | null;
  lastSentAt: string | null;
  lastAcceptedAt: string | null;
  lastAttemptOn: string | null;
  lastAttemptAt: string | null;
}

/** 用户确认过的叫法 → 食物快照，用于下次识别时优先匹配。 */
export interface FoodAlias {
  alias: string;
  foodId: string | null;
  name: string;
  emoji: string;
  category: FoodCategory;
  per100g: NutritionFacts;
  portionHint: string;
}

export interface RecentFoodRecord {
  foodId: string | null;
  name: string;
  emoji: string;
  category: FoodCategory;
  per100g: NutritionFacts;
  lastEatenAt: string;
}

/** 周报用的按天汇总，不加载具体食物，减少查询量。 */
export interface DailyTotalsRow {
  date: string;
  mealCount: number;
  kcal: number;
  protein: number;
  carbs: number;
  fat: number;
  fiber: number;
}

function mapProfile(row: ProfileRow): Profile {
  const body: BodyProfile = {
    sex: (row.sex as Sex | null) ?? null,
    age: row.age ?? null,
    heightCm: row.height_cm ?? null,
    weightKg: row.weight_kg ?? null,
    activityLevel: (row.activity_level as ActivityLevel | null) ?? null
  };
  const metrics = isBodyComplete(body) ? bodyMetrics(body) : null;
  return {
    deviceId: row.device_id,
    name: row.name,
    goal: row.goal as Goal,
    ...body,
    targets: {
      kcal: row.target_kcal,
      protein: row.target_protein,
      carbs: row.target_carbs,
      fat: row.target_fat,
      fiber: row.target_fiber
    },
    targetsMode: row.targets_mode === "auto" ? "auto" : "manual",
    bmr: metrics?.bmr ?? null,
    tdee: metrics?.tdee ?? null,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function mapMeal(row: MealRow, items: FoodItem[]): Meal {
  return {
    id: row.id,
    date: row.date,
    eatenAt: row.eaten_at,
    mealType: row.meal_type as Meal["mealType"],
    name: row.name,
    imageUrl: row.image_url,
    engine: row.engine,
    totals: {
      kcal: row.calories,
      protein: row.protein,
      carbs: row.carbs,
      fat: row.fat,
      fiber: row.fiber
    },
    items,
    createdAt: row.created_at
  };
}

function mapItem(row: ItemRow): FoodItem {
  return {
    id: row.id,
    foodId: row.food_id,
    name: row.name,
    emoji: row.emoji,
    category: row.category as FoodCategory,
    grams: row.grams,
    confidence: row.confidence,
    portionHint: row.portion_hint,
    per100g: JSON.parse(row.per100g_json) as NutritionFacts,
    nutrition: {
      kcal: row.calories,
      protein: row.protein,
      carbs: row.carbs,
      fat: row.fat,
      fiber: row.fiber
    },
    source:
      row.source === "database" ? "database" : row.source === "custom" ? "custom" : "ai"
  };
}

function mapWeight(row: WeightRow): WeightLog {
  return {
    id: row.id,
    date: row.date,
    weightKg: row.weight_kg,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function mapCustomFood(row: CustomFoodRow): CustomFood {
  return {
    id: row.id,
    name: row.name,
    emoji: row.emoji,
    category: row.category as FoodCategory,
    per100g: JSON.parse(row.per100g_json) as NutritionFacts,
    portions: JSON.parse(row.portions_json) as CustomFood["portions"],
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function mapAlias(row: AliasRow): FoodAlias {
  return {
    alias: row.alias,
    foodId: row.food_id,
    name: row.name,
    emoji: row.emoji,
    category: row.category as FoodCategory,
    per100g: JSON.parse(row.per100g_json) as NutritionFacts,
    portionHint: row.portion_hint
  };
}

function mapReminderSettings(row: ReminderSettingsRow): ReminderSettings {
  return {
    deviceId: row.device_id,
    lunch: Boolean(row.lunch_enabled),
    dinner: Boolean(row.dinner_enabled),
    weekly: Boolean(row.weekly_enabled),
    streak: Boolean(row.streak_enabled),
    updatedAt: row.updated_at
  };
}

function mapReminderGrant(row: ReminderGrantRow): ReminderGrant {
  return {
    kind: row.kind as ReminderKind,
    remaining: Number(row.remaining),
    lastSentOn: row.last_sent_on,
    lastSentAt: row.last_sent_at,
    lastAcceptedAt: row.last_accepted_at,
    lastAttemptOn: row.last_attempt_on,
    lastAttemptAt: row.last_attempt_at
  };
}

function mapTemplate(row: TemplateRow): MealTemplate {
  const items = JSON.parse(row.items_json) as MealItemInput[];
  return {
    id: row.id,
    name: row.name,
    mealType: row.meal_type as MealType,
    imageUrl: row.image_url,
    items,
    itemCount: items.length,
    totals: {
      kcal: row.calories,
      protein: row.protein,
      carbs: row.carbs,
      fat: row.fat,
      fiber: row.fiber
    },
    useCount: row.use_count,
    createdAt: row.created_at,
    lastUsedAt: row.last_used_at
  };
}

export class Store {
  private readonly db: DatabaseSync;

  constructor(dbPath: string) {
    fs.mkdirSync(path.dirname(dbPath), { recursive: true });
    this.db = new DatabaseSync(dbPath);
    this.db.exec("PRAGMA journal_mode = WAL;");
    this.db.exec("PRAGMA foreign_keys = ON;");
    this.migrate();
  }

  private migrate(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS profiles (
        device_id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        goal TEXT NOT NULL,
        sex TEXT,
        age INTEGER,
        height_cm REAL,
        weight_kg REAL,
        activity_level TEXT,
        targets_mode TEXT NOT NULL DEFAULT 'manual',
        target_kcal REAL NOT NULL,
        target_protein REAL NOT NULL,
        target_carbs REAL NOT NULL,
        target_fat REAL NOT NULL,
        target_fiber REAL NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS meals (
        id TEXT PRIMARY KEY,
        device_id TEXT NOT NULL,
        date TEXT NOT NULL,
        eaten_at TEXT NOT NULL,
        meal_type TEXT NOT NULL,
        name TEXT NOT NULL,
        image_url TEXT,
        engine TEXT NOT NULL,
        calories REAL NOT NULL,
        protein REAL NOT NULL,
        carbs REAL NOT NULL,
        fat REAL NOT NULL,
        fiber REAL NOT NULL,
        created_at TEXT NOT NULL,
        FOREIGN KEY (device_id) REFERENCES profiles(device_id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS meal_items (
        id TEXT PRIMARY KEY,
        meal_id TEXT NOT NULL,
        food_id TEXT,
        name TEXT NOT NULL,
        emoji TEXT NOT NULL,
        category TEXT NOT NULL,
        grams REAL NOT NULL,
        confidence REAL NOT NULL,
        portion_hint TEXT NOT NULL,
        per100g_json TEXT NOT NULL,
        calories REAL NOT NULL,
        protein REAL NOT NULL,
        carbs REAL NOT NULL,
        fat REAL NOT NULL,
        fiber REAL NOT NULL,
        source TEXT NOT NULL,
        order_index INTEGER NOT NULL,
        FOREIGN KEY (meal_id) REFERENCES meals(id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS meal_templates (
        id TEXT PRIMARY KEY,
        device_id TEXT NOT NULL,
        name TEXT NOT NULL,
        meal_type TEXT NOT NULL,
        image_url TEXT,
        items_json TEXT NOT NULL,
        calories REAL NOT NULL,
        protein REAL NOT NULL,
        carbs REAL NOT NULL,
        fat REAL NOT NULL,
        fiber REAL NOT NULL,
        use_count INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        last_used_at TEXT NOT NULL,
        FOREIGN KEY (device_id) REFERENCES profiles(device_id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS weight_logs (
        id TEXT PRIMARY KEY,
        device_id TEXT NOT NULL,
        date TEXT NOT NULL,
        weight_kg REAL NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        FOREIGN KEY (device_id) REFERENCES profiles(device_id) ON DELETE CASCADE,
        UNIQUE (device_id, date)
      );

      CREATE TABLE IF NOT EXISTS custom_foods (
        id TEXT PRIMARY KEY,
        device_id TEXT NOT NULL,
        name TEXT NOT NULL,
        emoji TEXT NOT NULL,
        category TEXT NOT NULL,
        per100g_json TEXT NOT NULL,
        portions_json TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        FOREIGN KEY (device_id) REFERENCES profiles(device_id) ON DELETE CASCADE,
        UNIQUE (device_id, name)
      );

      CREATE TABLE IF NOT EXISTS food_aliases (
        device_id TEXT NOT NULL,
        alias TEXT NOT NULL,
        food_id TEXT,
        name TEXT NOT NULL,
        emoji TEXT NOT NULL,
        category TEXT NOT NULL,
        per100g_json TEXT NOT NULL,
        portion_hint TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        PRIMARY KEY (device_id, alias),
        FOREIGN KEY (device_id) REFERENCES profiles(device_id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS reminder_settings (
        device_id TEXT PRIMARY KEY,
        lunch_enabled INTEGER NOT NULL DEFAULT 0,
        dinner_enabled INTEGER NOT NULL DEFAULT 0,
        weekly_enabled INTEGER NOT NULL DEFAULT 0,
        streak_enabled INTEGER NOT NULL DEFAULT 0,
        updated_at TEXT NOT NULL,
        FOREIGN KEY (device_id) REFERENCES profiles(device_id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS reminder_grants (
        device_id TEXT NOT NULL,
        kind TEXT NOT NULL,
        remaining INTEGER NOT NULL DEFAULT 0,
        last_sent_on TEXT,
        last_sent_at TEXT,
        last_accepted_at TEXT,
        last_attempt_on TEXT,
        last_attempt_at TEXT,
        PRIMARY KEY (device_id, kind),
        FOREIGN KEY (device_id) REFERENCES profiles(device_id) ON DELETE CASCADE
      );

      CREATE INDEX IF NOT EXISTS idx_meals_device_date ON meals(device_id, date, eaten_at);
      CREATE INDEX IF NOT EXISTS idx_items_meal ON meal_items(meal_id, order_index);
      CREATE INDEX IF NOT EXISTS idx_items_food ON meal_items(food_id);
      CREATE INDEX IF NOT EXISTS idx_templates_device ON meal_templates(device_id, last_used_at);
      CREATE INDEX IF NOT EXISTS idx_weights_device_date ON weight_logs(device_id, date);
      CREATE INDEX IF NOT EXISTS idx_custom_foods_device ON custom_foods(device_id, updated_at);
      CREATE INDEX IF NOT EXISTS idx_aliases_device ON food_aliases(device_id, updated_at);
    `);

    // 老版本数据库没有身体数据字段，逐列补齐，保留已有目标值。
    this.addColumnIfMissing("profiles", "sex", "TEXT");
    this.addColumnIfMissing("profiles", "age", "INTEGER");
    this.addColumnIfMissing("profiles", "height_cm", "REAL");
    this.addColumnIfMissing("profiles", "weight_kg", "REAL");
    this.addColumnIfMissing("profiles", "activity_level", "TEXT");
    this.addColumnIfMissing("profiles", "targets_mode", "TEXT NOT NULL DEFAULT 'manual'");
  }

  private addColumnIfMissing(table: string, column: string, definition: string): void {
    const columns = this.db.prepare(`PRAGMA table_info(${table})`).all() as Array<{
      name: string;
    }>;
    if (!columns.some((entry) => entry.name === column)) {
      this.db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
    }
  }

  ensureProfile(deviceId: string): Profile {
    const existing = this.getProfile(deviceId);
    if (existing) return existing;

    const now = new Date().toISOString();
    this.db
      .prepare(
        `INSERT INTO profiles
          (device_id, name, goal, sex, age, height_cm, weight_kg, activity_level, targets_mode,
           target_kcal, target_protein, target_carbs, target_fat, target_fiber, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(device_id) DO NOTHING`
      )
      .run(
        deviceId,
        "食刻用户",
        "fat-loss",
        null,
        null,
        null,
        null,
        null,
        "manual",
        DEFAULT_TARGETS.kcal,
        DEFAULT_TARGETS.protein,
        DEFAULT_TARGETS.carbs,
        DEFAULT_TARGETS.fat,
        DEFAULT_TARGETS.fiber,
        now,
        now
      );
    return this.getProfile(deviceId)!;
  }

  getProfile(deviceId: string): Profile | null {
    const row = this.db.prepare("SELECT * FROM profiles WHERE device_id = ?").get(deviceId) as
      | ProfileRow
      | undefined;
    return row ? mapProfile(row) : null;
  }

  updateProfile(
    deviceId: string,
    patch: {
      name?: string;
      goal?: Goal;
      targets?: Targets;
      targetsMode?: TargetsMode;
      sex?: Sex | null;
      age?: number | null;
      heightCm?: number | null;
      weightKg?: number | null;
      activityLevel?: ActivityLevel | null;
    }
  ): Profile {
    this.ensureProfile(deviceId);
    const current = this.getProfile(deviceId)!;
    const targets = patch.targets ?? current.targets;
    this.db
      .prepare(
        `UPDATE profiles SET name = ?, goal = ?, sex = ?, age = ?, height_cm = ?,
         weight_kg = ?, activity_level = ?, targets_mode = ?, target_kcal = ?,
         target_protein = ?, target_carbs = ?, target_fat = ?, target_fiber = ?, updated_at = ?
         WHERE device_id = ?`
      )
      .run(
        patch.name ?? current.name,
        patch.goal ?? current.goal,
        patch.sex !== undefined ? patch.sex : current.sex,
        patch.age !== undefined ? patch.age : current.age,
        patch.heightCm !== undefined ? patch.heightCm : current.heightCm,
        patch.weightKg !== undefined
          ? patch.weightKg === null
            ? null
            : round(patch.weightKg, 1)
          : current.weightKg,
        patch.activityLevel !== undefined ? patch.activityLevel : current.activityLevel,
        patch.targetsMode ?? current.targetsMode,
        round(targets.kcal, 0),
        round(targets.protein, 0),
        round(targets.carbs, 0),
        round(targets.fat, 0),
        round(targets.fiber, 0),
        new Date().toISOString(),
        deviceId
      );
    return this.getProfile(deviceId)!;
  }

  insertMeal(deviceId: string, input: CreateMealInput, items: FoodItem[], totals: NutritionFacts): Meal {
    this.ensureProfile(deviceId);
    const id = randomUUID();
    const now = new Date().toISOString();

    this.db.exec("BEGIN IMMEDIATE;");
    try {
      this.db
        .prepare(
          `INSERT INTO meals
            (id, device_id, date, eaten_at, meal_type, name, image_url, engine,
             calories, protein, carbs, fat, fiber, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        )
        .run(
          id,
          deviceId,
          input.date,
          input.eatenAt,
          input.mealType,
          input.name,
          input.imageUrl,
          input.engine,
          totals.kcal,
          totals.protein,
          totals.carbs,
          totals.fat,
          totals.fiber,
          now
        );

      const insertItem = this.db.prepare(
        `INSERT INTO meal_items
          (id, meal_id, food_id, name, emoji, category, grams, confidence, portion_hint,
           per100g_json, calories, protein, carbs, fat, fiber, source, order_index)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      );

      items.forEach((item, index) => {
        insertItem.run(
          item.id || randomUUID(),
          id,
          item.foodId,
          item.name,
          item.emoji,
          item.category,
          item.grams,
          item.confidence,
          item.portionHint,
          JSON.stringify(item.per100g),
          item.nutrition.kcal,
          item.nutrition.protein,
          item.nutrition.carbs,
          item.nutrition.fat,
          item.nutrition.fiber,
          item.source,
          index
        );
      });

      this.db.exec("COMMIT;");
    } catch (error) {
      this.db.exec("ROLLBACK;");
      throw error;
    }

    const meal = this.getMeal(deviceId, id);
    if (!meal) throw new Error("保存饮食记录失败");
    return meal;
  }

  getMeal(deviceId: string, id: string): Meal | null {
    const row = this.db
      .prepare("SELECT * FROM meals WHERE device_id = ? AND id = ?")
      .get(deviceId, id) as MealRow | undefined;
    if (!row) return null;
    const itemRows = this.db
      .prepare("SELECT * FROM meal_items WHERE meal_id = ? ORDER BY order_index ASC")
      .all(id) as unknown as ItemRow[];
    return mapMeal(row, itemRows.map(mapItem));
  }

  listMeals(deviceId: string, date: string): Meal[] {
    const rows = this.db
      .prepare("SELECT * FROM meals WHERE device_id = ? AND date = ? ORDER BY eaten_at ASC")
      .all(deviceId, date) as unknown as MealRow[];
    if (rows.length === 0) return [];
    const items = this.db
      .prepare(
        `SELECT mi.* FROM meal_items mi
         JOIN meals m ON m.id = mi.meal_id
         WHERE m.device_id = ? AND m.date = ?
         ORDER BY mi.order_index ASC`
      )
      .all(deviceId, date) as unknown as Array<ItemRow & { meal_id: string }>;

    const byMeal = new Map<string, FoodItem[]>();
    for (const item of items) {
      const list = byMeal.get(item.meal_id) ?? [];
      list.push(mapItem(item));
      byMeal.set(item.meal_id, list);
    }
    return rows.map((row) => mapMeal(row, byMeal.get(row.id) ?? []));
  }

  /** 周报只需要每天的总量，不加载具体食物。 */
  listDailyTotals(deviceId: string, start: string, end: string): DailyTotalsRow[] {
    const rows = this.db
      .prepare(
        `SELECT date,
                COUNT(*) AS meal_count,
                COALESCE(SUM(calories), 0) AS kcal,
                COALESCE(SUM(protein), 0) AS protein,
                COALESCE(SUM(carbs), 0) AS carbs,
                COALESCE(SUM(fat), 0) AS fat,
                COALESCE(SUM(fiber), 0) AS fiber
         FROM meals
         WHERE device_id = ? AND date >= ? AND date <= ?
         GROUP BY date
         ORDER BY date ASC`
      )
      .all(deviceId, start, end) as unknown as Array<{
      date: string;
      meal_count: number;
      kcal: number;
      protein: number;
      carbs: number;
      fat: number;
      fiber: number;
    }>;

    return rows.map((row) => ({
      date: row.date,
      mealCount: Number(row.meal_count),
      kcal: Number(row.kcal),
      protein: Number(row.protein),
      carbs: Number(row.carbs),
      fat: Number(row.fat),
      fiber: Number(row.fiber)
    }));
  }

  /** 一次性取出某个日期区间的餐次和食材，用于周报的餐盘质量。 */
  listMealsRange(deviceId: string, start: string, end: string): Meal[] {
    const rows = this.db
      .prepare(
        `SELECT * FROM meals
         WHERE device_id = ? AND date >= ? AND date <= ?
         ORDER BY date ASC, eaten_at ASC`
      )
      .all(deviceId, start, end) as unknown as MealRow[];
    if (rows.length === 0) return [];

    const items = this.db
      .prepare(
        `SELECT mi.*, m.id AS meal_id
         FROM meal_items mi
         JOIN meals m ON m.id = mi.meal_id
         WHERE m.device_id = ? AND m.date >= ? AND m.date <= ?
         ORDER BY m.date ASC, m.eaten_at ASC, mi.order_index ASC`
      )
      .all(deviceId, start, end) as unknown as Array<ItemRow & { meal_id: string }>;

    const byMeal = new Map<string, FoodItem[]>();
    for (const item of items) {
      const list = byMeal.get(item.meal_id) ?? [];
      list.push(mapItem(item));
      byMeal.set(item.meal_id, list);
    }
    return rows.map((row) => mapMeal(row, byMeal.get(row.id) ?? []));
  }

  /** 按日期倒序返回有记录的日期，用于连续记录。 */
  listRecordedDates(deviceId: string, limit = 400): string[] {
    const rows = this.db
      .prepare(
        `SELECT date FROM meals
         WHERE device_id = ?
         GROUP BY date
         ORDER BY date DESC
         LIMIT ?`
      )
      .all(deviceId, limit) as unknown as Array<{ date: string }>;
    return rows.map((row) => row.date);
  }

  getEarliestMealDate(deviceId: string): string | null {
    const row = this.db
      .prepare("SELECT MIN(date) AS date FROM meals WHERE device_id = ?")
      .get(deviceId) as { date: string | null } | undefined;
    return row?.date ?? null;
  }

  deleteMeal(deviceId: string, id: string): boolean {
    const result = this.db
      .prepare("DELETE FROM meals WHERE device_id = ? AND id = ?")
      .run(deviceId, id);
    return Number(result.changes) > 0;
  }

  countTemplates(deviceId: string): number {
    const row = this.db
      .prepare("SELECT COUNT(*) AS count FROM meal_templates WHERE device_id = ?")
      .get(deviceId) as { count: number } | undefined;
    return Number(row?.count ?? 0);
  }

  listTemplates(deviceId: string, limit = 12): MealTemplate[] {
    const rows = this.db
      .prepare(
        `SELECT * FROM meal_templates WHERE device_id = ?
         ORDER BY last_used_at DESC, created_at DESC LIMIT ?`
      )
      .all(deviceId, limit) as unknown as TemplateRow[];
    return rows.map(mapTemplate);
  }

  getTemplate(deviceId: string, id: string): MealTemplate | null {
    const row = this.db
      .prepare("SELECT * FROM meal_templates WHERE device_id = ? AND id = ?")
      .get(deviceId, id) as TemplateRow | undefined;
    return row ? mapTemplate(row) : null;
  }

  /**
   * 同名、同餐次的常用餐只保留一份，重复保存视为更新，
   * 避免用户反复点“存为常用餐”产生一堆重复模板。
   */
  upsertTemplate(
    deviceId: string,
    input: {
      name: string;
      mealType: MealType;
      imageUrl: string | null;
      items: MealItemInput[];
      totals: NutritionFacts;
    }
  ): { template: MealTemplate; created: boolean } {
    this.ensureProfile(deviceId);
    const itemsJson = JSON.stringify(input.items);
    const now = new Date().toISOString();
    const existing = this.db
      .prepare(
        "SELECT * FROM meal_templates WHERE device_id = ? AND meal_type = ? AND name = ?"
      )
      .get(deviceId, input.mealType, input.name) as TemplateRow | undefined;

    if (existing) {
      this.db
        .prepare(
          `UPDATE meal_templates
           SET image_url = ?, items_json = ?, calories = ?, protein = ?, carbs = ?,
               fat = ?, fiber = ?, updated_at = ?
           WHERE device_id = ? AND id = ?`
        )
        .run(
          input.imageUrl,
          itemsJson,
          input.totals.kcal,
          input.totals.protein,
          input.totals.carbs,
          input.totals.fat,
          input.totals.fiber,
          now,
          deviceId,
          existing.id
        );
      return { template: this.getTemplate(deviceId, existing.id)!, created: false };
    }

    // 每个身份最多保留 50 个常用餐，优先淘汰从未使用、最久未打开的。
    const total = this.countTemplates(deviceId);
    if (total >= 50) {
      const stale = this.db
        .prepare(
          `SELECT id FROM meal_templates WHERE device_id = ?
           ORDER BY use_count ASC, last_used_at ASC LIMIT ?`
        )
        .all(deviceId, total - 49) as unknown as Array<{ id: string }>;
      const remove = this.db.prepare(
        "DELETE FROM meal_templates WHERE device_id = ? AND id = ?"
      );
      for (const entry of stale) remove.run(deviceId, entry.id);
    }

    const id = randomUUID();
    this.db
      .prepare(
        `INSERT INTO meal_templates
          (id, device_id, name, meal_type, image_url, items_json, calories, protein,
           carbs, fat, fiber, use_count, created_at, updated_at, last_used_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?)`
      )
      .run(
        id,
        deviceId,
        input.name,
        input.mealType,
        input.imageUrl,
        itemsJson,
        input.totals.kcal,
        input.totals.protein,
        input.totals.carbs,
        input.totals.fat,
        input.totals.fiber,
        now,
        now,
        now
      );

    return { template: this.getTemplate(deviceId, id)!, created: true };
  }

  touchTemplate(deviceId: string, id: string): void {
    const now = new Date().toISOString();
    this.db
      .prepare(
        `UPDATE meal_templates
         SET use_count = use_count + 1, last_used_at = ?, updated_at = ?
         WHERE device_id = ? AND id = ?`
      )
      .run(now, now, deviceId, id);
  }

  deleteTemplate(deviceId: string, id: string): boolean {
    const result = this.db
      .prepare("DELETE FROM meal_templates WHERE device_id = ? AND id = ?")
      .run(deviceId, id);
    return Number(result.changes) > 0;
  }

  /** 按日期升序返回，方便直接画折线；只保留最近 limit 条。 */
  listWeightLogs(deviceId: string, limit = 180): WeightLog[] {
    const rows = this.db
      .prepare(
        `SELECT * FROM (
           SELECT * FROM weight_logs WHERE device_id = ? ORDER BY date DESC LIMIT ?
         ) ORDER BY date ASC`
      )
      .all(deviceId, limit) as unknown as WeightRow[];
    return rows.map(mapWeight);
  }

  getLatestWeightLog(deviceId: string): WeightLog | null {
    const row = this.db
      .prepare(
        `SELECT * FROM weight_logs WHERE device_id = ?
         ORDER BY date DESC, updated_at DESC LIMIT 1`
      )
      .get(deviceId) as WeightRow | undefined;
    return row ? mapWeight(row) : null;
  }

  /** 同一天重复记录视为修正，不新增第二条。 */
  upsertWeightLog(
    deviceId: string,
    input: { date: string; weightKg: number }
  ): { log: WeightLog; created: boolean } {
    this.ensureProfile(deviceId);
    const now = new Date().toISOString();
    const existing = this.db
      .prepare("SELECT * FROM weight_logs WHERE device_id = ? AND date = ?")
      .get(deviceId, input.date) as WeightRow | undefined;

    if (existing) {
      this.db
        .prepare(
          "UPDATE weight_logs SET weight_kg = ?, updated_at = ? WHERE device_id = ? AND id = ?"
        )
        .run(input.weightKg, now, deviceId, existing.id);
      return { log: this.getWeightLog(deviceId, existing.id)!, created: false };
    }

    const id = randomUUID();
    this.db
      .prepare(
        `INSERT INTO weight_logs (id, device_id, date, weight_kg, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?)`
      )
      .run(id, deviceId, input.date, input.weightKg, now, now);
    return { log: this.getWeightLog(deviceId, id)!, created: true };
  }

  getWeightLog(deviceId: string, id: string): WeightLog | null {
    const row = this.db
      .prepare("SELECT * FROM weight_logs WHERE device_id = ? AND id = ?")
      .get(deviceId, id) as WeightRow | undefined;
    return row ? mapWeight(row) : null;
  }

  deleteWeightLog(deviceId: string, id: string): boolean {
    const result = this.db
      .prepare("DELETE FROM weight_logs WHERE device_id = ? AND id = ?")
      .run(deviceId, id);
    return Number(result.changes) > 0;
  }

  /**
   * 把档案里的体重同步到最近一条体重记录，并在自动模式下重算目标。
   * 回填旧日期时，档案仍以最新一条记录为准。
   */
  syncWeightToProfile(deviceId: string): { profile: Profile; targetsUpdated: boolean } {
    const current = this.ensureProfile(deviceId);
    const latest = this.getLatestWeightLog(deviceId);
    if (!latest) return { profile: current, targetsUpdated: false };
    if (current.weightKg !== null && Math.abs(current.weightKg - latest.weightKg) < 0.001) {
      return { profile: current, targetsUpdated: false };
    }

    const body: BodyProfile = {
      sex: current.sex,
      age: current.age,
      heightCm: current.heightCm,
      weightKg: latest.weightKg,
      activityLevel: current.activityLevel
    };
    const auto = current.targetsMode === "auto" && isBodyComplete(body);
    const targets = auto ? computeTargets(body, current.goal).targets : undefined;
    const profile = this.updateProfile(deviceId, {
      weightKg: latest.weightKg,
      ...(targets ? { targets } : {})
    });
    return { profile, targetsUpdated: auto };
  }

  getReminderSettings(deviceId: string): ReminderSettings {
    this.ensureProfile(deviceId);
    const existing = this.db
      .prepare("SELECT * FROM reminder_settings WHERE device_id = ?")
      .get(deviceId) as ReminderSettingsRow | undefined;
    if (existing) return mapReminderSettings(existing);

    this.db
      .prepare(
        `INSERT INTO reminder_settings
          (device_id, lunch_enabled, dinner_enabled, weekly_enabled, streak_enabled, updated_at)
         VALUES (?, 0, 0, 0, 0, ?)
         ON CONFLICT(device_id) DO NOTHING`
      )
      .run(deviceId, new Date().toISOString());
    return mapReminderSettings(
      this.db
        .prepare("SELECT * FROM reminder_settings WHERE device_id = ?")
        .get(deviceId) as unknown as ReminderSettingsRow
    );
  }

  updateReminderSettings(
    deviceId: string,
    patch: Partial<Record<ReminderKind, boolean>>
  ): ReminderSettings {
    const current = this.getReminderSettings(deviceId);
    const next = { ...current, ...patch };
    this.db
      .prepare(
        `UPDATE reminder_settings
         SET lunch_enabled = ?, dinner_enabled = ?, weekly_enabled = ?, streak_enabled = ?,
             updated_at = ?
         WHERE device_id = ?`
      )
      .run(
        next.lunch ? 1 : 0,
        next.dinner ? 1 : 0,
        next.weekly ? 1 : 0,
        next.streak ? 1 : 0,
        new Date().toISOString(),
        deviceId
      );
    return this.getReminderSettings(deviceId);
  }

  /** 定时任务只遍历至少开启一种提醒的身份。 */
  listReminderDevices(): Array<{ deviceId: string; settings: ReminderSettings }> {
    const rows = this.db
      .prepare(
        `SELECT * FROM reminder_settings
         WHERE lunch_enabled = 1 OR dinner_enabled = 1
            OR weekly_enabled = 1 OR streak_enabled = 1`
      )
      .all() as unknown as ReminderSettingsRow[];
    return rows.map((row) => ({
      deviceId: row.device_id,
      settings: mapReminderSettings(row)
    }));
  }

  listReminderGrants(deviceId: string): ReminderGrant[] {
    const rows = this.db
      .prepare("SELECT * FROM reminder_grants WHERE device_id = ?")
      .all(deviceId) as unknown as ReminderGrantRow[];
    return rows.map(mapReminderGrant);
  }

  getReminderGrant(deviceId: string, kind: ReminderKind): ReminderGrant | null {
    const row = this.db
      .prepare("SELECT * FROM reminder_grants WHERE device_id = ? AND kind = ?")
      .get(deviceId, kind) as ReminderGrantRow | undefined;
    return row ? mapReminderGrant(row) : null;
  }

  /**
   * 微信一次性订阅：用户接受一次，服务端记一次可发送额度。
   * 最多累计 5 次，避免用户反复点击把额度堆得过高。
   */
  grantReminder(deviceId: string, kind: ReminderKind): ReminderGrant {
    this.ensureProfile(deviceId);
    const existing = this.getReminderGrant(deviceId, kind);
    const remaining = Math.min((existing?.remaining ?? 0) + 1, 5);
    const now = new Date().toISOString();
    this.db
      .prepare(
        `INSERT INTO reminder_grants
          (device_id, kind, remaining, last_accepted_at)
         VALUES (?, ?, ?, ?)
         ON CONFLICT(device_id, kind) DO UPDATE SET
           remaining = excluded.remaining,
           last_accepted_at = excluded.last_accepted_at`
      )
      .run(deviceId, kind, remaining, now);
    return this.getReminderGrant(deviceId, kind)!;
  }

  /** 发送成功后扣一次额度，并记录发送日期，保证同一种提醒一天最多一次。 */
  consumeReminderGrant(deviceId: string, kind: ReminderKind, date: string): void {
    const now = new Date().toISOString();
    this.db
      .prepare(
        `UPDATE reminder_grants
         SET remaining = CASE WHEN remaining > 0 THEN remaining - 1 ELSE 0 END,
             last_sent_on = ?, last_sent_at = ?, last_attempt_on = ?, last_attempt_at = ?
         WHERE device_id = ? AND kind = ?`
      )
      .run(date, now, date, now, deviceId, kind);
  }

  /** 发送失败也记一次尝试，避免同一分钟窗口里反复请求微信接口。 */
  markReminderAttempt(deviceId: string, kind: ReminderKind, date: string): void {
    const now = new Date().toISOString();
    this.db
      .prepare(
        `UPDATE reminder_grants
         SET last_attempt_on = ?, last_attempt_at = ?
         WHERE device_id = ? AND kind = ?`
      )
      .run(date, now, deviceId, kind);
  }

  /** 用户拒绝或授权失效时清空额度，避免一直重试。 */
  clearReminderGrant(deviceId: string, kind: ReminderKind, date: string): void {
    const now = new Date().toISOString();
    this.db
      .prepare(
        `UPDATE reminder_grants
         SET remaining = 0, last_attempt_on = ?, last_attempt_at = ?
         WHERE device_id = ? AND kind = ?`
      )
      .run(date, now, deviceId, kind);
  }

  /** 最近吃过的食物，按食物去重，用于食物搜索的快捷入口。 */
  listRecentFoods(deviceId: string, limit = 20): RecentFoodRecord[] {
    const rows = this.db
      .prepare(
        `SELECT mi.food_id, mi.name, mi.emoji, mi.category, mi.per100g_json,
                MAX(m.eaten_at) AS last_eaten
         FROM meal_items mi
         JOIN meals m ON m.id = mi.meal_id
         WHERE m.device_id = ?
         GROUP BY COALESCE(mi.food_id, mi.name)
         ORDER BY last_eaten DESC
         LIMIT ?`
      )
      .all(deviceId, limit) as unknown as Array<{
      food_id: string | null;
      name: string;
      emoji: string;
      category: string;
      per100g_json: string;
      last_eaten: string;
    }>;

    return rows.map((row) => ({
      foodId: row.food_id,
      name: row.name,
      emoji: row.emoji,
      category: row.category as FoodCategory,
      per100g: JSON.parse(row.per100g_json) as NutritionFacts,
      lastEatenAt: row.last_eaten
    }));
  }

  listCustomFoods(deviceId: string, limit = 100): CustomFood[] {
    const rows = this.db
      .prepare(
        `SELECT * FROM custom_foods WHERE device_id = ?
         ORDER BY updated_at DESC, name ASC LIMIT ?`
      )
      .all(deviceId, limit) as unknown as CustomFoodRow[];
    return rows.map(mapCustomFood);
  }

  getCustomFood(deviceId: string, id: string): CustomFood | null {
    const row = this.db
      .prepare("SELECT * FROM custom_foods WHERE device_id = ? AND id = ?")
      .get(deviceId, id) as CustomFoodRow | undefined;
    return row ? mapCustomFood(row) : null;
  }

  findCustomFoodByName(deviceId: string, name: string): CustomFood | null {
    const row = this.db
      .prepare("SELECT * FROM custom_foods WHERE device_id = ? AND name = ?")
      .get(deviceId, name) as CustomFoodRow | undefined;
    return row ? mapCustomFood(row) : null;
  }

  createCustomFood(
    deviceId: string,
    input: {
      name: string;
      emoji: string;
      category: FoodCategory;
      per100g: NutritionFacts;
      portions: CustomFood["portions"];
    }
  ): CustomFood {
    this.ensureProfile(deviceId);
    const id = `custom_${randomUUID()}`;
    const now = new Date().toISOString();
    this.db
      .prepare(
        `INSERT INTO custom_foods
          (id, device_id, name, emoji, category, per100g_json, portions_json, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        id,
        deviceId,
        input.name,
        input.emoji,
        input.category,
        JSON.stringify(input.per100g),
        JSON.stringify(input.portions),
        now,
        now
      );
    return this.getCustomFood(deviceId, id)!;
  }

  updateCustomFood(
    deviceId: string,
    id: string,
    input: {
      name: string;
      emoji: string;
      category: FoodCategory;
      per100g: NutritionFacts;
      portions: CustomFood["portions"];
    }
  ): CustomFood | null {
    const result = this.db
      .prepare(
        `UPDATE custom_foods
         SET name = ?, emoji = ?, category = ?, per100g_json = ?, portions_json = ?,
             updated_at = ?
         WHERE device_id = ? AND id = ?`
      )
      .run(
        input.name,
        input.emoji,
        input.category,
        JSON.stringify(input.per100g),
        JSON.stringify(input.portions),
        new Date().toISOString(),
        deviceId,
        id
      );
    if (Number(result.changes) === 0) return null;

    // 改自定义食物时，把指向它的别名快照一起刷新。
    const firstPortion = input.portions[0];
    this.db
      .prepare(
        `UPDATE food_aliases
         SET name = ?, emoji = ?, category = ?, per100g_json = ?, portion_hint = ?,
             updated_at = ?
         WHERE device_id = ? AND food_id = ?`
      )
      .run(
        input.name,
        input.emoji,
        input.category,
        JSON.stringify(input.per100g),
        firstPortion ? `${firstPortion.label} · ${firstPortion.grams}g` : "",
        new Date().toISOString(),
        deviceId,
        id
      );

    return this.getCustomFood(deviceId, id);
  }

  deleteCustomFood(deviceId: string, id: string): boolean {
    const result = this.db
      .prepare("DELETE FROM custom_foods WHERE device_id = ? AND id = ?")
      .run(deviceId, id);
    return Number(result.changes) > 0;
  }

  listAliases(deviceId: string, limit = 200): FoodAlias[] {
    const rows = this.db
      .prepare(
        `SELECT * FROM food_aliases WHERE device_id = ?
         ORDER BY updated_at DESC LIMIT ?`
      )
      .all(deviceId, limit) as unknown as AliasRow[];
    return rows.map(mapAlias);
  }

  upsertAlias(deviceId: string, input: FoodAlias): FoodAlias {
    this.ensureProfile(deviceId);
    const alias = input.alias
      .trim()
      .toLowerCase()
      .replace(/[（(].*?[）)]/g, "")
      .replace(/[\s·•\-—_/]/g, "")
      .replace(/[，,。.]/g, "");
    const now = new Date().toISOString();
    const existing = this.db
      .prepare("SELECT 1 FROM food_aliases WHERE device_id = ? AND alias = ?")
      .get(deviceId, alias);
    if (!existing) {
      const row = this.db
        .prepare("SELECT COUNT(*) AS count FROM food_aliases WHERE device_id = ?")
        .get(deviceId) as { count: number } | undefined;
      if (Number(row?.count ?? 0) >= 200) {
        const stale = this.db
          .prepare(
            `SELECT alias FROM food_aliases WHERE device_id = ?
             ORDER BY updated_at ASC LIMIT ?`
          )
          .all(deviceId, Number(row?.count ?? 0) - 199) as unknown as Array<{
          alias: string;
        }>;
        const remove = this.db.prepare(
          "DELETE FROM food_aliases WHERE device_id = ? AND alias = ?"
        );
        for (const entry of stale) remove.run(deviceId, entry.alias);
      }
    }

    this.db
      .prepare(
        `INSERT INTO food_aliases
          (device_id, alias, food_id, name, emoji, category, per100g_json, portion_hint, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(device_id, alias) DO UPDATE SET
           food_id = excluded.food_id,
           name = excluded.name,
           emoji = excluded.emoji,
           category = excluded.category,
           per100g_json = excluded.per100g_json,
           portion_hint = excluded.portion_hint,
           updated_at = excluded.updated_at`
      )
      .run(
        deviceId,
        alias,
        input.foodId,
        input.name,
        input.emoji,
        input.category,
        JSON.stringify(input.per100g),
        input.portionHint,
        now
      );
    return {
      ...input,
      alias
    };
  }

  close(): void {
    this.db.close();
  }
}
