const api = require("../../utils/api");
const { GOAL_TARGETS } = require("../../utils/constants");

const GOAL_OPTIONS = [
  {
    id: "fat-loss",
    label: "减脂",
    icon: "◒",
    description: "温和热量缺口，优先保住肌肉与饱腹感。"
  },
  {
    id: "maintain",
    label: "维持",
    icon: "◐",
    description: "找到能量平衡，让体重和精力都稳定下来。"
  },
  {
    id: "muscle",
    label: "增肌",
    icon: "◓",
    description: "小幅盈余，给训练和恢复足够的原料。"
  }
];

function goalOptions(selected) {
  return GOAL_OPTIONS.map((goal) =>
    Object.assign({}, goal, {
      active: goal.id === selected,
      kcal: GOAL_TARGETS[goal.id].kcal
    })
  );
}

const DEFAULT_TARGETS = { kcal: 1800, protein: 110, carbs: 190, fat: 55, fiber: 25 };

Page({
  data: {
    loading: true,
    name: "食刻用户",
    avatar: "食",
    goal: "fat-loss",
    targets: DEFAULT_TARGETS,
    goals: goalOptions("fat-loss"),
    saving: false,
    error: "",
    accountLabel: "设备模式",
    macroPercent: 94
  },

  onLoad() {
    this.loadProfile();
  },

  onPullDownRefresh() {
    this.loadProfile().then(() => wx.stopPullDownRefresh());
  },

  loadProfile() {
    const app = getApp();
    return app
      .ready()
      .then(() => Promise.all([api.getProfile(), api.getMeta()]))
      .then((results) => {
        const profile = results[0].profile;
        const meta = results[1];
        app.globalData.profile = profile;
        const targets = profile.targets || DEFAULT_TARGETS;
        this.setData({
          loading: false,
          name: profile.name || "食刻用户",
          avatar: (profile.name || "食刻用户").slice(0, 1),
          goal: profile.goal || "fat-loss",
          targets,
          goals: goalOptions(profile.goal || "fat-loss"),
          accountLabel: api.getToken()
            ? "微信账号已连接"
            : meta.wechatEnabled
              ? "设备模式 · 微信登录未完成"
              : "设备模式",
          macroPercent: this.macroPercent(targets)
        });
      })
      .catch((error) => {
        this.setData({ loading: false });
        wx.showToast({ title: error.message || "目标加载失败", icon: "none" });
      });
  },

  macroPercent(targets) {
    const kcal = targets.protein * 4 + targets.carbs * 4 + targets.fat * 9;
    return targets.kcal > 0 ? Math.round((kcal / targets.kcal) * 100) : 0;
  },

  onNameInput(event) {
    const name = event.detail.value;
    this.setData({ name, avatar: name.slice(0, 1) || "食", error: "" });
  },

  chooseGoal(event) {
    const goal = event.currentTarget.dataset.id;
    const targets = GOAL_TARGETS[goal];
    this.setData({
      goal,
      targets,
      goals: goalOptions(goal),
      macroPercent: this.macroPercent(targets),
      error: ""
    });
  },

  onTargetInput(event) {
    const key = event.currentTarget.dataset.key;
    const raw = event.detail.value;
    const value = raw === "" ? 0 : Number(raw);
    if (!Number.isFinite(value)) return;
    const targets = Object.assign({}, this.data.targets, { [key]: value });
    this.setData({
      targets,
      macroPercent: this.macroPercent(targets),
      error: ""
    });
  },

  resetTargets() {
    const targets = GOAL_TARGETS[this.data.goal] || DEFAULT_TARGETS;
    this.setData({
      targets,
      macroPercent: this.macroPercent(targets),
      error: ""
    });
  },

  validate() {
    if (!this.data.name.trim()) return "给自己一个称呼吧";
    const limits = {
      kcal: [800, 5000, "每日热量"],
      protein: [30, 300, "蛋白质"],
      carbs: [30, 600, "碳水"],
      fat: [15, 200, "脂肪"],
      fiber: [10, 80, "膳食纤维"]
    };
    const keys = Object.keys(limits);
    for (let i = 0; i < keys.length; i += 1) {
      const key = keys[i];
      const value = Number(this.data.targets[key]);
      const rule = limits[key];
      if (!Number.isFinite(value) || value < rule[0] || value > rule[1]) {
        return `${rule[2]}需要在 ${rule[0]}–${rule[1]} 之间`;
      }
    }
    const macroKcal =
      this.data.targets.protein * 4 +
      this.data.targets.carbs * 4 +
      this.data.targets.fat * 9;
    if (macroKcal < this.data.targets.kcal * 0.7 || macroKcal > this.data.targets.kcal * 1.3) {
      return "三大营养素热量之和与总热量差距过大，请再检查一下";
    }
    return "";
  },

  onSave() {
    if (this.data.saving) return;
    const error = this.validate();
    if (error) {
      this.setData({ error });
      wx.showToast({ title: error, icon: "none" });
      return;
    }

    this.setData({ saving: true, error: "" });
    wx.showLoading({ title: "正在保存…", mask: true });
    api
      .updateProfile({
        name: this.data.name.trim(),
        goal: this.data.goal,
        targets: this.data.targets
      })
      .then((result) => {
        wx.hideLoading();
        getApp().globalData.profile = result.profile;
        this.setData({
          saving: false,
          targets: result.profile.targets,
          macroPercent: this.macroPercent(result.profile.targets)
        });
        wx.showToast({ title: "目标已更新", icon: "success" });
      })
      .catch((reason) => {
        wx.hideLoading();
        this.setData({ saving: false, error: reason.message || "保存失败" });
        wx.showToast({ title: reason.message || "保存失败", icon: "none" });
      });
  }
});
