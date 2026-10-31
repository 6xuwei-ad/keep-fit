const { ADVICE_ICONS } = require("../../utils/constants");

Component({
  properties: {
    advice: { type: Object, value: {} },
    compact: { type: Boolean, value: false },
    theme: { type: String, value: "light" }
  },

  data: {
    icon: "✨"
  },

  observers: {
    advice: function (advice) {
      this.setData({
        icon: (advice && ADVICE_ICONS[advice.kind]) || "✨"
      });
    }
  }
});
