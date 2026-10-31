Component({
  properties: {
    label: { type: String, value: "" },
    value: { type: Number, value: 0 },
    target: { type: Number, value: 0 },
    unit: { type: String, value: "g" },
    tone: { type: String, value: "protein" }
  },

  data: {
    pct: 0,
    valueText: "0",
    targetText: ""
  },

  observers: {
    "value, target": function (value, target) {
      const pct = target > 0 ? Math.min(100, Math.round((value / target) * 100)) : 0;
      this.setData({
        pct,
        valueText: String(Math.round(Number(value) || 0)),
        targetText: String(Math.round(Number(target) || 0))
      });
    }
  }
});
