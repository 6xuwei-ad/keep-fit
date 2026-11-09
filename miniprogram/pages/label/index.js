const api = require("../../utils/api");
const format = require("../../utils/format");
const nutrition = require("../../utils/nutrition");
const { MEAL_TYPES, MEAL_TYPE_LABELS } = require("../../utils/constants");

const EMPTY_NUTRITION = { kcal: 0, protein: 0, carbs: 0, fat: 0, fiber: 0 };

function mealTypeOptions(selected) {
  return MEAL_TYPES.map((id) => ({
    id,
    label: MEAL_TYPE_LABELS[id],
    active: id === selected
  }));
}

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
      quality: 82,
      success(result) {
        resolve(result.tempFilePath || filePath);
      },
      fail() {
        resolve(filePath);
      }
    });
  });
}

function numberOrZero(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

Page({
  data: {
    result: null,
    analyzing: false,
    saving: false,
    error: "",
    imageUrl: "",
    labelImageUrl: "",
    productName: "",
    basisText: "每 100g",
    servingSize: 100,
    servingUnit: "g",
    intakeUnit: "g",
    confidence: 0.8,
    confidencePct: 80,
    notice: "",
    per100g: { kcal: "", protein: "", carbs: "", fat: "", fiber: "" },
    grams: "100",
    total: EMPTY_NUTRITION,
    nutritionText: "",
    mealType: "lunch",
    mealTypes: mealTypeOptions("lunch")
  },

  onCamera() {
    this.pickPhoto("camera");
  },

  onAlbum() {
    this.pickPhoto("album");
  },

  pickPhoto(source) {
    if (this.data.analyzing) return;
    choosePhoto(source)
      .then((filePath) => {
        if (filePath) return this.analyze(filePath);
        return null;
      })
      .catch((error) => {
        wx.showToast({ title: error.message || "无法打开相机", icon: "none" });
      });
  },

  analyze(filePath) {
    this.setData({ analyzing: true, error: "" });
    wx.showLoading({ title: "正在读取标签…", mask: true });
    return compressPhoto(filePath)
      .then((compressed) => api.analyzeLabel(compressed))
      .then((result) => {
        wx.hideLoading();
        const label = result && result.label;
        if (!label || !label.per100g) {
          throw new Error("没有识别到营养成分表");
        }
        const per100g = label.per100g;
        const intakeUnit = label.basis === "100ml" ? "ml" : "g";
        this.setData(
          {
            analyzing: false,
            result: label,
            imageUrl: api.assetUrl(label.imageUrl),
            labelImageUrl: label.imageUrl || "",
            productName: label.productName || "包装食品",
            basisText: label.basis === "100ml" ? "每 100ml" : "每 100g",
            servingSize: label.servingSize || 100,
            servingUnit: label.servingUnit || "g",
            intakeUnit,
            confidence: label.confidence || 0.8,
            confidencePct: Math.round((label.confidence || 0.8) * 100),
            notice: label.notice || "",
            per100g: {
              kcal: String(per100g.kcal),
              protein: String(per100g.protein),
              carbs: String(per100g.carbs),
              fat: String(per100g.fat),
              fiber: String(per100g.fiber)
            },
            grams: String(label.servingSize || 100)
          },
          () => this.recalc()
        );
      })
      .catch((error) => {
        wx.hideLoading();
        this.setData({ analyzing: false, error: error.message || "标签识别失败" });
        wx.showModal({
          title: "标签没有读出来",
          content:
            (error.message || "请换一张更清晰的照片") +
            "\n\n可以重新拍，或到「添加食物」里手动填写。",
          showCancel: false
        });
      });
  },

  recalc() {
    const values = {
      kcal: numberOrZero(this.data.per100g.kcal),
      protein: numberOrZero(this.data.per100g.protein),
      carbs: numberOrZero(this.data.per100g.carbs),
      fat: numberOrZero(this.data.per100g.fat),
      fiber: numberOrZero(this.data.per100g.fiber)
    };
    const grams = numberOrZero(this.data.grams);
    const total = nutrition.scale(values, grams);
    this.setData({
      total,
      nutritionText: `${Math.round(total.kcal)} kcal · 蛋白 ${nutrition.round(
        total.protein
      )}g · 碳水 ${nutrition.round(total.carbs)}g · 脂肪 ${nutrition.round(
        total.fat
      )}g`
    });
  },

  onNameInput(event) {
    this.setData({ productName: event.detail.value });
  },

  onNutrientInput(event) {
    const key = event.currentTarget.dataset.key;
    this.setData({ [`per100g.${key}`]: event.detail.value }, () => this.recalc());
  },

  onGramsInput(event) {
    this.setData({ grams: event.detail.value }, () => this.recalc());
  },

  onUseServing() {
    this.setData({ grams: String(this.data.servingSize || 100) }, () => this.recalc());
  },

  onMealType(event) {
    const mealType = event.currentTarget.dataset.type;
    this.setData({ mealType, mealTypes: mealTypeOptions(mealType) });
  },

  onReset() {
    this.setData({
      result: null,
      analyzing: false,
      saving: false,
      error: "",
      imageUrl: "",
      labelImageUrl: "",
      productName: "",
      per100g: { kcal: "", protein: "", carbs: "", fat: "", fiber: "" },
      grams: "100",
      total: EMPTY_NUTRITION,
      nutritionText: "",
      notice: "",
      confidence: 0.8,
      confidencePct: 80
    });
  },

  validate() {
    const name = this.data.productName.trim();
    if (!name) return "先给这个食品起个名字";
    const values = {
      kcal: numberOrZero(this.data.per100g.kcal),
      protein: numberOrZero(this.data.per100g.protein),
      carbs: numberOrZero(this.data.per100g.carbs),
      fat: numberOrZero(this.data.per100g.fat),
      fiber: numberOrZero(this.data.per100g.fiber)
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
      const rule = limits[key];
      if (values[key] < rule[0] || values[key] > rule[1]) {
        return `${rule[2]}需要在 ${rule[0]}–${rule[1]} 之间`;
      }
    }
    const grams = numberOrZero(this.data.grams);
    if (grams < 1 || grams > 3000) return "实际吃下的量需要在 1–3000 之间";
    return "";
  },

  saveCustomFood(payload) {
    return api.saveCustomFood(payload).catch((error) => {
      if (error.code !== "CUSTOM_FOOD_EXISTS") throw error;
      return api.getCustomFoods().then((result) => {
        const found = (result.foods || []).find(
          (food) => food.name.trim() === payload.name
        );
        if (!found) throw error;
        return api.saveCustomFood(payload, found.id);
      });
    });
  },

  onSave() {
    if (this.data.saving) return;
    const error = this.validate();
    if (error) {
      this.setData({ error });
      wx.showToast({ title: error, icon: "none" });
      return;
    }

    const values = {
      kcal: numberOrZero(this.data.per100g.kcal),
      protein: numberOrZero(this.data.per100g.protein),
      carbs: numberOrZero(this.data.per100g.carbs),
      fat: numberOrZero(this.data.per100g.fat),
      fiber: numberOrZero(this.data.per100g.fiber)
    };
    const grams = Math.round(numberOrZero(this.data.grams));
    const name = this.data.productName.trim();
    const portion =
      this.data.servingSize > 0
        ? { label: "一份", grams: this.data.servingSize }
        : null;

    this.setData({ saving: true, error: "" });
    wx.showLoading({ title: "正在记录…", mask: true });

    this.saveCustomFood({
      name,
      emoji: "🏷️",
      category: "other",
      per100g: values,
      portions: portion ? [portion] : []
    })
      .then((result) => {
        const food = result.food;
        return api.saveMeal({
          name,
          mealType: this.data.mealType,
          date: format.dateKey(),
          eatenAt: new Date().toISOString(),
          imageUrl: this.data.labelImageUrl || null,
          engine: this.data.result.engine || "营养标签 OCR",
          items: [
            {
              foodId: food.id,
              name,
              emoji: "🏷️",
              category: "other",
              grams,
              confidence: this.data.confidence || 0.8,
              portionHint: portion ? `一份 · ${portion.grams}g` : "包装标签",
              per100g: food.per100g
            }
          ]
        });
      })
      .then((result) => {
        wx.hideLoading();
        this.setData({ saving: false });
        getApp().globalData.lastSaved = result.meal;
        wx.showToast({ title: "已加入今日饮食", icon: "success" });
        setTimeout(() => {
          wx.switchTab({ url: "/pages/journal/index" });
        }, 650);
      })
      .catch((reason) => {
        wx.hideLoading();
        this.setData({ saving: false, error: reason.message || "保存失败" });
        wx.showModal({
          title: "记录失败",
          content: reason.message || "请检查网络后再试",
          showCancel: false
        });
      });
  }
});
