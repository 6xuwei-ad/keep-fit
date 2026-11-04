const api = require("../../utils/api");
const format = require("../../utils/format");

const MIN_WEIGHT = 30;
const MAX_WEIGHT = 250;

function fixed(value) {
  return Number(value).toFixed(1);
}

function dayNumber(key) {
  const parts = String(key).split("-").map(Number);
  return Math.round(Date.UTC(parts[0] || 1970, (parts[1] || 1) - 1, parts[2] || 1) / 86400000);
}

function changeView(change) {
  if (!change) {
    return { text: "再记一次就能看到变化", tone: "muted", arrow: "" };
  }
  if (Math.abs(change.delta) < 0.05) {
    return { text: `与 ${change.days} 天前持平`, tone: "steady", arrow: "→" };
  }
  const sign = change.delta > 0 ? "+" : "";
  return {
    text: `${sign}${fixed(change.delta)} kg · ${change.days} 天前`,
    tone: change.delta > 0 ? "up" : "down",
    arrow: change.delta > 0 ? "↑" : "↓"
  };
}

function formatWeeks(weeks) {
  return (weeks || []).map((week) => ({
    weekStart: week.weekStart,
    weekEnd: week.weekEnd,
    average: week.average,
    averageText: fixed(week.average),
    rangeText: `${format.monthDay(week.weekStart)}–${format.monthDay(week.weekEnd)}`,
    count: week.count
  }));
}

function formatLogs(logs, currentWeekStart) {
  return (logs || [])
    .slice()
    .reverse()
    .map((log) => ({
      id: log.id,
      date: log.date,
      weight: fixed(log.weightKg),
      dateText: format.formatDate(log.date, true),
      thisWeek: log.date >= currentWeekStart
    }));
}

