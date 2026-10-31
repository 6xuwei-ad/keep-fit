const api = require("./utils/api");

App({
  globalData: {
    analysis: null,
    suggestedMealType: "lunch",
    pendingFood: null,
    lastSaved: null,
    authReady: null,
    openCameraOnHome: false
  },

  onLaunch() {
    api.ensureDeviceId();
    this.globalData.authReady = api.bootstrapAuth();
  },

  ready() {
    return this.globalData.authReady || Promise.resolve(false);
  }
});
