const api = require("../../utils/api");
const bodyUtil = require("../../utils/body");
const format = require("../../utils/format");
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

const DEFAULT_TARGETS = { kcal: 1800, protein: 110, carbs: 190, fat: 55, fiber: 25 };

function numberOrNull(value) {
  if (value === "" || value === null || value === undefined) return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function bodyFromData(data) {
  return {
    sex: data.sex || null,
    age: numberOrNull(data.age),
    heightCm: numberOrNull(data.heightCm),
    weightKg: numberOrNull(data.weightKg),
    activityLevel: data.activityLevel || null
  };
}

function weightView(weights) {
  const data = weights || {};
  const latest = data.latest || null;
  return {
    weightLatest: latest ? Number(latest.weightKg).toFixed(1) : "",
    weightSummary: latest
      ? data.recordedThisWeek
        ? "本周已记录 · " + format.friendlyDate(latest.date)
        : "上次 " + format.friendlyDate(latest.date)
      : "记录第一笔体重"
  };
}

function goalOptions(selected, body) {
  const complete = body && bodyUtil.isComplete(body);
  return GOAL_OPTIONS.map((goal) => {
    let kcal = GOAL_TARGETS[goal.id].kcal;
    if (complete) {
      kcal = bodyUtil.computeTargets(body, goal.id).targets.kcal;
    }
    return Object.assign({}, goal, {
      active: goal.id === selected,
      kcal
    });
  });
}

Page({
  data: {
    loading: true,
    name: "食刻用户",
    avatar: "食",
    goal: "fat-loss",
    targets: DEFAULT_TARGETS,
    goals: goalOptions("fat-loss", null),
    saving: false,
    error: "",
    accountLabel: "设备模式",
    macroPercent: 94,
    sex: "",
    age: "",
    heightCm: "",
    weightKg: "",
    activityLevel: "",
    bodyComplete: false,
    bmr: 0,
    tdee: 0,
    targetsMode: "manual",
    activityOptions: bodyUtil.ACTIVITY_OPTIONS,
    weightLatest: "",
    weightSummary: "记录第一笔体重"
  },

  onLoad() {
    this._dirty = false;
    this.loadProfile();
  },

  onShow() {
    // 有未保存修改时只同步体重，避免覆盖用户正在编辑的其他字段。
    if (!this._loaded) return;
    if (this._dirty) {
      const profile = getApp().globalData.profile;
      if (profile && profile.weightKg !== undefined) {
        this.setData({ weightKg: profile.weightKg });
      }
      this.loadWeightEntry();
      return;
    }
    this.loadProfile();
  },

  loadWeightEntry() {
    return api
      .getWeights()
      .then((weights) => this.setData(weightView(weights)))
      .catch(() => {});
  },

  onPullDownRefresh() {
    this.loadProfile().then(() => wx.stopPullDownRefresh());
  },

  loadProfile() {
    const app = getApp();
    return app
      .ready()
      .then(() =>
        Promise.all([
          api.getProfile(),
          api.getMeta(),
          api.getWeights().catch(() => null)
        ])
      )
      .then((results) => {
        const profile = results[0].profile;
        const meta = results[1];
        const weights = results[2] || {};
        app.globalData.profile = profile;
        const targets = profile.targets || DEFAULT_TARGETS;
        const body = {
          sex: profile.sex,
          age: profile.age,
          heightCm: profile.heightCm,
          weightKg: profile.weightKg,
          activityLevel: profile.activityLevel
        };
        const complete = bodyUtil.isComplete(body);
        const metrics = complete ? bodyUtil.metrics(body) : null;
        const weight = weightView(weights);
        this.setData({
          loading: false,
          name: profile.name || "食刻用户",
          avatar: (profile.name || "食刻用户").slice(0, 1),
          goal: profile.goal || "fat-loss",
          targets,
          goals: goalOptions(profile.goal || "fat-loss", complete ? body : null),
          accountLabel: api.getToken()
            ? "微信账号已连接"
            : meta.wechatEnabled
              ? "设备模式 · 微信登录未完成"
              : "设备模式",
          macroPercent: this.macroPercent(targets),
          sex: profile.sex || "",
          age: profile.age === null || profile.age === undefined ? "" : profile.age,
          heightCm:
            profile.heightCm === null || profile.heightCm === undefined
              ? ""
              : profile.heightCm,
          weightKg:
            profile.weightKg === null || profile.weightKg === undefined
              ? ""
              : profile.weightKg,
          activityLevel: profile.activityLevel || "",
          bodyComplete: complete,
          bmr: profile.bmr || (metrics ? metrics.bmr : 0),
          tdee: profile.tdee || (metrics ? metrics.tdee : 0),
          targetsMode: profile.targetsMode === "auto" ? "auto" : "manual",
          weightLatest: weight.weightLatest,
          weightSummary: weight.weightSummary
        });
        this._loaded = true;
        this._dirty = false;
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

  refreshBody() {
    const body = bodyFromData(this.data);
    const complete = bodyUtil.isComplete(body);
    const patch = {
      bodyComplete: complete,
      goals: goalOptions(this.data.goal, complete ? body : null)
    };

    if (complete) {
      const metrics = bodyUtil.metrics(body);
      patch.bmr = metrics.bmr;
      patch.tdee = metrics.tdee;
      if (this.data.targetsMode === "auto") {
        const plan = bodyUtil.computeTargets(body, this.data.goal);
        patch.targets = plan.targets;
        patch.macroPercent = this.macroPercent(plan.targets);
      }
    } else {
      patch.bmr = 0;
      patch.tdee = 0;
    }

    this.setData(patch);
  },

  onNameInput(event) {
    const name = event.detail.value;
    this._dirty = true;
    this.setData({ name, avatar: name.slice(0, 1) || "食", error: "" });
  },

  onBodyInput(event) {
    const key = event.currentTarget.dataset.key;
    const raw = event.detail.value;
    const value = raw === "" ? "" : Number(raw);
    if (raw !== "" && !Number.isFinite(value)) return;
    this._dirty = true;
    this.setData({ [key]: value, error: "" }, () => this.refreshBody());
  },

  chooseSex(event) {
    this._dirty = true;
    this.setData({ sex: event.currentTarget.dataset.value, error: "" }, () =>
      this.refreshBody()
    );
  },

  chooseActivity(event) {
    this._dirty = true;
    this.setData(
      { activityLevel: event.currentTarget.dataset.id, error: "" },
      () => this.refreshBody()
    );
  },

  goWeight() {
    wx.navigateTo({ url: "/pages/weight/index" });
  },

  chooseGoal(event) {
    const goal = event.currentTarget.dataset.id;
    this._dirty = true;
    const body = bodyFromData(this.data);
    const complete = bodyUtil.isComplete(body);
    const targets = complete
      ? bodyUtil.computeTargets(body, goal).targets
      : GOAL_TARGETS[goal];
    this.setData({
      goal,
      targets,
      goals: goalOptions(goal, complete ? body : null),
      targetsMode: complete ? "auto" : "manual",
      macroPercent: this.macroPercent(targets),
      error: ""
    });
  },

  onTargetInput(event) {
    const key = event.currentTarget.dataset.key;
    const raw = event.detail.value;
    const value = raw === "" ? 0 : Number(raw);
    if (!Number.isFinite(value)) return;
    this._dirty = true;
    const targets = Object.assign({}, this.data.targets, { [key]: value });
    this.setData({
      targets,
      targetsMode: "manual",
      macroPercent: this.macroPercent(targets),
      error: ""
    });
  },

  recalculate() {
    const body = bodyFromData(this.data);
    if (!bodyUtil.isComplete(body)) {
      wx.showToast({ title: "请先填完身体数据", icon: "none" });
      return;
    }
    this._dirty = true;
    const plan = bodyUtil.computeTargets(body, this.data.goal);
    this.setData({
      targets: plan.targets,
      bmr: plan.bmr,
      tdee: plan.tdee,
      targetsMode: "auto",
      macroPercent: this.macroPercent(plan.targets),
      error: ""
    });
    wx.showToast({ title: "已按身体数据计算", icon: "none" });
  },

  resetTargets() {
    const body = bodyFromData(this.data);
    this._dirty = true;
    if (bodyUtil.isComplete(body)) {
      const plan = bodyUtil.computeTargets(body, this.data.goal);
      this.setData({
        targets: plan.targets,
        targetsMode: "auto",
        macroPercent: this.macroPercent(plan.targets),
        error: ""
      });
      return;
    }
    const targets = GOAL_TARGETS[this.data.goal] || DEFAULT_TARGETS;
    this.setData({
      targets,
      targetsMode: "manual",
      macroPercent: this.macroPercent(targets),
      error: ""
    });
  },

  validate() {
    if (!this.data.name.trim()) return "给自己一个称呼吧";
    const body = bodyFromData(this.data);
    const hasBodyInput =
      Boolean(this.data.sex) ||
      this.data.age !== "" ||
      this.data.heightCm !== "" ||
      this.data.weightKg !== "" ||
      Boolean(this.data.activityLevel);
    if (hasBodyInput && !bodyUtil.isComplete(body)) {
      return "请把身体数据填写完整（年龄 18–80 岁，身高 120–230cm，体重 30–250kg）";
    }
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

    const payload = {
      name: this.data.name.trim(),
      goal: this.data.goal,
      sex: this.data.sex || null,
      age: numberOrNull(this.data.age),
      heightCm: numberOrNull(this.data.heightCm),
      weightKg: numberOrNull(this.data.weightKg),
      activityLevel: this.data.activityLevel || null
    };
    if (this.data.targetsMode === "auto" && this.data.bodyComplete) {
      payload.recalculate = true;
    } else {
      payload.targets = this.data.targets;
    }

    api
      .updateProfile(payload)
      .then((result) => {
        wx.hideLoading();
        const profile = result.profile;
        this._dirty = false;
        getApp().globalData.profile = profile;
        const complete = bodyUtil.isComplete({
          sex: profile.sex,
          age: profile.age,
          heightCm: profile.heightCm,
          weightKg: profile.weightKg,
          activityLevel: profile.activityLevel
        });
        this.setData({
          saving: false,
          targets: profile.targets,
          targetsMode: profile.targetsMode,
          bmr: profile.bmr || 0,
          tdee: profile.tdee || 0,
          bodyComplete: complete,
          goals: goalOptions(profile.goal, complete ? profile : null),
          macroPercent: this.macroPercent(profile.targets)
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
