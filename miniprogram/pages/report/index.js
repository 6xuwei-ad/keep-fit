const api = require("../../utils/api");
const format = require("../../utils/format");

const KCAL_CHART_HEIGHT = 180;
const PROTEIN_CHART_HEIGHT = 96;

function stateFor(day, targets) {
  if (!day.recorded) return { label: "未记录", className: "empty" };
  if (day.calorieHit) return { label: "达标", className: "good" };
  if (day.totals.kcal > targets.kcal * 1.1) {
    return { label: "偏高", className: "high" };
  }
  return { label: "偏低", className: "low" };
}

function deltaText(value, unit, digits) {
  if (value === null || value === undefined) return "—";
  const factor = Math.pow(10, digits || 0);
  const rounded = Math.round(Number(value) * factor) / factor;
  if (Math.abs(rounded) < (digits ? 0.05 : 0.5)) return "持平";
  return `${rounded > 0 ? "+" : ""}${rounded}${unit}`;
}

function toneFor(value) {
  if (value === null || value === undefined || value === 0) return "flat";
  return value > 0 ? "up" : "down";
}

Page({
  data: {
    loading: true,
    loadError: "",
    weekStart: "",
    weekLabel: "",
    isCurrentWeek: true,
    canGoPrev: false,
    canGoNext: false,
    report: null,
    days: [],
    targets: { kcal: 1800, protein: 110 },
    recordedDays: 0,
    calorieHitDays: 0,
    proteinHitDays: 0,
    averageKcalText: "—",
    averageProteinText: "—",
    averageQualityText: "—",
    qualityLabel: "",
    streakCurrent: 0,
    streakLongest: 0,
    headline: "",
    summaryBody: "",
    tips: [],
    hasComparison: false,
    comparisonTitle: "较上周",
    comparisonRange: "",
    comparisonRows: [],
    comparisonRecordedText: "持平",
    comparisonFootText: "",
    kcalTargetBottom: 0,
    proteinTargetBottom: 0,
    hasRecords: false,
    todayRecorded: false,
    shareTitle: "食刻 · 拍一张，吃明白"
  },

  onLoad(options) {
    this.requestedWeek = (options && options.weekStart) || "";
  },

  onShow() {
    this.load(this.data.weekStart || this.requestedWeek);
  },

  onPullDownRefresh() {
    this.load(this.data.weekStart).then(() => wx.stopPullDownRefresh());
  },

  load(weekStart) {
    const app = getApp();
    this.setData({ loading: true, loadError: "" });

    return app
      .ready()
      .then(() => api.getWeeklyReport(weekStart || ""))
      .then((report) => {
        if (report) this.applyReport(report);
      })
      .catch((error) => {
        this.setData({ loading: false });
        if (this.data.report) {
          wx.showToast({ title: error.message || "周报刷新失败", icon: "none" });
        } else {
          this.setData({ loadError: error.message || "周报加载失败" });
        }
      });
  },

  applyReport(report) {
    const targets = report.targets || this.data.targets;
    const comparison = report.comparison || {};
    const days = (report.days || []).map((day) => {
      const state = stateFor(day, targets);
      return {
        date: day.date,
        label: day.label,
        shortLabel: day.shortLabel,
        recorded: day.recorded,
        isToday: day.isToday,
        isFuture: day.isFuture,
        kcal: day.totals.kcal,
        protein: day.totals.protein,
        quality: day.quality === null ? null : Math.round(day.quality),
        kcalText: day.recorded ? String(Math.round(day.totals.kcal)) : "",
        proteinText: day.recorded ? String(Math.round(day.totals.protein)) : "",
        stateLabel: state.label,
        stateClass: state.className,
        barHeight: 8,
        proteinHeight: 6
      };
    });

    const kcalMax = Math.max(
      targets.kcal * 1.2,
      ...days.map((day) => day.kcal),
      1
    );
    days.forEach((day) => {
      day.barHeight = day.recorded
        ? Math.max(10, Math.round((day.kcal / kcalMax) * KCAL_CHART_HEIGHT))
        : 8;
    });

    const proteinMax = Math.max(
      targets.protein * 1.2,
      ...days.map((day) => day.protein),
      1
    );
    days.forEach((day) => {
      day.proteinHeight = day.recorded
        ? Math.max(8, Math.round((day.protein / proteinMax) * PROTEIN_CHART_HEIGHT))
        : 6;
    });

    const hasComparison = Number(comparison.recordedDays || 0) > 0;
    const comparisonRows = hasComparison
      ? [
          {
            label: "记录天数",
            value: deltaText(comparison.deltaRecordedDays, " 天", 0),
            previous: `${comparison.recordedDays} 天`,
            tone: toneFor(comparison.deltaRecordedDays)
          },
          {
            label: "平均热量",
            value: deltaText(comparison.deltaKcal, " kcal", 0),
            previous:
              comparison.averageKcal === null
                ? "—"
                : `${Math.round(comparison.averageKcal)} kcal`,
            tone: "flat"
          },
          {
            label: "平均蛋白质",
            value: deltaText(comparison.deltaProtein, "g", 1),
            previous:
              comparison.averageProtein === null
                ? "—"
                : `${Math.round(comparison.averageProtein)}g`,
            tone: toneFor(comparison.deltaProtein)
          },
          {
            label: "餐盘质量",
            value: deltaText(comparison.deltaQuality, " 分", 0),
            previous:
              comparison.averageQuality === null
                ? "—"
                : `${Math.round(comparison.averageQuality)} 分`,
            tone: toneFor(comparison.deltaQuality)
          }
        ]
      : [];

    const recordedDelta = Number(comparison.deltaRecordedDays || 0);
    const comparisonRecordedText =
      recordedDelta > 0
        ? `多 ${recordedDelta} 天`
        : recordedDelta < 0
          ? `少 ${Math.abs(recordedDelta)} 天`
          : "持平";
    const comparisonLabel = comparison.partial ? "上周同期" : "上周";
    const comparisonRange =
      comparison.weekStart && comparison.weekEnd
        ? comparison.weekStart === comparison.weekEnd
          ? format.monthDay(comparison.weekStart)
          : `${format.monthDay(comparison.weekStart)} – ${format.monthDay(
              comparison.weekEnd
            )}`
        : "";
    const recordedDays = Number(report.recordedDays || 0);
    const shareTitle =
      recordedDays > 0
        ? `我这一周记录了 ${recordedDays} 天饮食，平均 ${Math.round(
            report.averageKcal || 0
          )} kcal`
        : "食刻 · 拍一张，吃明白";

    this.setData({
      loading: false,
      loadError: "",
      report,
      weekStart: report.weekStart,
      weekLabel: `${format.formatDate(report.weekStart, false)} – ${format.formatDate(
        report.weekEnd,
        false
      )}`,
      isCurrentWeek: Boolean(report.isCurrentWeek),
      canGoPrev: Boolean(report.canGoPrev),
      canGoNext: Boolean(report.canGoNext),
      targets,
      days,
      recordedDays,
      calorieHitDays: Number(report.calorieHitDays || 0),
      proteinHitDays: Number(report.proteinHitDays || 0),
      averageKcalText:
        report.averageKcal === null ? "—" : String(Math.round(report.averageKcal)),
      averageProteinText:
        report.averageProtein === null ? "—" : String(Math.round(report.averageProtein)),
      averageQualityText:
        report.averageQuality === null ? "—" : String(Math.round(report.averageQuality)),
      qualityLabel: report.qualityLabel || "",
      streakCurrent: Number((report.streak && report.streak.current) || 0),
      streakLongest: Number((report.streak && report.streak.longest) || 0),
      headline: report.summary ? report.summary.headline : "",
      summaryBody: report.summary ? report.summary.body : "",
      tips: (report.summary && report.summary.tips) || [],
      hasComparison,
      comparisonTitle: comparison.partial ? "较上周同期" : "较上周",
      comparisonRange,
      comparisonRows,
      comparisonRecordedText,
      comparisonFootText: `比${comparisonLabel}${comparisonRecordedText}`,
      kcalTargetBottom: Math.round((targets.kcal / kcalMax) * KCAL_CHART_HEIGHT),
      proteinTargetBottom: Math.round(
        (targets.protein / proteinMax) * PROTEIN_CHART_HEIGHT
      ),
      hasRecords: recordedDays > 0,
      todayRecorded: days.some((day) => day.isToday && day.recorded),
      shareTitle
    });
  },

  onPrev() {
    if (!this.data.canGoPrev || this.data.loading || !this.data.report) return;
    this.load(this.data.report.previousWeekStart);
  },

  onNext() {
    if (!this.data.canGoNext || this.data.loading || !this.data.report) return;
    this.load(this.data.report.nextWeekStart);
  },

  onRetry() {
    this.load(this.data.weekStart);
  },

  onStart() {
    wx.switchTab({ url: "/pages/home/index" });
  },

  onShareAppMessage() {
    return {
      title: this.data.shareTitle,
      path: "/pages/home/index"
    };
  },

  onShareTimeline() {
    return { title: this.data.shareTitle };
  }
});
