const api = require("../../utils/api");
const format = require("../../utils/format");
const { GOAL_LABELS } = require("../../utils/constants");

const EMPTY_SUMMARY = {
  date: "",
  totals: { kcal: 0, protein: 0, carbs: 0, fat: 0, fiber: 0 },
  targets: { kcal: 1800, protein: 110, carbs: 190, fat: 55, fiber: 25 },
  remaining: { kcal: 1800, protein: 110, carbs: 190, fat: 55, fiber: 25 },
  caloriePercent: 0,
  meals: [],
  advice: []
};

function choosePhoto(sourceType) {
  return new Promise((resolve, reject) => {
    if (wx.chooseMedia) {
      wx.chooseMedia({
        count: 1,
        mediaType: ["image"],
        sourceType: [sourceType],
        sizeType: ["compressed"],
        success(result) {
          const file = result.tempFiles && result.tempFiles[0];
          if (file && file.tempFilePath) resolve(file.tempFilePath);
          else reject(new Error("没有选择照片"));
        },
        fail(error) {
          if (String(error.errMsg || "").indexOf("cancel") >= 0) resolve("");
          else reject(error);
        }
      });
      return;
    }

    wx.chooseImage({
      count: 1,
      sourceType: [sourceType],
      sizeType: ["compressed"],
      success(result) {
        resolve(result.tempFilePaths[0]);
      },
      fail(error) {
        if (String(error.errMsg || "").indexOf("cancel") >= 0) resolve("");
        else reject(error);
      }
    });
  });
}

function compressPhoto(filePath) {
  return new Promise((resolve) => {
    if (!wx.compressImage) {
      resolve(filePath);
      return;
    }
    wx.compressImage({
      src: filePath,
      quality: 78,
      success(result) {
        resolve(result.tempFilePath || filePath);
      },
      fail() {
        resolve(filePath);
      }
    });
  });
}

function formatMeal(meal) {
  return {
    id: meal.id,
    name: meal.name,
    image: api.assetUrl(meal.imageUrl),
    emoji: (meal.items && meal.items[0] && meal.items[0].emoji) || "🍽️",
    time: format.clock(meal.eatenAt),
    typeLabel: {
      breakfast: "早餐",
      lunch: "午餐",
      dinner: "晚餐",
      snack: "加餐"
    }[meal.mealType] || "加餐",
    kcal: Math.round(meal.totals.kcal),
    protein: Math.round(meal.totals.protein)
  };
}

Page({
  data: {
    greeting: "晚上好",
    loading: true,
    meta: { visionEnabled: true, wechatEnabled: false },
    profile: { name: "食刻用户", goal: "fat-loss" },
    goalLabel: "减脂",
    summary: EMPTY_SUMMARY,
    homeAdvice: [],
    recent: [],
    remainingText: "1800",
    isOver: false,
    dateText: "今天",
    mealCount: 0,
    todayNote: "今天还没有记录。第一张照片，就是更清楚饮食的开始。"
  },

  onLoad() {
    this.setData({ greeting: format.greeting() });
  },

  onShow() {
    this.setData({ greeting: format.greeting() });
    this.loadData();

    const app = getApp();
    if (app.globalData.openCameraOnHome) {
      app.globalData.openCameraOnHome = false;
      setTimeout(() => this.takePhoto("camera"), 320);
    }
  },

  onPullDownRefresh() {
    this.loadData(true).then(() => wx.stopPullDownRefresh());
  },

  loadData(silent) {
    const app = getApp();
    const today = format.dateKey();
    if (!silent) this.setData({ loading: true });

    return app
      .ready()
      .then(() => Promise.all([api.getDay(today), api.getMeta()]))
      .then((results) => {
        const day = results[0];
        const meta = results[1];
        const app = getApp();
        if (day.profile) app.globalData.profile = day.profile;
        const summary = day.summary || EMPTY_SUMMARY;
        const totals = summary.totals || EMPTY_SUMMARY.totals;
        const remaining = summary.remaining || EMPTY_SUMMARY.remaining;
        const meals = (summary.meals || []).map(formatMeal);
        const remainingKcal = Math.round(remaining.kcal);
        const percent = summary.caloriePercent || 0;
        let todayNote = "今天还没有记录。第一张照片，就是更清楚饮食的开始。";
        if (meals.length > 0) {
          if (percent >= 100) todayNote = "今天的目标基本达成，晚些时候清淡一点就好。";
          else if (percent >= 60) todayNote = "接近今天的节奏了，接下来优先蔬菜和蛋白质。";
          else todayNote = "节奏还很宽裕，下一餐记得把蛋白质吃够。";
        }

        this.setData({
          loading: false,
          meta: meta || this.data.meta,
          profile: day.profile || this.data.profile,
          goalLabel: GOAL_LABELS[(day.profile && day.profile.goal) || "fat-loss"] || "减脂",
          summary: {
            date: summary.date || today,
            totals,
            targets: summary.targets || EMPTY_SUMMARY.targets,
            remaining,
            caloriePercent: summary.caloriePercent || 0,
            meals: summary.meals || [],
            advice: summary.advice || []
          },
          homeAdvice: (summary.advice || []).slice(0, 2),
          recent: meals.slice(-3).reverse(),
          remainingText: String(Math.abs(remainingKcal)),
          isOver: remainingKcal < 0,
          dateText: format.friendlyDate(summary.date || today),
          mealCount: (summary.meals || []).length,
          todayNote
        });
      })
      .catch((error) => {
        this.setData({ loading: false });
        wx.showToast({ title: error.message || "加载失败", icon: "none" });
      });
  },

  takePhoto(source) {
    choosePhoto(source)
      .then((filePath) => {
        if (!filePath) return null;
        return this.analyzeFile(filePath);
      })
      .catch((error) => {
        wx.showToast({ title: error.message || "无法打开相机", icon: "none" });
      });
  },

  onCamera() {
    this.takePhoto("camera");
  },

  onAlbum() {
    this.takePhoto("album");
  },

  analyzeFile(filePath) {
    wx.showLoading({ title: "正在看懂这一餐…", mask: true });
    return compressPhoto(filePath)
      .then((compressed) => api.analyzeImage(compressed))
      .then((result) => this.openReview(result))
      .catch((error) => {
        wx.hideLoading();
        wx.showModal({
          title: "识别失败",
          content: error.message || "请换一张照片再试",
          showCancel: false
        });
      });
  },

  onDemo() {
    wx.showLoading({ title: "准备示例餐盘…", mask: true });
    api
      .analyzeDemo()
      .then((result) => this.openReview(result))
      .catch((error) => {
        wx.hideLoading();
        wx.showToast({ title: error.message || "示例加载失败", icon: "none" });
      });
  },

  openReview(result) {
    wx.hideLoading();
    if (!result || !result.analysis) {
      wx.showToast({ title: "没有识别到食物", icon: "none" });
      return;
    }
    const app = getApp();
    app.globalData.analysis = result.analysis;
    app.globalData.suggestedMealType = result.suggestedMealType || "lunch";
    wx.navigateTo({ url: "/pages/review/index" });
  },

  onShareAppMessage() {
    return {
      title: "食刻 · 拍一张，吃明白",
      path: "/pages/home/index"
    };
  }
});
