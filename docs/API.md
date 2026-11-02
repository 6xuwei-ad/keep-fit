# 食刻 API 契约

> Base URL（开发）：`http://127.0.0.1:8787`  
> 生产：与前端同源，例如 `https://shike.example.com`  
> 所有响应均为 `application/json`，`204` 无响应体。

---

## 通用约定

### 身份

除 `GET /api/health`、`GET /api/meta`、`POST /api/auth/wechat` 外，所有接口需要以下两种身份之一。

**微信登录（推荐）：**

```http
Authorization: Bearer <session token>
```

**匿名设备（开发 / 未配置微信登录）：**

```http
x-device-id: 8d1f0c2e-6b1a-4d5e-9f3c-2a7b8c9d0e1f
```

设备 ID 规则：8–64 位，仅 `A-Z a-z 0-9 _ -`。缺失或非法返回 `400 DEVICE_REQUIRED`。设备 ID 是可伪造的匿名标识，不是安全认证；生产环境应使用微信登录。

### 错误格式

```json
{
  "error": "给用户看的中文说明",
  "code": "MACHINE_READABLE_CODE",
  "details": {}
}
```

`details` 只在开发/参数错误时出现，可能包含 Zod issues 或上游状态码，不应直接展示给终端用户。

### 时间与日期

- `date`：`YYYY-MM-DD`，用于按天查询。
- `eatenAt`：ISO 8601，必须可被 `Date.parse` 解析；服务端统一转 UTC 存储。
- 未传日期时，服务端默认使用 `Asia/Shanghai` 的今天。

---

## 健康与能力

### `GET /api/health`

无需身份。

```json
{
  "ok": true,
  "mode": "demo",
  "version": "1.0.0"
}
```

`mode`：`vision`（已配置 API Key）或 `demo`。

### `GET /api/meta`

无需身份。前端据此显示“演示模式”提示。

```json
{
  "visionEnabled": false,
  "demoAllowed": true,
  "wechatEnabled": false,
  "model": "演示引擎",
  "version": "1.0.0"
}
```

`wechatEnabled` 表示服务端是否配置了 `WECHAT_APPID` + `WECHAT_SECRET`。

---

## 微信登录

### `POST /api/auth/wechat`

无需身份。小程序端用 `wx.login()` 获取 code 后调用。

```json
{
  "code": "081abc..."
}
```

服务端请求微信 `jscode2session`，成功后：

```json
{
  "token": "eyJzdWIiOiJ3eF8uLi4i...",
  "identity": "wx_oX7...",
  "expiresAt": 1799999999,
  "profile": { "...": "同 GET /api/profile" }
}
```

- `identity` 为 `wx_<openid>`，只用于服务端隔离；客户端后续只需携带 `token`。
- `expiresAt` 是 Unix 秒。
- token 是 HMAC-SHA256 签名的 `{sub, iat, exp, v}`，默认 30 天；`SESSION_TTL_SECONDS` 可调。

错误：

| 状态 | code | 场景 |
| --- | --- | --- |
| 400 | `INVALID_WECHAT_CODE` | body 缺 code |
| 401 | `WECHAT_LOGIN_FAILED` | code 失效、AppID/Secret 不匹配 |
| 501 | `WECHAT_NOT_CONFIGURED` | 服务端未配置微信登录；小程序会回落设备模式 |
| 502 | `WECHAT_NETWORK` | 无法连接微信接口 |

---

## 个人资料与目标

### `GET /api/profile`

首次调用会自动创建默认 profile（减脂，1800 kcal / 110P / 190C / 55F / 25 fiber）。

```json
{
  "profile": {
    "deviceId": "8d1f0c2e-...",
    "name": "食刻用户",
    "goal": "fat-loss",
    "sex": null,
    "age": null,
    "heightCm": null,
    "weightKg": null,
    "activityLevel": null,
    "targetsMode": "manual",
    "bmr": null,
    "tdee": null,
    "targets": {
      "kcal": 1800,
      "protein": 110,
      "carbs": 190,
      "fat": 55,
      "fiber": 25
    },
    "createdAt": "2026-10-31T12:00:00.000Z",
    "updatedAt": "2026-10-31T12:00:00.000Z"
  }
}
```

### `PUT /api/profile`

手动目标：

```json
{
  "name": "小林",
  "goal": "maintain",
  "targets": {
    "kcal": 1900,
    "protein": 110,
    "carbs": 210,
    "fat": 60,
    "fiber": 25
  }
}
```

按身体数据自动计算：

```json
{
  "name": "小林",
  "goal": "fat-loss",
  "sex": "male",
  "age": 35,
  "heightCm": 178,
  "weightKg": 78,
  "activityLevel": "moderate",
  "recalculate": true
}
```

- `name` 可选，1–20 字。
- `goal` 可选：`fat-loss` / `maintain` / `muscle`。
- `targets` 可选；传了即视为手动目标（`targetsMode: "manual"`）。
- `recalculate: true` 时，按 BMR/TDEE 自动计算目标（`targetsMode: "auto"`），需要完整的身体数据。
- 身体数据：`sex` 为 `female` / `male`，`age` 18–80，`heightCm` 120–230，`weightKg` 30–250，`activityLevel` 为 `sedentary` / `light` / `moderate` / `active` / `very-active`。
- 不传 `targets`、不传 `recalculate` 时：若传了 `goal` 使用推荐目标，否则保留原值。
- 范围：kcal 800–5000，protein 30–300，carbs 30–600，fat 15–200，fiber 10–80。

