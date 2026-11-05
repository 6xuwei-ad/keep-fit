const { API_BASE, USE_WECHAT_LOGIN } = require("../config");

const DEVICE_KEY = "shike.device.v1";
const TOKEN_KEY = "shike.session.v1";

function ensureDeviceId() {
  let id = wx.getStorageSync(DEVICE_KEY);
  if (!id || String(id).length < 8) {
    id = `dev_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;
    wx.setStorageSync(DEVICE_KEY, id);
  }
  return id;
}

function getToken() {
  return wx.getStorageSync(TOKEN_KEY) || "";
}

function authHeaders() {
  const token = getToken();
  if (token) return { Authorization: `Bearer ${token}` };
  return { "x-device-id": ensureDeviceId() };
}

function parseBody(body) {
  if (typeof body !== "string") return body || {};
  try {
    return JSON.parse(body);
  } catch (error) {
    return {};
  }
}

function normalizeError(statusCode, body) {
  const data = parseBody(body);
  const error = new Error(data.error || "请求失败，请稍后重试");
  error.statusCode = statusCode || 0;
  error.code = data.code || "REQUEST_FAILED";
  return error;
}

function rawRequest(path, options) {
  const opts = options || {};
  return new Promise((resolve, reject) => {
    wx.request({
      url: `${API_BASE}${path}`,
      method: opts.method || "GET",
      data: opts.data,
      header: Object.assign({ "Content-Type": "application/json" }, opts.header || {}),
      timeout: opts.timeout || 20000,
      success(res) {
        if (res.statusCode >= 200 && res.statusCode < 300) resolve(res.data);
        else reject(normalizeError(res.statusCode, res.data));
      },
      fail(error) {
        reject(normalizeError(0, { error: error.errMsg || "网络连接失败" }));
      }
    });
  });
}

function request(path, options) {
  return rawRequest(path, Object.assign({}, options, { header: authHeaders() })).catch((error) => {
    // 会话过期时清除 token，回落到设备模式，避免页面完全不可用。
    if (error.statusCode === 401 && error.code === "SESSION_INVALID") {
      wx.removeStorageSync(TOKEN_KEY);
      return rawRequest(path, Object.assign({}, options, { header: authHeaders() }));
    }
    throw error;
  });
}

function bootstrapAuth() {
  if (!USE_WECHAT_LOGIN) return Promise.resolve(false);

  return new Promise((resolve) => {
    wx.login({
      timeout: 8000,
      success(loginResult) {
        if (!loginResult.code) {
          resolve(false);
          return;
        }
        rawRequest("/api/auth/wechat", {
          method: "POST",
          data: { code: loginResult.code }
        })
          .then((data) => {
            if (data && data.token) {
              wx.setStorageSync(TOKEN_KEY, data.token);
              resolve(true);
            } else {
              resolve(false);
            }
          })
          .catch(() => resolve(false));
      },
      fail() {
        resolve(false);
      }
    });
  });
}

function uploadImage(filePath) {
  return new Promise((resolve, reject) => {
    wx.uploadFile({
      url: `${API_BASE}/api/analyze`,
      filePath,
      name: "image",
      header: authHeaders(),
      timeout: 60000,
      success(res) {
        const body = parseBody(res.data);
        if (res.statusCode >= 200 && res.statusCode < 300) resolve(body);
        else reject(normalizeError(res.statusCode, body));
      },
      fail(error) {
        reject(normalizeError(0, { error: error.errMsg || "上传失败" }));
      }
    });
  });
}

function assetUrl(path) {
  if (!path) return "";
  if (/^https?:\/\//i.test(path)) return path;
  return `${API_BASE}${path}`;
}

module.exports = {
  ensureDeviceId,
  bootstrapAuth,
  getToken,
  request,
  uploadImage,
  assetUrl,
  getMeta() {
    return request("/api/meta");
  },
  getDay(date) {
    return request(`/api/day?date=${encodeURIComponent(date)}`);
  },
  getProfile() {
    return request("/api/profile");
  },
  updateProfile(payload) {
    return request("/api/profile", { method: "PUT", data: payload });
  },
  getWeights() {
    return request("/api/weights");
  },
  saveWeight(weightKg, date) {
    return request("/api/weights", {
      method: "POST",
      data: { weightKg, date }
    });
  },
  deleteWeight(id) {
    return request(`/api/weights/${id}`, { method: "DELETE" });
  },
  getCustomFoods() {
    return request("/api/custom-foods");
  },
  saveCustomFood(payload, id) {
    return request(id ? `/api/custom-foods/${id}` : "/api/custom-foods", {
      method: id ? "PUT" : "POST",
      data: payload
    });
  },
  deleteCustomFood(id) {
    return request(`/api/custom-foods/${id}`, { method: "DELETE" });
  },
  saveAlias(payload) {
    return request("/api/aliases", { method: "POST", data: payload });
  },
  searchFoods(query) {
    return request(`/api/foods?q=${encodeURIComponent(query || "")}`);
  },
  getRecentFoods() {
    return request("/api/foods?recent=1");
  },
  getRepeat() {
    return request("/api/repeat");
  },
  saveTemplate(mealId) {
    return request("/api/templates", { method: "POST", data: { mealId } });
  },
  logTemplate(id, date) {
    return request(`/api/templates/${id}/log`, { method: "POST", data: { date } });
  },
  deleteTemplate(id) {
    return request(`/api/templates/${id}`, { method: "DELETE" });
  },
  copyMeal(id, date) {
    return request(`/api/meals/${id}/copy`, { method: "POST", data: { date } });
  },
  analyzeImage(filePath) {
    return uploadImage(filePath);
  },
  analyzeDemo() {
    return request("/api/analyze/demo", { method: "POST", data: {} });
  },
  saveMeal(payload) {
    return request("/api/meals", { method: "POST", data: payload });
  },
  deleteMeal(id) {
    return request(`/api/meals/${id}`, { method: "DELETE" });
  }
};
