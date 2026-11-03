import { randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import type {
  ActivityLevel,
  BodyProfile,
  CreateMealInput,
  FoodCategory,
  FoodItem,
  Goal,
  Meal,
  MealItemInput,
  MealTemplate,
  MealType,
  NutritionFacts,
  Profile,
  Sex,
  Targets,
  TargetsMode
} from "../shared/types.ts";
import { DEFAULT_TARGETS, round } from "../shared/nutrition.ts";
import { bodyMetrics, isBodyComplete } from "../shared/body.ts";

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

export interface RecentFoodRecord {
  foodId: string | null;
  name: string;
  emoji: string;
  category: FoodCategory;
  per100g: NutritionFacts;
  lastEatenAt: string;
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
    source: row.source === "database" ? "database" : "ai"
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

      CREATE INDEX IF NOT EXISTS idx_meals_device_date ON meals(device_id, date, eaten_at);
      CREATE INDEX IF NOT EXISTS idx_items_meal ON meal_items(meal_id, order_index);
      CREATE INDEX IF NOT EXISTS idx_items_food ON meal_items(food_id);
      CREATE INDEX IF NOT EXISTS idx_templates_device ON meal_templates(device_id, last_used_at);
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
        patch.weightKg !== undefined ? patch.weightKg : current.weightKg,
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

  close(): void {
    this.db.close();
  }
}
