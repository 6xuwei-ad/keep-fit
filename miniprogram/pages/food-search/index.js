const api = require("../../utils/api");
const { CATEGORY_LABELS } = require("../../utils/constants");

const CATEGORY_OPTIONS = Object.keys(CATEGORY_LABELS).map((id) => ({
  id,
  label: CATEGORY_LABELS[id]
}));
const CATEGORY_LABELS_LIST = CATEGORY_OPTIONS.map((item) => item.label);

function emptyForm() {
  return {
    name: "",
    emoji: "🍽️",
    category: "other",
    categoryIndex: CATEGORY_OPTIONS.length - 1,
    categoryLabel: CATEGORY_LABELS.other,
    kcal: "",
    protein: "",
    carbs: "",
    fat: "",
    fiber: "",
    portionLabel: "",
    portionGrams: ""
  };
}

function numberOrZero(value) {
  if (value === "" || value === null || value === undefined) return 0;
  const number = Number(value);
  return Number.isFinite(number) ? number : NaN;
}

function formatFood(food) {
  return {
    id: food.id,
    name: food.name,
    emoji: food.emoji,
    category: food.category,
    categoryLabel: CATEGORY_LABELS[food.category] || "食物",
    kcal: food.per100g.kcal,
    per100g: food.per100g,
    portions: food.portions || [],
    isCustom: food.source === "custom",
    source: food.source
  };
}