成功：`200 { "profile": {...} }`。身体数据完整时，`profile.bmr` 与 `profile.tdee` 会返回估算值。

---

## 食物库

### `GET /api/foods?q=鸡胸`

无需请求体，需要身份。`q` 可空（返回常用食材），最长 30 字。

```json
{
  "foods": [
    {
      "id": "chicken-breast",
      "name": "鸡胸肉",
      "emoji": "🍗",
      "category": "protein",
      "per100g": {
        "kcal": 165,
        "protein": 31,
        "carbs": 0,
        "fat": 3.6,
        "fiber": 0
      },
      "portions": [
        { "label": "半掌心", "grams": 80 },
        { "label": "一掌心", "grams": 120 }
      ]
    }
  ]
}
```

最多 24 条。匹配规则：完全命中 > 前缀 > 包含；别名也参与匹配。

---

## 识别

### `POST /api/analyze/demo`

无需上传图片，返回内置示例餐盘。供微信小程序在无相机/无模型时快速体验，避免从客户端上传包内图片。

请求体：`{}`，需要身份。响应结构与 `POST /api/analyze` 相同，`imageUrl` 固定为 `/images/demo-bowl.jpg`，`provider` 为 `demo`。

限流与 `/api/analyze` 共用同一配额。

### `POST /api/analyze`

`multipart/form-data`：

| 字段 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `image` | File | 是 | JPG / PNG / WebP，≤8MB |

允许的 MIME：`image/jpeg`、`image/png`、`image/webp`。服务端还会校验文件魔数，伪装扩展名会被拒绝。

限流：同一身份 20 次 / 10 分钟（内存计数，重启清零）。

成功：`201`

```json
{
  "analysis": {
    "id": "6b0d1a90-...",
    "dishName": "香煎豆腐彩虹能量碗",
    "imageUrl": "/uploads/1761900000000-a1b2c3d4.jpg",
    "engine": "食刻演示引擎",
    "provider": "demo",
    "notice": "演示模式：当前结果来自内置示例餐盘。配置 VISION_API_KEY 后，上传的照片会由视觉模型真实识别。",
    "items": [
      {
        "id": "0d2f...",
        "foodId": "silken-tofu",
        "name": "香煎豆腐",
        "emoji": "⬜",
        "category": "protein",
        "grams": 120,
        "confidence": 0.91,
        "portionHint": "半盒 · 150g",
        "per100g": {
          "kcal": 76,
          "protein": 8.1,
          "carbs": 1.9,
          "fat": 4.8,
          "fiber": 0.3
        },
        "nutrition": {
          "kcal": 91.2,
          "protein": 9.7,
          "carbs": 2.3,
          "fat": 5.8,
          "fiber": 0.4
        },
        "source": "database"
      }
    ],
    "totals": {
      "kcal": 376.9,
      "protein": 30.7,
      "carbs": 37.4,
      "fat": 17.6,
      "fiber": 8.1
    },
    "quality": {
      "score": 86,
      "label": "相当不错",
      "summary": "蛋白质、纤维和蔬菜都在线，是一餐漂亮的组合。"
    },
    "advice": [
      {
        "kind": "water",
        "title": "配一杯无糖饮品",
        "body": "随餐喝 300–500ml 水或无糖茶……"
      }
    ],
    "createdAt": "2026-10-31T12:01:00.000Z"
  },
  "suggestedMealType": "dinner"
}
```

字段说明：

- `provider`：`vision` | `demo`；`demo` 时前端必须展示 `notice`。
- `confidence`：0–1。
- `source`：`database`（命中本地营养库）或 `ai`（模型估值）。
- `items[].name` 保留模型识别到的具体做法，`per100g` 可能来自库。
- `advice` 固定 3 条，但某些异常情况下可能少于 3（前端不应假设长度）。
- `suggestedMealType`：根据服务端当前时间推断，用户可在保存前修改。

错误：

| 状态 | code | 场景 |
| --- | --- | --- |
| 400 | `IMAGE_REQUIRED` | 没有文件 |
| 413 | `LIMIT_FILE_SIZE` | 超过 8MB |
| 415 | `UNSUPPORTED_TYPE` / `INVALID_IMAGE` | MIME 或魔数不合法 |
| 429 | `RATE_LIMITED` | 10 分钟超过 20 次 |
| 502 | `VISION_*` | 模型不可用且未允许降级 |

---

## 日记与餐食

### `GET /api/day?date=2026-10-31`

