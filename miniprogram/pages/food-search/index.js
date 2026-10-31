const api = require("../../utils/api");
const { CATEGORY_LABELS } = require("../../utils/constants");

Page({
  data: {
    query: "",
    foods: [],
    loading: true,
    error: ""
  },

  onLoad() {
    this.loadFoods("");
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
        const foods = (result.foods || []).map((food) => ({
          id: food.id,
          name: food.name,
          emoji: food.emoji,
          categoryLabel: CATEGORY_LABELS[food.category] || "食物",
          kcal: food.per100g.kcal,
          per100g: food.per100g,
          portions: food.portions,
          category: food.category
        }));
        this.setData({ foods, loading: false });
      })
      .catch((error) => {
        this.setData({ loading: false, error: error.message || "食物库加载失败" });
      });
  },

  onAdd(event) {
    const index = Number(event.currentTarget.dataset.index);
    const food = this.data.foods[index];
    if (!food) return;
    getApp().globalData.pendingFood = food;
    wx.navigateBack();
  },

  onShareAppMessage() {
    return {
      title: "食刻 · 拍一张，吃明白",
      path: "/pages/home/index"
    };
  }
});
