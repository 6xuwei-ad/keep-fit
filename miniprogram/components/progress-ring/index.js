Component({
  properties: {
    percent: { type: Number, value: 0 },
    size: { type: Number, value: 150 },
    stroke: { type: Number, value: 10 },
    tone: { type: String, value: "lime" }
  },

  data: {
    ready: false
  },

  lifetimes: {
    ready() {
      this._ready = true;
      this.scheduleDraw();
    },
    detached() {
      if (this._timer) clearTimeout(this._timer);
    }
  },

  observers: {
    "percent, size, stroke, tone": function () {
      this.scheduleDraw();
    }
  },

  methods: {
    scheduleDraw() {
      if (!this._ready) return;
      if (this._timer) clearTimeout(this._timer);
      this._timer = setTimeout(() => this.draw(), 30);
    },

    draw() {
      const size = Number(this.data.size) || 150;
      const stroke = Number(this.data.stroke) || 10;
      const percent = Math.max(0, Math.min(100, Number(this.data.percent) || 0));
      const tone = this.data.tone || "lime";
      const colors = {
        lime: ["#eef9b8", "#d8ef76"],
        green: ["#7fb79c", "#2d6a50"],
        coral: ["#f6a58f", "#ec6748"]
      };
      const pair = colors[tone] || colors.lime;

      wx.createSelectorQuery()
        .in(this)
        .select("#ring")
        .fields({ node: true, size: true })
        .exec((res) => {
          if (!res || !res[0] || !res[0].node) return;
          const canvas = res[0].node;
          const ctx = canvas.getContext("2d");
          const system = wx.getWindowInfo();
          const dpr = system.pixelRatio || 2;

          canvas.width = size * dpr;
          canvas.height = size * dpr;
          ctx.scale(dpr, dpr);
          ctx.clearRect(0, 0, size, size);

          const center = size / 2;
          const radius = (size - stroke) / 2;

          ctx.lineWidth = stroke;
          ctx.lineCap = "round";
          ctx.beginPath();
          ctx.arc(center, center, radius, 0, Math.PI * 2);
          ctx.strokeStyle = "rgba(20, 49, 37, 0.09)";
          ctx.stroke();

          if (percent > 0) {
            const start = -Math.PI / 2;
            const end = start + (Math.PI * 2 * percent) / 100;
            const gradient = ctx.createLinearGradient(0, 0, size, size);
            gradient.addColorStop(0, pair[0]);
            gradient.addColorStop(1, pair[1]);
            ctx.beginPath();
            ctx.arc(center, center, radius, start, end);
            ctx.strokeStyle = gradient;
            ctx.stroke();
          }
        });
    }
  }
});