```json
{
  "profile": { "...": "同 GET /api/profile" },
  "summary": {
    "date": "2026-10-31",
    "meals": [
      {
        "id": "uuid",
        "date": "2026-10-31",
        "eatenAt": "2026-10-31T12:30:00.000Z",
        "mealType": "lunch",
        "name": "香煎豆腐彩虹能量碗",
        "imageUrl": "/uploads/....jpg",
        "engine": "gpt-4.1-mini",
        "totals": {
          "kcal": 551,
          "protein": 37,
          "carbs": 36,
          "fat": 32,
          "fiber": 12
        },
        "items": [
          {
            "id": "uuid",
            "foodId": "silken-tofu",
            "name": "香煎豆腐",
            "emoji": "⬜",
            "category": "protein",
            "grams": 120,
            "confidence": 0.91,
            "portionHint": "半盒 · 150g",
            "per100g": { "...": "同 AnalysisItem" },
            "nutrition": { "...": "同 AnalysisItem" },
            "source": "database"
          }
        ],
        "createdAt": "2026-10-31T12:31:00.000Z"
      }
    ],
    "totals": {
      "kcal": 551,
      "protein": 37,
      "carbs": 36,
      "fat": 32,
      "fiber": 12
    },
    "targets": {
      "kcal": 1800,
      "protein": 110,
      "carbs": 190,
      "fat": 55,
      "fiber": 25
    },
    "remaining": {
      "kcal": 1249,
      "protein": 73,
      "carbs": 154,
      "fat": 23,
      "fiber": 13
    },
    "caloriePercent": 31,
    "advice": [
      { "kind": "balance", "title": "...", "body": "..." }
    ]
  }
}
```

`remaining` 可以为负数（超标）。`caloriePercent` 四舍五入为整数，不封顶。

### `GET /api/meals?date=YYYY-MM-DD`

轻量版本，仅返回 `{ date, meals }`。字段同 `summary.meals`。

### `POST /api/meals`

保存一餐。服务端会重新计算营养，**不信任**请求中的总量。

```json
{
  "name": "香煎豆腐彩虹能量碗",
  "mealType": "lunch",
  "date": "2026-10-31",
  "eatenAt": "2026-10-31T12:30:00+08:00",
  "imageUrl": "/uploads/1761900000000-a1b2c3d4.jpg",
  "engine": "gpt-4.1-mini",
  "items": [
    {
      "foodId": "silken-tofu",
      "name": "香煎豆腐",
      "emoji": "⬜",
      "category": "protein",
      "grams": 120,
      "confidence": 0.91,
      "portionHint": "半盒 · 150g",
      "per100g": {
        "kcal": 76,
        "protein": 8.1,
        "carbs": 1.9,
        "fat": 4.8,
        "fiber": 0.3
      }
    }
  ]
}
```

约束：

- items 1–20 条；每条 grams 1–3000。
- `name` 1–40 字；`engine` 1–80 字。
- `imageUrl` 只能为 `null`、`/uploads/...` 或 `/images/...`。
- `mealType`：`breakfast` | `lunch` | `dinner` | `snack`。
- `per100g.kcal` ≤1000；其余每 100g ≤200。

成功：`201 { "meal": {...} }`，结构与 `summary.meals[]` 一致。

### `DELETE /api/meals/:id`

- id 必须是 UUID 格式。
- 只能删除当前身份自己的记录。
- 成功：`204`。
- 不存在或不属于当前身份：`404 MEAL_NOT_FOUND`。

---

## 状态码汇总

| 状态 | 含义 |
| --- | --- |
| 200 | 查询/更新成功 |
| 201 | 创建成功（分析、餐食） |
| 204 | 删除成功 |
| 400 | 参数/格式错误、缺少设备 |
| 401 | 微信登录失败 / 会话失效 |
| 404 | 资源不存在 |
| 413 | 图片过大 |
| 415 | 图片类型不支持 |
| 429 | 识别频率超限 |
| 500 | 未处理异常 |
| 501 | 未配置微信登录（小程序回落设备模式） |
| 502 | 视觉模型或微信上游错误（允许降级时视觉错误不会出现） |
| 504 | 视觉模型超时 |

---

## 前端调用示例

```ts
const headers = {
  "x-device-id": localStorage.getItem("shike.device.v1")!,
  "Content-Type": "application/json"
};

const day = await fetch(`/api/day?date=${date}`, { headers }).then((r) => r.json());

const form = new FormData();
form.append("image", compressedFile);
const result = await fetch("/api/analyze", {
  method: "POST",
  headers: { "x-device-id": deviceId },
  body: form
}).then((r) => r.json());
```

`src/lib/api.ts` 对上述调用、错误解析和设备 ID 做了统一封装。

### 微信小程序

```js
// utils/api.js
wx.request({
  url: `${API_BASE}/api/day?date=${date}`,
  header: token
    ? { Authorization: `Bearer ${token}` }
    : { "x-device-id": deviceId },
  success(res) {
    if (res.statusCode >= 200 && res.statusCode < 300) {
      // res.data 已是对象
    }
  }
});

// 图片
wx.uploadFile({
  url: `${API_BASE}/api/analyze`,
  filePath: tempFilePath,
  name: "image",
  header: { Authorization: `Bearer ${token}` },
  success(res) {
    const payload = JSON.parse(res.data);
  }
});
```

完整客户端见 [miniprogram/utils/api.js](../miniprogram/utils/api.js)。
