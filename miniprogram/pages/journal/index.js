const api = require("../../utils/api");
const format = require("../../utils/format");
const { GOAL_LABELS, MEAL_TYPE_LABELS } = require("../../utils/constants");

function formatMeal(meal) {
  return {
    id: meal.id,
    name: meal.name,
    image: api.assetUrl(meal.imageUrl),
    emoji: (meal.items && meal.items[0] && meal.items[0].emoji) || "🍽️",
    typeLabel: MEAL_TYPE_LABELS[meal.mealType] || "加餐",
    time: format.clock(meal.eatenAt),
    itemCount: (meal.items || []).length,
    itemsText: (meal.items || []).map((item) => item.name).join(" · "),
    kcal: Math.round(meal.totals.kcal),
    protein: Math.round(meal.totals.protein),
    carbs: Math.round(meal.totals.carbs),
    fat: Math.round(meal.totals.fat)
  };
}

Page({
  data: {
    date: "",
    dateText: "",
    fullDate: "",
    isToday: true,
    nextDisabled: true,
    loading: true,
    showLoading: true,
    showEmpty: false,
    summary: null,
    meals: [],
    advice: [],
    goalLabel: "减脂",
    mealCount: 0
  },

  onLoad() {
    const today = format.dateKey();
    this.setData({
      date: today,
      dateText: format.friendlyDate(today),
      fullDate: format.formatDate(today),
      isToday: true,
      nextDisabled: true
    });
  },

  onShow() {
    const app = getApp();
    if (app.globalData.lastSaved) {
      const saved = app.globalData.lastSaved;
      app.globalData.lastSaved = null;
      wx.showToast({
        title: `${saved.name} 已记录`,
        icon: "none"
      });
    }
    this.loadDay(this.data.date || format.dateKey());
  },

  onPullDownRefresh() {
    this.loadDay(this.data.date).then(() => wx.stopPullDownRefresh());
  },

  loadDay(date) {
    const app = getApp();
    this.setData({ loading: true, showLoading: !this.data.summary, showEmpty: false });
    return app
      .ready()
      .then(() => api.getDay(date))
      .then((result) => {
        const summary = result.summary || {};
        const profile = result.profile || {};
        const today = format.dateKey();
        this.setData({
          loading: false,
          showLoading: false,
          showEmpty: (summary.meals || []).length === 0,
          date: summary.date || date,
          dateText: format.friendlyDate(summary.date || date),
          fullDate: format.formatDate(summary.date || date),
          isToday: (summary.date || date) === today,
          nextDisabled: (summary.date || date) >= today,
          summary: {
            totals: summary.totals || { kcal: 0, protein: 0, carbs: 0, fat: 0, fiber: 0 },
            targets: summary.targets || { kcal: 1800, protein: 110, carbs: 190, fat: 55, fiber: 25 },
            remaining: summary.remaining || { kcal: 1800 },
            caloriePercent: summary.caloriePercent || 0
          },
          meals: (summary.meals || []).map(formatMeal),
          advice: summary.advice || [],
          goalLabel: GOAL_LABELS[profile.goal] || "减脂",
          mealCount: (summary.meals || []).length
        });
        if (profile) app.globalData.profile = profile;
      })
      .catch((error) => {
        this.setData({ loading: false, showLoading: false });
        wx.showToast({ title: error.message || "日记加载失败", icon: "none" });
      });
  },

  goPrev() {
    const next = format.shiftDateKey(this.data.date, -1);
    this.setData({
      date: next,
      dateText: format.friendlyDate(next),
      fullDate: format.formatDate(next)
    });
    this.loadDay(next);
  },

  goNext() {
    if (this.data.nextDisabled) return;
    const next = format.shiftDateKey(this.data.date, 1);
    this.setData({
      date: next,
      dateText: format.friendlyDate(next),
      fullDate: format.formatDate(next)
    });
    this.loadDay(next);
  },

  goToday() {
    const today = format.dateKey();
    this.setData({
      date: today,
      dateText: format.friendlyDate(today),
      fullDate: format.formatDate(today)
    });
    this.loadDay(today);
  },

  onRecord() {
    getApp().globalData.openCameraOnHome = true;
    wx.switchTab({ url: "/pages/home/index" });
  },

  onDelete(event) {
    const id = event.currentTarget.dataset.id;
    const name = event.currentTarget.dataset.name || "这条记录";
    wx.showModal({
      title: "删除记录",
      content: `确定删除「${name}」吗？删除后无法恢复。`,
      confirmText: "删除",
      confirmColor: "#ED6B4C",
      success: (result) => {
        if (!result.confirm) return;
        wx.showLoading({ title: "正在删除…", mask: true });
        api
          .deleteMeal(id)
          .then(() => {
            wx.hideLoading();
            wx.showToast({ title: "已删除", icon: "success" });
            this.loadDay(this.data.date);
          })
          .catch((error) => {
            wx.hideLoading();
            wx.showToast({ title: error.message || "删除失败", icon: "none" });
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
