const api = require("../../utils/api");
const format = require("../../utils/format");
const nutrition = require("../../utils/nutrition");
const advice = require("../../utils/advice");
const { MEAL_TYPES, MEAL_TYPE_LABELS } = require("../../utils/constants");

function mealTypeOptions(selected) {
  return MEAL_TYPES.map((id) => ({
    id,
    label: MEAL_TYPE_LABELS[id],
    active: id === selected
  }));
}

function targetDefaults() {
  return { kcal: 1800, protein: 110, carbs: 190, fat: 55, fiber: 25 };
}

Page({
  data: {
    loading: true,
    analysis: null,
    imageUrl: "",
    dishName: "",
    provider: "vision",
    notice: "",
    items: [],
    totals: { kcal: 0, protein: 0, carbs: 0, fat: 0, fiber: 0 },
    quality: { score: 0, label: "", summary: "" },
    tips: [],
    mealType: "lunch",
    mealTypeOptions: mealTypeOptions("lunch"),
    mealPercent: 0,
    avgConfidence: 0,
    saving: false,
    saveAsTemplate: false
  },

  onLoad() {
    const app = getApp();
    const analysis = app.globalData.analysis;
    if (!analysis) {
      wx.showModal({
        title: "没有待保存的结果",
        content: "请先拍一张照片，或使用示例餐盘。",
        showCancel: false,
        success: () => wx.navigateBack()
      });
      return;
    }

    this.setData({
      analysis,
      imageUrl: api.assetUrl(analysis.imageUrl),
      dishName: analysis.dishName,
      provider: analysis.provider,
      notice: analysis.notice || "",
      loading: false
    });

    const chosen = app.globalData.suggestedMealType || "lunch";
    this.setData({
      mealType: chosen,
      mealTypeOptions: mealTypeOptions(chosen)
    });

    app.ready().then(() => {
      if (app.globalData.profile && app.globalData.profile.targets) {
        this.targets = app.globalData.profile.targets;
        this.recalc(analysis.items);
        return;
      }
      api
        .getProfile()
        .then((result) => {
          this.targets = (result.profile && result.profile.targets) || targetDefaults();
          app.globalData.profile = result.profile;
          this.recalc(analysis.items);
        })
        .catch(() => {
          this.targets = targetDefaults();
          this.recalc(analysis.items);
        });
    });
  },

  onShow() {
    const app = getApp();
    const food = app.globalData.pendingFood;
    if (food) {
      app.globalData.pendingFood = null;
      this.addFood(food);
    }
  },

  recalc(rawItems) {
    const targets = this.targets || targetDefaults();
    const items = (rawItems || []).map((item) => {
      const value = nutrition.scale(item.per100g, item.grams);
      return Object.assign({}, item, {
        nutrition: value,
        confidencePct: Math.round((item.confidence || 0.7) * 100),
        kcalText: Math.round(value.kcal),
        proteinText: nutrition.round(value.protein),
        carbsText: nutrition.round(value.carbs),
        fatText: nutrition.round(value.fat),
        fiberText: nutrition.round(value.fiber)
      });
    });

    const totals = nutrition.sum(items);
    const quality = advice.plateQuality(items, totals, targets);
    const tips = advice.mealAdvice(items, totals, targets);
    const avgConfidence = items.length
      ? Math.round(
          (items.reduce((sum, item) => sum + (item.confidence || 0.7), 0) / items.length) * 100
        )
      : 0;

    this.setData({
      items,
      totals: {
        kcal: Math.round(totals.kcal),
        protein: nutrition.round(totals.protein),
        carbs: nutrition.round(totals.carbs),
        fat: nutrition.round(totals.fat),
        fiber: nutrition.round(totals.fiber)
      },
      quality,
      tips,
      avgConfidence,
      mealPercent: nutrition.percent(totals.kcal, targets.kcal)
    });
  },

  changeGrams(index, grams) {
    const items = this.data.items.slice();
    const item = items[index];
    if (!item) return;
    const next = Math.max(1, Math.min(3000, Math.round(Number(grams) || 0)));
    items[index] = Object.assign({}, item, { grams: next });
    this.recalc(items);
  },

  onGramInput(event) {
    const index = Number(event.currentTarget.dataset.index);
    const raw = event.detail.value;
    if (raw === "" || !/^\d+$/.test(raw)) return;
    const value = Number(raw);
    if (value >= 1) this.changeGrams(index, value);
  },

  onGramBlur(event) {
    const index = Number(event.currentTarget.dataset.index);
    const value = Number(event.detail.value);
    this.changeGrams(index, Number.isFinite(value) && value > 0 ? value : 1);
  },

  onStep(event) {
    const index = Number(event.currentTarget.dataset.index);
    const delta = Number(event.currentTarget.dataset.delta);
    const item = this.data.items[index];
    if (item) this.changeGrams(index, item.grams + delta);
  },

  onPreset(event) {
    const index = Number(event.currentTarget.dataset.index);
    const factor = Number(event.currentTarget.dataset.factor);
    const item = this.data.items[index];
    if (item) this.changeGrams(index, Math.max(1, Math.round(item.grams * factor)));
  },

  onRemove(event) {
    const index = Number(event.currentTarget.dataset.index);
    const items = this.data.items.slice();
    items.splice(index, 1);
    this.recalc(items);
  },

  onAddFood() {
    wx.navigateTo({ url: "/pages/food-search/index" });
  },

  addFood(food) {
    if (!food || !food.per100g) return;
    const items = this.data.items.slice();
    let existingIndex = -1;
    for (let i = 0; i < items.length; i += 1) {
      if (items[i].foodId === food.id) {
        existingIndex = i;
        break;
      }
    }
    const grams = (food.portions && food.portions[0] && food.portions[0].grams) || 100;
    const portion = food.portions && food.portions[0];

    if (existingIndex >= 0) {
      items[existingIndex] = Object.assign({}, items[existingIndex], {
        grams: items[existingIndex].grams + grams
      });
      wx.showToast({ title: `已增加${food.name}`, icon: "none" });
    } else {
      items.push({
        id: `${food.id}-${Date.now()}`,
        foodId: food.id,
        name: food.name,
        emoji: food.emoji,
        category: food.category,
        grams,
        confidence: 1,
        portionHint: portion ? `${portion.label} · ${portion.grams}g` : "手动添加",
        per100g: food.per100g,
        nutrition: nutrition.scale(food.per100g, grams),
        source: "database"
      });
      wx.showToast({ title: `已添加${food.name}`, icon: "none" });
    }
    this.recalc(items);
  },

  onMealType(event) {
    const mealType = event.currentTarget.dataset.type;
    this.setData({
      mealType,
      mealTypeOptions: mealTypeOptions(mealType)
    });
  },

  onBack() {
    wx.navigateBack();
  },

  onToggleTemplate() {
    this.setData({ saveAsTemplate: !this.data.saveAsTemplate });
  },

  onSave() {
    if (this.data.saving) return;
    if (this.data.items.length === 0) {
      wx.showToast({ title: "至少保留一种食物", icon: "none" });
      return;
    }

    const app = getApp();
    const analysis = this.data.analysis;
    const payload = {
      name: analysis.dishName,
      mealType: this.data.mealType,
      date: format.dateKey(),
      eatenAt: new Date().toISOString(),
      imageUrl: analysis.imageUrl,
      engine: analysis.engine,
      items: this.data.items.map((item) => ({
        foodId: item.foodId || null,
        name: item.name,
        emoji: item.emoji,
        category: item.category,
        grams: item.grams,
        confidence: item.confidence,
        portionHint: item.portionHint,
        per100g: item.per100g
      }))
    };

    this.setData({ saving: true });
    wx.showLoading({ title: "正在保存…", mask: true });
    api
      .saveMeal(payload)
      .then((result) => {
        const finish = () => {
          wx.hideLoading();
          this.setData({ saving: false });
          app.globalData.lastSaved = result.meal;
          wx.showToast({ title: "已加入今日饮食", icon: "success" });
          setTimeout(() => {
            wx.switchTab({ url: "/pages/journal/index" });
          }, 650);
        };

        if (!this.data.saveAsTemplate) {
          finish();
          return;
        }
        // 常用餐是附加动作，保存失败不阻塞这一餐入库。
        api.saveTemplate(result.meal.id).then(finish).catch(finish);
      })
      .catch((error) => {
        wx.hideLoading();
        this.setData({ saving: false });
        wx.showModal({
          title: "保存失败",
          content: error.message || "请检查网络后再试",
          showCancel: false
        });
      });
  },

  onShareAppMessage() {
    return {
      title: "食刻 · 拍一张，吃明白",
      path: "/pages/home/index"
    };
  }
});