Page({
  data: {
    loading: true,
    saving: false,
    today: "",
    dateInput: "",
    dateInputText: "今天",
    weightInput: "",
    saveNote: "",
    latestWeight: "--",
    latestDateText: "还没有记录",
    changeText: "再记一次就能看到变化",
    changeTone: "muted",
    changeArrow: "",
    weekAverageText: "—",
    weekRangeText: "",
    weeksCount: 0,
    hasWeeks: false,
    recordedThisWeek: false,
    logs: [],
    profile: null
  },

  onLoad() {
    const today = format.dateKey();
    this.chartWeeks = [];
    this.rawLogs = [];
    this.setData({ today, dateInput: today, dateInputText: "今天" });
    this.load();
  },

  onReady() {
    this.drawChart();
  },

  onPullDownRefresh() {
    this.load(true).then(() => wx.stopPullDownRefresh());
  },

  load(silent) {
    if (!silent) this.setData({ loading: true });
    const app = getApp();
    return app
      .ready()
      .then(() => api.getWeights())
      .then((data) => {
        const profile = data.profile || {};
        const latest = data.latest || null;
        const latestWeek = data.latestWeek || null;
        const change = changeView(data.change);
        const today = format.dateKey();
        const fallbackWeight =
          latest && latest.weightKg !== undefined
            ? fixed(latest.weightKg)
            : profile.weightKg !== null && profile.weightKg !== undefined
              ? fixed(profile.weightKg)
              : "";

        this.rawLogs = data.logs || [];
        this.chartWeeks = formatWeeks(data.weeks);

        this.setData(
          {
            loading: false,
            profile,
            today,
            dateInput: today,
            dateInputText: "今天",
            weightInput: fallbackWeight,
            latestWeight: latest ? fixed(latest.weightKg) : "--",
            latestDateText: latest ? format.friendlyDate(latest.date) : "还没有记录",
            changeText: change.text,
            changeTone: change.tone,
            changeArrow: change.arrow,
            weekAverageText: latestWeek ? fixed(latestWeek.average) : "—",
            weekRangeText: latestWeek
              ? `${format.monthDay(latestWeek.weekStart)}–${format.monthDay(latestWeek.weekEnd)}`
              : "",
            weeksCount: this.chartWeeks.length,
            hasWeeks: this.chartWeeks.length > 0,
            recordedThisWeek: Boolean(data.recordedThisWeek),
            logs: formatLogs(data.logs, data.currentWeekStart)
          },
          () => this.drawChart()
        );
      })
      .catch((error) => {
        this.setData({ loading: false });
        wx.showToast({ title: error.message || "体重加载失败", icon: "none" });
      });
  },

  onWeightInput(event) {
    this.setData({ weightInput: event.detail.value, saveNote: "" });
  },

  onDateChange(event) {
    const date = event.detail.value;
    const existing = (this.rawLogs || []).find((log) => log.date === date);
    this.setData({
      dateInput: date,
      dateInputText:
        date === format.dateKey() ? "今天" : format.formatDate(date, true),
      weightInput: existing ? fixed(existing.weightKg) : this.data.weightInput,
      saveNote: ""
    });
  },

  onRecord() {
    if (this.data.saving) return;
    const weight = Number(this.data.weightInput);
    if (!Number.isFinite(weight) || weight < MIN_WEIGHT || weight > MAX_WEIGHT) {
      wx.showToast({ title: "体重请在 30–250kg 之间", icon: "none" });
      return;
    }
    if (this.data.dateInput > this.data.today) {
      wx.showToast({ title: "日期不能选未来", icon: "none" });
      return;
    }

    this.setData({ saving: true, saveNote: "" });
    wx.showLoading({ title: "正在记录…", mask: true });
    api
      .saveWeight(Number(weight.toFixed(1)), this.data.dateInput)
      .then((result) => {
        wx.hideLoading();
        const app = getApp();
        if (result.profile) app.globalData.profile = result.profile;
        const autoMode = result.profile && result.profile.targetsMode === "auto";
        this.setData({
          saving: false,
          saveNote: result.targetsUpdated
            ? "已按新体重重算每日目标"
            : autoMode
              ? "已记录，当前体重未变，目标保持不变"
              : "已记录，目标模式为手动，数值未改动"
        });
        wx.showToast({ title: "体重已记录", icon: "success" });
        return this.load(true);
      })
      .catch((error) => {
        wx.hideLoading();
        this.setData({ saving: false });
        wx.showToast({ title: error.message || "记录失败", icon: "none" });
      });
  },

  onDelete(event) {
    const id = event.currentTarget.dataset.id;
    if (!id) return;
    wx.showModal({
      title: "删除体重记录",
      content: "删除后，趋势和平均值会重新计算。",
      confirmText: "删除",
      confirmColor: "#ED6B4C",
      success: (result) => {
        if (!result.confirm) return;
        this.setData({ saveNote: "" });
        wx.showLoading({ title: "正在删除…", mask: true });
        api
          .deleteWeight(id)
          .then((data) => {
            wx.hideLoading();
            const app = getApp();
            if (data && data.profile) app.globalData.profile = data.profile;
            wx.showToast({ title: "已删除", icon: "success" });
            return this.load(true);
          })
          .catch((error) => {
            wx.hideLoading();
            wx.showToast({ title: error.message || "删除失败", icon: "none" });
          });
      }
    });
  },

  goGoals() {
    wx.switchTab({ url: "/pages/goals/index" });
  },

  drawChart() {
    const weeks = this.chartWeeks || [];
    const query = wx.createSelectorQuery().in(this);
    query
      .select("#weightChart")
      .fields({ node: true, size: true })
      .exec((result) => {
        const info = result && result[0];
        if (!info || !info.node) return;
        const canvas = info.node;
        const ctx = canvas.getContext("2d");
        const system = wx.getWindowInfo ? wx.getWindowInfo() : wx.getSystemInfoSync();
        const dpr = system.pixelRatio || 2;
        const width = info.width || 300;
        const height = info.height || 170;
        canvas.width = width * dpr;
        canvas.height = height * dpr;
        ctx.scale(dpr, dpr);
        this.paintChart(ctx, width, height, weeks);
      });
  },

  paintChart(ctx, width, height, weeks) {
    const pad = { left: 42, right: 14, top: 16, bottom: 28 };
    const plotWidth = Math.max(1, width - pad.left - pad.right);
    const plotHeight = Math.max(1, height - pad.top - pad.bottom);
    ctx.clearRect(0, 0, width, height);

    if (!weeks.length) {
      ctx.fillStyle = "#969C93";
      ctx.font = "12px sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText("记录一次体重后，这里会出现趋势", width / 2, height / 2);
      return;
    }

    const values = weeks.map((week) => Number(week.average));
    let min = Math.min.apply(null, values);
    let max = Math.max.apply(null, values);
    if (max - min < 1) {
      const middle = (max + min) / 2;
      min = middle - 0.6;
      max = middle + 0.6;
    } else {
      min -= 0.4;
      max += 0.4;
    }
    const yFor = (value) => pad.top + ((max - value) / (max - min)) * plotHeight;
    const firstDay = dayNumber(weeks[0].weekStart);
    const lastDay = dayNumber(weeks[weeks.length - 1].weekStart);
    const span = Math.max(1, lastDay - firstDay);
    const xFor = (weekStart) => {
      if (weeks.length === 1) return pad.left + plotWidth / 2;
      return pad.left + ((dayNumber(weekStart) - firstDay) / span) * plotWidth;
    };

    // 三条水平参考线，只帮助读数。
    ctx.font = "10px sans-serif";
    ctx.textBaseline = "middle";
    for (let index = 0; index < 3; index += 1) {
      const value = max - ((max - min) * index) / 2;
      const y = yFor(value);
      ctx.beginPath();
      ctx.strokeStyle = "#E8E5D9";
      ctx.lineWidth = 1;
      ctx.moveTo(pad.left, y);
      ctx.lineTo(pad.left + plotWidth, y);
      ctx.stroke();
      ctx.fillStyle = "#969C93";
      ctx.textAlign = "right";
      ctx.fillText(value.toFixed(1), pad.left - 8, y);
    }

    const points = weeks.map((week) => ({
      x: xFor(week.weekStart),
      y: yFor(Number(week.average))
    }));

    if (points.length > 1) {
      // 折线下方的淡色区域，强调趋势而不是单个数字。
      ctx.beginPath();
      ctx.moveTo(points[0].x, points[0].y);
      for (let index = 1; index < points.length; index += 1) {
        ctx.lineTo(points[index].x, points[index].y);
      }
      ctx.lineTo(points[points.length - 1].x, pad.top + plotHeight);
      ctx.lineTo(points[0].x, pad.top + plotHeight);
      ctx.closePath();
      ctx.fillStyle = "rgba(217, 239, 124, 0.34)";
      ctx.fill();

      ctx.beginPath();
      ctx.moveTo(points[0].x, points[0].y);
      for (let index = 1; index < points.length; index += 1) {
        ctx.lineTo(points[index].x, points[index].y);
      }
      ctx.strokeStyle = "#1B4B37";
      ctx.lineWidth = 2.2;
      ctx.lineJoin = "round";
      ctx.lineCap = "round";
      ctx.stroke();
    } else {
      ctx.beginPath();
      ctx.strokeStyle = "rgba(27, 75, 55, 0.22)";
      ctx.lineWidth = 1;
      ctx.moveTo(pad.left, points[0].y);
      ctx.lineTo(pad.left + plotWidth, points[0].y);
      ctx.stroke();
    }

    for (let index = 0; index < points.length; index += 1) {
      const point = points[index];
      ctx.beginPath();
      ctx.arc(point.x, point.y, 3.6, 0, Math.PI * 2);
      ctx.fillStyle = "#D9EF7C";
      ctx.fill();
      ctx.strokeStyle = "#1B4B37";
      ctx.lineWidth = 1.8;
      ctx.stroke();
    }

    ctx.fillStyle = "#70786F";
    ctx.textBaseline = "top";
    if (weeks.length === 1) {
      ctx.textAlign = "center";
      ctx.fillText(format.monthDay(weeks[0].weekStart), points[0].x, pad.top + plotHeight + 10);
    } else {
      ctx.textAlign = "left";
      ctx.fillText(
        format.monthDay(weeks[0].weekStart),
        points[0].x,
        pad.top + plotHeight + 10
      );
      ctx.textAlign = "right";
      ctx.fillText(
        format.monthDay(weeks[weeks.length - 1].weekStart),
        points[points.length - 1].x,
        pad.top + plotHeight + 10
      );
    }
  }
});
