import type { FoodCategory, NutritionFacts } from "../../shared/types.ts";

export interface PortionPreset {
  label: string;
  grams: number;
}

export interface FoodRecord {
  id: string;
  name: string;
  aliases: string[];
  emoji: string;
  category: FoodCategory;
  per100g: NutritionFacts;
  portions: PortionPreset[];
  note?: string;
}

const f = (
  id: string,
  name: string,
  emoji: string,
  category: FoodCategory,
  per100g: [number, number, number, number, number],
  aliases: string[],
  portions: PortionPreset[],
  note?: string
): FoodRecord => ({
  id,
  name,
  emoji,
  category,
  aliases,
  per100g: {
    kcal: per100g[0],
    protein: per100g[1],
    carbs: per100g[2],
    fat: per100g[3],
    fiber: per100g[4]
  },
  portions,
  ...(note ? { note } : {})
});

/**
 * 食物营养库（每 100g 可食部，熟重优先）。
 * 数值用于日常估算，不替代实验室检测或医疗建议。
 */
export const FOODS: FoodRecord[] = [
  // ── 优质蛋白 ──────────────────────────────────────────
  f("chicken-breast", "鸡胸肉", "🍗", "protein", [165, 31, 0, 3.6, 0], ["鸡胸", "煎鸡胸", "水煮鸡胸", "鸡胸肉块", "鸡胸肉片"], [{ label: "半掌心", grams: 80 }, { label: "一掌心", grams: 120 }, { label: "大份", grams: 180 }], "熟重"),
  f("egg", "鸡蛋", "🥚", "protein", [143, 12.6, 0.7, 9.5, 0], ["水煮蛋", "煎蛋", "荷包蛋", "溏心蛋", "卤蛋", "茶叶蛋"], [{ label: "一个", grams: 50 }, { label: "两个", grams: 100 }]),
  f("salmon", "三文鱼", "🐟", "protein", [208, 20.4, 0, 13.4, 0], ["烤三文鱼", "煎三文鱼", "三文鱼排"], [{ label: "小份", grams: 100 }, { label: "标准", grams: 150 }]),
  f("shrimp", "虾仁", "🦐", "protein", [99, 24, 0.2, 0.3, 0], ["虾", "白灼虾", "清炒虾仁", "大虾"], [{ label: "6–8 只", grams: 80 }, { label: "一盘", grams: 150 }]),
  f("lean-beef", "瘦牛肉", "🥩", "protein", [250, 26, 0, 15, 0], ["牛排", "牛肉", "煎牛排", "酱牛肉"], [{ label: "小份", grams: 100 }, { label: "标准", grams: 150 }]),
  f("pork-tenderloin", "猪里脊", "🥩", "protein", [143, 20.2, 1.5, 6.2, 0], ["里脊", "猪瘦肉", "瘦猪肉"], [{ label: "小份", grams: 80 }, { label: "标准", grams: 120 }]),
  f("silken-tofu", "嫩豆腐", "⬜", "protein", [76, 8.1, 1.9, 4.8, 0.3], ["豆腐", "内酯豆腐", "香煎豆腐", "家常豆腐", "嫩豆腐块"], [{ label: "半盒", grams: 150 }, { label: "一盒", grams: 300 }]),
  f("firm-tofu", "北豆腐", "🧊", "protein", [116, 12.2, 2.9, 6.9, 0.4], ["老豆腐", "北豆腐块", "煎豆腐"], [{ label: "半块", grams: 150 }, { label: "一块", grams: 300 }]),
  f("edamame", "毛豆", "🫛", "protein", [131, 13.1, 10.5, 5, 5.2], ["毛豆仁", "青豆仁", "盐水毛豆"], [{ label: "一小碟", grams: 50 }, { label: "一碟", grams: 100 }]),
  f("tuna", "金枪鱼", "🐟", "protein", [132, 28, 0, 1.3, 0], ["吞拿鱼", "水浸金枪鱼", "金枪鱼罐头"], [{ label: "半罐", grams: 60 }, { label: "一罐", grams: 120 }]),
  f("chicken-thigh", "鸡腿肉", "🍗", "protein", [209, 26, 0, 10.9, 0], ["去皮鸡腿", "烤鸡腿肉", "鸡腿"], [{ label: "一只", grams: 100 }, { label: "两只", grams: 200 }]),
  f("greek-yogurt", "希腊酸奶", "🥛", "dairy", [59, 10.2, 3.6, 0.4, 0], ["无糖酸奶", "酸奶", "希腊式酸奶"], [{ label: "一杯", grams: 100 }, { label: "大杯", grams: 170 }]),
  f("protein-powder", "蛋白粉", "💪", "protein", [380, 78, 8, 4, 1], ["乳清蛋白", "蛋白粉一勺"], [{ label: "一勺", grams: 30 }]),
  f("quail-egg", "鹌鹑蛋", "🥚", "protein", [158, 13, 0.5, 11, 0], ["卤鹌鹑蛋", "煮鹌鹑蛋"], [{ label: "3 个", grams: 30 }, { label: "6 个", grams: 60 }]),
  f("tofu-skin", "千张", "🟨", "protein", [262, 24.5, 5.5, 16, 1], ["豆腐皮", "百叶", "干豆腐"], [{ label: "一小把", grams: 50 }, { label: "一份", grams: 100 }]),
  f("cod", "鳕鱼", "🐟", "protein", [90, 19, 0, 1.2, 0], ["银鳕鱼", "清蒸鳕鱼", "白鱼"], [{ label: "一块", grams: 120 }, { label: "大块", grams: 180 }]),

  // ── 主食与碳水 ────────────────────────────────────────
  f("rice", "米饭", "🍚", "staple", [116, 2.6, 25.9, 0.3, 0.3], ["白米饭", "大米饭", "白饭", "米饭一碗"], [{ label: "半碗", grams: 100 }, { label: "一碗", grams: 150 }, { label: "大碗", grams: 220 }], "熟重"),
  f("brown-rice", "糙米饭", "🍚", "staple", [111, 2.6, 23, 0.9, 1.8], ["糙米", "杂粮饭", "五谷饭"], [{ label: "半碗", grams: 100 }, { label: "一碗", grams: 150 }], "熟重"),
  f("quinoa", "藜麦", "🌾", "staple", [120, 4.4, 21.3, 1.9, 2.8], ["藜麦饭", "三色藜麦", "煮熟藜麦"], [{ label: "半碗", grams: 90 }, { label: "一碗", grams: 150 }], "熟重"),
  f("oats", "燕麦片", "🥣", "staple", [389, 16.9, 66.3, 6.9, 10.6], ["燕麦", "即食燕麦", "燕麦粥"], [{ label: "一小把", grams: 30 }, { label: "一份", grams: 50 }], "干重"),
  f("whole-wheat-bread", "全麦面包", "🍞", "staple", [247, 13, 41, 4.2, 7], ["全麦吐司", "黑麦面包", "全麦面包片"], [{ label: "一片", grams: 35 }, { label: "两片", grams: 70 }]),
  f("toast", "白吐司", "🍞", "staple", [265, 9, 49, 3.2, 2.7], ["吐司", "白面包", "面包片"], [{ label: "一片", grams: 35 }, { label: "两片", grams: 70 }]),
  f("pasta", "意大利面", "🍝", "staple", [158, 5.8, 30.9, 0.9, 1.8], ["意面", "通心粉", "意粉"], [{ label: "小份", grams: 120 }, { label: "标准", grams: 180 }], "熟重"),
  f("sweet-potato", "红薯", "🍠", "staple", [86, 1.6, 20.1, 0.1, 3], ["地瓜", "烤红薯", "蒸红薯"], [{ label: "小个", grams: 120 }, { label: "中个", grams: 200 }]),
  f("purple-sweet-potato", "紫薯", "🍠", "staple", [82, 1.3, 18.9, 0.2, 3], ["蒸紫薯", "紫薯块"], [{ label: "小个", grams: 120 }, { label: "中个", grams: 180 }]),
  f("corn", "玉米", "🌽", "staple", [112, 4, 22.8, 1.2, 2.9], ["甜玉米", "玉米粒", "玉米棒", "水煮玉米"], [{ label: "半根", grams: 100 }, { label: "一根", grams: 200 }]),
  f("potato", "土豆", "🥔", "staple", [77, 2, 17, 0.1, 2.2], ["马铃薯", "蒸土豆", "土豆块"], [{ label: "小个", grams: 120 }, { label: "中个", grams: 180 }]),
  f("soba", "荞麦面", "🍜", "staple", [99, 5.1, 21.4, 0.1, 1.5], ["荞麦冷面", "日式荞麦面"], [{ label: "小份", grams: 150 }, { label: "一份", grams: 220 }], "熟重"),
  f("millet-porridge", "小米粥", "🥣", "staple", [46, 1.4, 8.4, 0.7, 0.4], ["小米稀饭", "粥"], [{ label: "一碗", grams: 250 }, { label: "大碗", grams: 350 }]),
  f("congee", "白粥", "🥣", "staple", [46, 1.1, 9.8, 0.1, 0.3], ["稀饭", "大米粥"], [{ label: "一碗", grams: 250 }, { label: "大碗", grams: 350 }]),
  f("dumpling", "猪肉白菜饺子", "🥟", "staple", [220, 8.5, 26, 8.5, 1.2], ["饺子", "水饺", "猪肉饺子"], [{ label: "6 个", grams: 120 }, { label: "10 个", grams: 200 }]),
  f("rice-cake", "年糕", "🍡", "staple", [154, 3.3, 34.7, 0.6, 0.8], ["炒年糕", "韩式年糕", "水磨年糕"], [{ label: "小份", grams: 100 }, { label: "一份", grams: 180 }]),
  f("taro", "芋头", "🟣", "staple", [56, 1.3, 12.7, 0.2, 1.5], ["蒸芋头", "芋艿"], [{ label: "小个", grams: 100 }, { label: "中个", grams: 160 }]),

  // ── 蔬菜 ──────────────────────────────────────────────
  f("broccoli", "西兰花", "🥦", "vegetable", [34, 2.8, 6.6, 0.4, 2.6], ["绿花菜", "青花菜", "水煮西兰花"], [{ label: "一小份", grams: 80 }, { label: "一拳头", grams: 150 }]),
  f("lettuce", "生菜", "🥬", "vegetable", [15, 1.4, 2.9, 0.2, 1.3], ["罗马生菜", "球生菜", "生菜叶"], [{ label: "一小把", grams: 50 }, { label: "一大把", grams: 100 }]),
  f("tomato", "番茄", "🍅", "vegetable", [18, 0.9, 3.9, 0.2, 1.2], ["西红柿", "小番茄", "圣女果", "樱桃番茄"], [{ label: "一个", grams: 150 }, { label: "一小碗", grams: 200 }]),
  f("cucumber", "黄瓜", "🥒", "vegetable", [16, 0.7, 3.6, 0.1, 0.5], ["青瓜", "黄瓜片", "水果黄瓜"], [{ label: "半根", grams: 100 }, { label: "一根", grams: 200 }]),
  f("purple-cabbage", "紫甘蓝", "🟣", "vegetable", [25, 1.4, 5.8, 0.1, 2.1], ["紫包菜", "红甘蓝", "紫甘蓝丝"], [{ label: "一小把", grams: 40 }, { label: "一份", grams: 80 }]),
  f("spinach", "菠菜", "🥬", "vegetable", [23, 2.9, 3.6, 0.4, 2.2], ["菠菜叶", "水煮菠菜", "蒜蓉菠菜"], [{ label: "一小把", grams: 80 }, { label: "一份", grams: 150 }]),
  f("carrot", "胡萝卜", "🥕", "vegetable", [41, 0.9, 9.6, 0.2, 2.8], ["红萝卜", "胡萝卜丝"], [{ label: "半根", grams: 60 }, { label: "一根", grams: 120 }]),
  f("pumpkin", "南瓜", "🎃", "vegetable", [26, 1, 6.5, 0.1, 0.5], ["蒸南瓜", "贝贝南瓜"], [{ label: "一小块", grams: 100 }, { label: "一份", grams: 180 }]),
  f("bell-pepper", "彩椒", "🫑", "vegetable", [26, 1, 6, 0.3, 2.1], ["甜椒", "红椒", "黄椒", "青椒"], [{ label: "半个", grams: 60 }, { label: "一个", grams: 120 }]),
  f("mushroom", "蘑菇", "🍄", "vegetable", [22, 3.1, 3.3, 0.3, 1], ["口蘑", "白蘑菇", "香菇", "菌菇"], [{ label: "一小份", grams: 60 }, { label: "一份", grams: 100 }]),
  f("asparagus", "芦笋", "🌿", "vegetable", [20, 2.2, 3.9, 0.1, 2.1], ["烤芦笋", "清炒芦笋"], [{ label: "5 根", grams: 80 }, { label: "一份", grams: 130 }]),
  f("okra", "秋葵", "🌱", "vegetable", [33, 1.9, 7.5, 0.2, 3.2], ["水煮秋葵", "凉拌秋葵"], [{ label: "6 根", grams: 60 }, { label: "一份", grams: 100 }]),
  f("eggplant", "茄子", "🍆", "vegetable", [25, 1, 5.9, 0.2, 3], ["蒸茄子", "烤茄子"], [{ label: "半根", grams: 120 }, { label: "一份", grams: 200 }]),
  f("onion", "洋葱", "🧅", "vegetable", [40, 1.1, 9.3, 0.1, 1.7], ["紫洋葱", "白洋葱", "洋葱丝"], [{ label: "半个", grams: 80 }, { label: "一个", grams: 160 }]),
  f("seaweed", "海带", "🌊", "vegetable", [13, 1.2, 2.1, 0.1, 0.5], ["海带丝", "裙带菜", "海藻"], [{ label: "一小碟", grams: 50 }, { label: "一份", grams: 100 }]),
  f("bean-sprouts", "豆芽", "🌱", "vegetable", [30, 2.1, 5.9, 0.2, 1.8], ["绿豆芽", "黄豆芽", "炒豆芽"], [{ label: "一小把", grams: 80 }, { label: "一份", grams: 150 }]),

  // ── 水果 ──────────────────────────────────────────────
  f("blueberry", "蓝莓", "🫐", "fruit", [57, 0.7, 14.5, 0.3, 2.4], ["新鲜蓝莓", "冷冻蓝莓"], [{ label: "一小把", grams: 50 }, { label: "一盒", grams: 125 }]),
  f("banana", "香蕉", "🍌", "fruit", [89, 1.1, 22.8, 0.3, 2.6], ["芭蕉", "香蕉段"], [{ label: "半根", grams: 60 }, { label: "一根", grams: 120 }]),
  f("apple", "苹果", "🍎", "fruit", [52, 0.3, 13.8, 0.2, 2.4], ["红苹果", "青苹果"], [{ label: "小个", grams: 150 }, { label: "中个", grams: 200 }]),
  f("orange", "橙子", "🍊", "fruit", [47, 0.9, 11.8, 0.1, 2.4], ["甜橙", "脐橙", "橘子"], [{ label: "一个", grams: 150 }, { label: "两个", grams: 300 }]),
  f("avocado", "牛油果", "🥑", "fruit", [160, 2, 8.5, 14.7, 6.7], ["鳄梨", "牛油果片"], [{ label: "半个", grams: 80 }, { label: "一个", grams: 160 }]),
  f("strawberry", "草莓", "🍓", "fruit", [32, 0.7, 7.7, 0.3, 2], ["新鲜草莓", "草莓果"], [{ label: "5 颗", grams: 60 }, { label: "一小碗", grams: 150 }]),
  f("grape", "葡萄", "🍇", "fruit", [69, 0.7, 18.1, 0.2, 0.9], ["提子", "青提", "红提"], [{ label: "一小串", grams: 80 }, { label: "一串", grams: 150 }]),
  f("kiwi", "猕猴桃", "🥝", "fruit", [61, 1.1, 14.7, 0.5, 3], ["奇异果", "黄金奇异果"], [{ label: "一个", grams: 80 }, { label: "两个", grams: 160 }]),

  // ── 乳品与饮品 ────────────────────────────────────────
  f("milk", "牛奶", "🥛", "dairy", [54, 3, 5, 3.2, 0], ["纯牛奶", "全脂牛奶", "低脂牛奶"], [{ label: "一杯", grams: 200 }, { label: "一盒", grams: 250 }]),
  f("soy-milk", "无糖豆浆", "🥛", "drink", [31, 3, 1.8, 1.6, 0.6], ["豆浆", "原味豆浆"], [{ label: "一杯", grams: 250 }, { label: "一大杯", grams: 400 }]),
  f("latte", "拿铁", "☕", "drink", [55, 3, 4.5, 2.5, 0], ["咖啡拿铁", "燕麦拿铁", "冰拿铁"], [{ label: "中杯", grams: 300 }, { label: "大杯", grams: 450 }]),
  f("americano", "美式咖啡", "☕", "drink", [2, 0.1, 0, 0, 0], ["美式", "黑咖啡", "冰美式"], [{ label: "中杯", grams: 300 }, { label: "大杯", grams: 450 }]),
  f("milk-tea", "奶茶", "🧋", "drink", [80, 1.2, 15, 2.2, 0], ["三分糖奶茶", "珍珠奶茶", "奶盖茶"], [{ label: "中杯", grams: 400 }, { label: "大杯", grams: 550 }]),
  f("cheese", "奶酪", "🧀", "dairy", [350, 25, 1.3, 27, 0], ["芝士", "干酪", "奶酪片"], [{ label: "一片", grams: 20 }, { label: "一小块", grams: 40 }]),
  f("oat-milk", "燕麦奶", "🥛", "drink", [45, 1, 6.7, 1.5, 0.8], ["燕麦饮", "燕麦植物奶"], [{ label: "一杯", grams: 250 }]),

  // ── 油脂与坚果 ────────────────────────────────────────
  f("olive-oil", "橄榄油", "🫒", "fat", [884, 0, 0, 100, 0], ["食用油", "植物油", "沙拉油", "油"], [{ label: "一勺", grams: 10 }, { label: "两勺", grams: 20 }]),
  f("nuts", "混合坚果", "🥜", "fat", [607, 20, 21, 54, 7], ["坚果", "每日坚果", "杏仁腰果"], [{ label: "一小把", grams: 20 }, { label: "一包", grams: 30 }]),
  f("peanut-butter", "花生酱", "🥜", "fat", [588, 25, 20, 50, 6], ["无糖花生酱", "花生酱一勺"], [{ label: "一勺", grams: 15 }, { label: "两勺", grams: 30 }]),
  f("sesame-paste", "芝麻酱", "🫙", "fat", [630, 17, 22, 56, 5], ["麻酱", "芝麻酱蘸料"], [{ label: "一勺", grams: 15 }, { label: "一小碟", grams: 30 }]),

  // ── 常见菜肴 ──────────────────────────────────────────
  f("tomato-egg", "番茄炒蛋", "🍅", "dish", [90, 5.2, 4.5, 5.8, 0.8], ["西红柿炒鸡蛋", "番茄炒鸡蛋", "西红柿炒蛋"], [{ label: "小份", grams: 150 }, { label: "一份", grams: 250 }]),
  f("kungpao-chicken", "宫保鸡丁", "🥜", "dish", [180, 13, 10, 10, 1.2], ["宫爆鸡丁", "花生鸡丁"], [{ label: "小份", grams: 150 }, { label: "一份", grams: 250 }]),
  f("mapo-tofu", "麻婆豆腐", "🌶️", "dish", [130, 8, 6, 8, 1], ["麻辣豆腐", "肉末豆腐"], [{ label: "小份", grams: 150 }, { label: "一份", grams: 250 }]),
  f("stir-fry-greens", "清炒时蔬", "🥬", "dish", [50, 2, 6, 2, 2], ["炒青菜", "蒜蓉时蔬", "清炒蔬菜"], [{ label: "一小盘", grams: 150 }, { label: "一盘", grams: 250 }]),
  f("braised-pork", "红烧肉", "🥩", "dish", [390, 14, 6, 35, 0], ["东坡肉", "红烧五花肉"], [{ label: "3 块", grams: 80 }, { label: "一份", grams: 150 }]),
  f("yuxiang-pork", "鱼香肉丝", "🌶️", "dish", [160, 11, 12, 8, 1.2], ["鱼香猪肉丝", "鱼香肉丝盖饭"], [{ label: "小份", grams: 150 }, { label: "一份", grams: 250 }]),
  f("yangzhou-fried-rice", "扬州炒饭", "🍚", "dish", [190, 5.5, 28, 6, 0.8], ["炒饭", "蛋炒饭", "什锦炒饭"], [{ label: "一小盘", grams: 200 }, { label: "一盘", grams: 300 }]),
  f("lanzhou-noodles", "兰州牛肉面", "🍜", "dish", [120, 6, 18, 2.5, 0.8], ["牛肉面", "拉面", "牛腩面"], [{ label: "一碗", grams: 450 }, { label: "大碗", grams: 600 }]),
  f("xiaolongbao", "小笼包", "🥟", "dish", [240, 9, 26, 11, 0.8], ["灌汤包", "小笼汤包"], [{ label: "4 个", grams: 100 }, { label: "6 个", grams: 150 }]),
  f("fried-dumpling", "煎饺", "🥟", "dish", [250, 8, 28, 12, 1], ["锅贴", "煎饺子"], [{ label: "5 个", grams: 120 }, { label: "8 个", grams: 190 }]),
  f("malatang", "麻辣烫", "🌶️", "dish", [80, 6, 8, 2.5, 1.5], ["清汤麻辣烫", "麻辣拌", "冒菜"], [{ label: "一小碗", grams: 300 }, { label: "一碗", grams: 500 }], "清汤、少油估算"),
  f("roast-chicken-leg", "烤鸡腿", "🍗", "dish", [215, 25, 2, 12, 0], ["奥尔良鸡腿", "照烧鸡腿"], [{ label: "一只", grams: 120 }, { label: "两只", grams: 240 }]),
  f("hamburger", "汉堡", "🍔", "dish", [250, 13, 25, 11, 1.2], ["牛肉汉堡", "鸡腿堡", "芝士汉堡"], [{ label: "一个", grams: 200 }]),
  f("fries", "薯条", "🍟", "dish", [312, 3.4, 41, 15, 3.8], ["炸薯条", "大份薯条"], [{ label: "小份", grams: 80 }, { label: "中份", grams: 120 }]),
  f("pizza", "披萨", "🍕", "dish", [266, 11, 33, 10, 2.3], ["比萨", "芝士披萨"], [{ label: "一角", grams: 100 }, { label: "两角", grams: 200 }]),
  f("sushi", "寿司", "🍣", "dish", [150, 6, 28, 1.5, 0.9], ["握寿司", "寿司拼盘"], [{ label: "6 贯", grams: 150 }, { label: "10 贯", grams: 250 }]),
  f("sandwich", "三明治", "🥪", "dish", [230, 10, 28, 8, 2], ["全麦三明治", "鸡肉三明治"], [{ label: "一个", grams: 180 }]),
  f("salad-vinaigrette", "油醋汁沙拉", "🥗", "dish", [110, 3, 8, 7, 2.5], ["蔬菜沙拉", "轻食沙拉", "沙拉"], [{ label: "一小份", grams: 180 }, { label: "一份", grams: 280 }]),
  f("chicken-soup", "鸡汤", "🍲", "dish", [40, 3, 1, 2.5, 0], ["清炖鸡汤", "老母鸡汤"], [{ label: "一碗", grams: 300 }]),
  f("miso-soup", "味噌汤", "🍲", "dish", [35, 2.5, 3, 1.5, 0.5], ["味增汤", "日式味噌汤"], [{ label: "一碗", grams: 250 }]),
  f("caesar-salad", "凯撒沙拉", "🥗", "dish", [180, 8, 7, 14, 2], ["凯撒色拉", "鸡胸凯撒沙拉"], [{ label: "一小份", grams: 180 }, { label: "一份", grams: 280 }])
];