Page({
  data: {
    query: "",
    foods: [],
    recent: [],
    loading: true,
    error: "",
    mode: "add",
    replaceName: "",
    replaceIndex: -1,
    showEditor: false,
    editingId: "",
    editingName: "",
    form: emptyForm(),
    categoryLabels: CATEGORY_LABELS_LIST,
    formError: "",
    saving: false
  },

  onLoad(options) {
    const app = getApp();
    const mode = (options && options.mode) || app.globalData.foodSearchMode || "add";
    const rawIndex =
      options && options.index !== undefined
        ? options.index
        : app.globalData.foodSearchReplaceIndex;
    const index = rawIndex === null || rawIndex === undefined ? -1 : Number(rawIndex);
    this.setData({
      mode: mode === "replace" ? "replace" : "add",
      replaceName: app.globalData.foodSearchReplaceName || "",
      replaceIndex: Number.isFinite(index) ? index : -1
    });
    app.globalData.foodSearchMode = null;
    app.globalData.foodSearchReplaceName = "";
    app.globalData.foodSearchReplaceIndex = null;

    this.loadFoods("");
    this.loadRecent();
  },

  onInput(event) {
    const query = event.detail.value;
    this.setData({ query });
    if (this._timer) clearTimeout(this._timer);
    this._timer = setTimeout(() => this.loadFoods(query), 220);
  },

  onClear() {
    this.setData({ query: "" });
    this.loadFoods("");
  },

  loadFoods(query) {
    this.setData({ loading: true, error: "" });
    api
      .searchFoods(query)
      .then((result) => {
        this.setData({ foods: (result.foods || []).map(formatFood), loading: false });
      })
      .catch((error) => {
        this.setData({ loading: false, error: error.message || "食物库加载失败" });
      });
  },

  loadRecent() {
    api
      .getRecentFoods()
      .then((result) => {
        this.setData({ recent: (result.foods || []).slice(0, 20).map(formatFood) });
      })
      .catch(() => {
        // 最近吃过只是快捷入口，失败时保持普通搜索可用。
      });
  },

  pickFood(food) {
    if (!food) return;
    const app = getApp();
    if (this.data.mode === "replace") {
      app.globalData.pendingReplace = {
        index: this.data.replaceIndex,
        food
      };
    } else {
      app.globalData.pendingFood = food;
    }
    wx.navigateBack();
  },

  onAdd(event) {
    const index = Number(event.currentTarget.dataset.index);
    this.pickFood(this.data.foods[index]);
  },

  onAddRecent(event) {
    const index = Number(event.currentTarget.dataset.index);
    this.pickFood(this.data.recent[index]);
  },

  onNewCustom() {
    if (wx.hideKeyboard) wx.hideKeyboard();
    this.setData({
      showEditor: true,
      editingId: "",
      editingName: "",
      form: emptyForm(),
      formError: ""
    });
    wx.pageScrollTo({ scrollTop: 0, duration: 200 });
  },

  onEditCustom(event) {
    const index = Number(event.currentTarget.dataset.index);
    const food = this.data.foods[index];
    if (!food || !food.isCustom) return;
    if (wx.hideKeyboard) wx.hideKeyboard();
    const portion = food.portions[0];
    const foundCategory = CATEGORY_OPTIONS.findIndex((item) => item.id === food.category);
    const categoryIndex =
      foundCategory >= 0 ? foundCategory : CATEGORY_OPTIONS.length - 1;
    this.setData({
      showEditor: true,
      editingId: food.id,
      editingName: food.name,
      form: {
        name: food.name,
        emoji: food.emoji,
        category: food.category,
        categoryIndex,
        categoryLabel: CATEGORY_LABELS[food.category] || "其他",
        kcal: String(food.per100g.kcal),
        protein: String(food.per100g.protein),
        carbs: String(food.per100g.carbs),
        fat: String(food.per100g.fat),
        fiber: String(food.per100g.fiber),
        portionLabel: portion ? portion.label : "",
        portionGrams: portion ? String(portion.grams) : ""
      },
      formError: ""
    });
    wx.pageScrollTo({ scrollTop: 0, duration: 200 });
  },

  onCancelCustom() {
    this.setData({ showEditor: false, editingId: "", formError: "" });
  },

  onFormInput(event) {
    const key = event.currentTarget.dataset.key;
    this.setData({ [`form.${key}`]: event.detail.value, formError: "" });
  },

  onCategoryChange(event) {
    const index = Number(event.detail.value);
    const option = CATEGORY_OPTIONS[index] || CATEGORY_OPTIONS[CATEGORY_OPTIONS.length - 1];
    this.setData({
      "form.category": option.id,
      "form.categoryIndex": index,
      "form.categoryLabel": option.label,
      formError: ""
    });
  },

  validateCustom() {
    const form = this.data.form;
    if (!form.name.trim()) return "先给食物起个名字";
    const per100g = {
      kcal: numberOrZero(form.kcal),
      protein: numberOrZero(form.protein),
      carbs: numberOrZero(form.carbs),
      fat: numberOrZero(form.fat),
      fiber: numberOrZero(form.fiber)
    };
    const limits = {
      kcal: [0, 900, "热量"],
      protein: [0, 100, "蛋白质"],
      carbs: [0, 100, "碳水"],
      fat: [0, 100, "脂肪"],
      fiber: [0, 100, "膳食纤维"]
    };
    const keys = Object.keys(limits);
    for (let index = 0; index < keys.length; index += 1) {
      const key = keys[index];
      const value = per100g[key];
      const rule = limits[key];
      if (!Number.isFinite(value) || value < rule[0] || value > rule[1]) {
        return `${rule[2]}需要在 ${rule[0]}–${rule[1]} 之间`;
      }
    }
    const label = form.portionLabel.trim();
    const grams = numberOrZero(form.portionGrams);
    if ((label && !form.portionGrams) || (!label && form.portionGrams)) {
      return "份量名称和克数要一起填，或者都留空";
    }
    if (form.portionGrams && (!Number.isFinite(grams) || grams < 1 || grams > 3000)) {
      return "份量克数需要在 1–3000 之间";
    }
    return "";
  },

  onSaveCustom() {
    if (this.data.saving) return;
    const error = this.validateCustom();
    if (error) {
      this.setData({ formError: error });
      return;
    }

    const form = this.data.form;
    const per100g = {
      kcal: numberOrZero(form.kcal),
      protein: numberOrZero(form.protein),
      carbs: numberOrZero(form.carbs),
      fat: numberOrZero(form.fat),
      fiber: numberOrZero(form.fiber)
    };
    const portions = [];
    if (form.portionLabel.trim() && form.portionGrams) {
      portions.push({
        label: form.portionLabel.trim(),
        grams: numberOrZero(form.portionGrams)
      });
    }
    const payload = {
      name: form.name.trim(),
      emoji: form.emoji.trim() || "🍽️",
      category: form.category,
      per100g,
      portions
    };

    const editingId = this.data.editingId;
    this.setData({ saving: true, formError: "" });
    wx.showLoading({ title: "正在保存…", mask: true });
    api
      .saveCustomFood(payload, editingId || null)
      .then(() => {
        wx.hideLoading();
        // 新建后清空筛选，保证刚保存的食物立刻出现在列表里。
        const nextQuery = editingId ? this.data.query : "";
        this.setData({
          saving: false,
          showEditor: false,
          editingId: "",
          query: nextQuery
        });
        wx.showToast({ title: "已保存", icon: "success" });
        this.loadFoods(nextQuery);
        this.loadRecent();
      })
      .catch((reason) => {
        wx.hideLoading();
        this.setData({ saving: false, formError: reason.message || "保存失败" });
      });
  },

  onDeleteCustom() {
    const id = this.data.editingId;
    if (!id) return;
    wx.showModal({
      title: "删除自定义食物",
      content: `确定删除「${this.data.editingName || "这个食物"}」吗？已经保存的饮食记录不会受影响。`,
      confirmText: "删除",
      confirmColor: "#ED6B4C",
      success: (result) => {
        if (!result.confirm) return;
        wx.showLoading({ title: "正在删除…", mask: true });
        api
          .deleteCustomFood(id)
          .then(() => {
            wx.hideLoading();
            this.setData({
              saving: false,
              showEditor: false,
              editingId: "",
              editingName: ""
            });
            wx.showToast({ title: "已删除", icon: "success" });
            this.loadFoods(this.data.query);
            this.loadRecent();
          })
          .catch((reason) => {
            wx.hideLoading();
            this.setData({ formError: reason.message || "删除失败" });
          });
      }
    });
  },

  onShareAppMessage() {
    return {
      title: "食刻 · 拍一张，吃明白",
      path: "/pages/home/index"
    };
  }
});