export const FOOD_BY_ID = new Map(FOODS.map((food) => [food.id, food]));

function normalize(value: string): string {
  return value
    .toLowerCase()
    .replace(/[（(].*?[）)]/g, "")
    .replace(/[\s·•\-—_/]/g, "")
    .replace(/[，,。.]/g, "");
}

/**
 * 名称解析：优先完整命中，其次取最长别名包含。返回 null 时使用模型给出的估值。
 */
export function resolveFood(name: string): FoodRecord | null {
  const target = normalize(name);
  if (!target) return null;

  let best: { food: FoodRecord; score: number } | null = null;
  for (const food of FOODS) {
    const names = [food.name, ...food.aliases];
    for (const candidate of names) {
      const key = normalize(candidate);
      if (!key || key.length < 2) continue;
      let score = 0;
      if (target === key) score = 1000 + key.length;
      else if (target.includes(key)) score = key.length * 2;
      else if (key.includes(target) && target.length >= 2) score = target.length;
      if (score > 0 && (!best || score > best.score)) {
        best = { food, score };
      }
    }
  }
  return best?.food ?? null;
}

export function portionHintFor(food: FoodRecord | null): string {
  if (!food || food.portions.length === 0) return "按实际份量调整";
  const portion = food.portions[0];
  return portion ? `${portion.label} · ${portion.grams}g` : "按实际份量调整";
}

const POPULAR_IDS = [
  "rice",
  "chicken-breast",
  "egg",
  "broccoli",
  "sweet-potato",
  "salmon",
  "silken-tofu",
  "banana",
  "greek-yogurt",
  "oats",
  "avocado",
  "beef"
];

export function searchFoods(query: string, limit = 24): FoodRecord[] {
  const q = normalize(query);
  if (!q) {
    return POPULAR_IDS.map((id) => FOOD_BY_ID.get(id)).filter((food): food is FoodRecord => Boolean(food));
  }

  const scored: Array<{ food: FoodRecord; score: number }> = [];
  for (const food of FOODS) {
    let score = 0;
    for (const candidate of [food.name, ...food.aliases]) {
      const key = normalize(candidate);
      if (!key) continue;
      if (key === q) score = Math.max(score, 100);
      else if (key.startsWith(q)) score = Math.max(score, 70 - key.length);
      else if (key.includes(q)) score = Math.max(score, 45 - key.length);
    }
    if (food.category === "staple" && q.includes("饭")) score += 2;
    if (score > 0) scored.push({ food, score });
  }

  return scored
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((entry) => entry.food);
}
