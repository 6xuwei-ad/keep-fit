# 食刻 API 契约

> Base URL（开发）：`http://127.0.0.1:8787`  
> 生产：小程序调用的 HTTPS API 域名，例如 `https://shike.example.com`
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

无需身份。小程序据此显示“演示模式”提示。

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
- `weightKg` 发生变化时，服务端会同时写入/更新今天的体重记录，保证档案与体重趋势是同一个数字。
- 不传 `targets`、不传 `recalculate` 时：若传了 `goal` 使用推荐目标，否则保留原值。
- 范围：kcal 800–5000，protein 30–300，carbs 30–600，fat 15–200，fiber 10–80。

成功：`200 { "profile": {...} }`。身体数据完整时，`profile.bmr` 与 `profile.tdee` 会返回估算值。

---

## 体重趋势

### `GET /api/weights`

返回最近 365 条原始记录（按日期升序）、最近 12 个自然周（周一到周日）的平均值，以及最近一次变化。

```json
{
  "logs": [
    {
      "id": "b6f0e7d2-...",
      "date": "2026-10-01",
      "weightKg": 81.2,
      "createdAt": "2026-10-01T00:20:00.000Z",
      "updatedAt": "2026-10-01T00:20:00.000Z"
    }
  ],
  "weeks": [
    {
      "weekStart": "2026-09-28",
      "weekEnd": "2026-10-04",
      "average": 80.6,
      "min": 80,
      "max": 81.2,
      "count": 2
    }
  ],
  "latest": { "date": "2026-10-01", "weightKg": 81.2 },
  "latestWeek": { "weekStart": "2026-09-28", "average": 80.6 },
  "change": {
    "delta": -1.2,
    "fromWeight": 82.4,
    "toWeight": 81.2,
    "since": "2026-09-03",
    "days": 28
  },
  "currentWeekStart": "2026-11-02",
  "recordedThisWeek": false,
  "profile": {}
}
```

- `change` 只在存在“至少 28 天前”的记录时返回，避免把短期波动描述成四周变化。
- `profile` 是当前档案；`targetsMode: "auto"` 时，体重变化会同步重算目标。
- 没有任何记录时，`logs`、`weeks` 为空，`latest`、`latestWeek`、`change` 为 `null`。

### `POST /api/weights`

```json
{
  "weightKg": 79.6,
  "date": "2026-11-04"
}
```

- `weightKg`：30–250，服务端保留 1 位小数。
- `date`：可选，默认今天；不能晚于今天。同一天重复提交会覆盖当天记录，不新增。
- 记录成功后，服务端把档案体重同步为“最新一条记录”的体重。
- 自动目标模式（`targetsMode: "auto"`）会按新体重重算热量与三大营养素；手动模式只更新体重，不改目标数值。

成功：新记录 `201`，覆盖当天记录 `200`。

```json
{
  "log": { "id": "...", "date": "2026-11-04", "weightKg": 79.6 },
  "created": false,
  "profile": {},
  "targetsUpdated": true
}
```

### `DELETE /api/weights/:id`

删除一条记录。成功返回更新后的 `profile` 与 `targetsUpdated`；删除最新一条后，档案体重会回退到剩余记录中最新的一条。

| 状态 | code | 场景 |
| --- | --- | --- |
| 400 | `INVALID_WEIGHT` | 体重不在 30–250 或字段缺失 |
| 400 | `INVALID_WEIGHT_DATE` | 日期不存在 |
| 400 | `WEIGHT_FUTURE` | 日期晚于今天 |
| 404 | `WEIGHT_NOT_FOUND` | 记录不属于当前身份或已删除 |

---

## 周报与连续记录

### `GET /api/reports/weekly?weekStart=2026-11-03`

`weekStart` 可选，传该周任意一天即可，服务端统一归一到周一；不传时取上海时区本周。返回 7 天占位（没有记录的日子也会返回），以及达标天数、连续记录、上周对比和三条可执行建议。

```json
{
  "weekStart": "2026-11-02",
  "weekEnd": "2026-11-08",
  "isCurrentWeek": true,
  "today": "2026-11-07",
  "days": [
    {
      "date": "2026-11-02",
      "weekday": 1,
      "label": "周一",
      "shortLabel": "11/2",
      "recorded": false,
      "isToday": false,
      "isFuture": false,
      "isWeekend": false,
      "totals": { "kcal": 0, "protein": 0, "carbs": 0, "fat": 0, "fiber": 0 },
      "mealCount": 0,
      "quality": null,
      "calorieHit": false,
      "proteinHit": false,
      "caloriePercent": 0
    }
  ],
  "recordedDays": 3,
  "calorieHitDays": 1,
  "proteinHitDays": 1,
  "averageKcal": 1667,
  "averageProtein": 80,
  "averageQuality": 72,
  "qualityLabel": "还有提升空间",
  "streak": {
    "current": 1,
    "longest": 3,
    "lastRecordedDate": "2026-11-07",
    "activeToday": true
  },
  "comparison": {
    "weekStart": "2026-10-26",
    "weekEnd": "2026-10-31",
    "partial": true,
    "recordedDays": 2,
    "averageKcal": 1850,
    "averageProtein": 105,
    "averageQuality": 76,
    "deltaRecordedDays": 1,
    "deltaKcal": -183,
    "deltaProtein": -25,
    "deltaQuality": -4
  },
  "summary": {
    "headline": "节奏还在形成",
    "body": "本周记录了 3 天，平均 1667 kcal（目标 1800 kcal），蛋白质平均 80g；热量达标 1 天，蛋白质达标 1 天。",
    "tips": [
      { "title": "下周先把记录提到 4 天", "body": "不用每天都记……" },
      { "title": "固定一个记录时间", "body": "把记录放在晚餐后或睡前……" },
      { "title": "比上周多记了几天", "body": "本周 3 天，上周 2 天……" }
    ]
  },
  "targets": { "kcal": 1800, "protein": 110, "carbs": 190, "fat": 55, "fiber": 25 },
  "canGoPrev": true,
  "canGoNext": false,
  "previousWeekStart": "2026-10-26",
  "nextWeekStart": null
}
```

口径：

- **自然周**：周一到周日。`weekStart` 传周中任意一天都会归一到周一；未来周返回 `400 WEEK_FUTURE`。
- **热量达标**：有记录且当天摄入在目标的 85%–110% 之间；**蛋白质达标**：有记录且 ≥ 目标的 90%。
- **平均值**只除以有记录的天数，不会用 0 分拉低平均；没有记录时返回 `null`。本周报告是实时的，今天还没结束时平均值和达标天数会随后续记录变化。
- **餐盘质量**：按全天蛋白质、纤维、蔬菜多样性和热量偏差计算的 30–98 分，仅用于周内趋势，不是医学指标。
- **连续记录**：从今天往前数；今天还没记录时从昨天开始数，避免白天误判断签。`longest` 在最近 400 个有记录的日期内统计。
- **上周对比**：本周还没过完时，只对比上周同样的星期几（`partial: true`，`weekEnd` 是上周对应的截止日），避免周一就出现“比上周少记 4 天”；查看历史周时对比完整的上一个自然周（`partial: false`）。上周没有记录时 `recordedDays` 为 0，差值字段为 `null`。
- **目标口径**：历史周也使用当前档案目标，尚未做目标版本化；页面对此有说明。
- **隐私**：响应只包含饮食汇总，不包含体重、照片或食材明细。
- `canGoPrev` 取决于是否存在更早的饮食记录；`canGoNext` 取决于是否早于本周。对应的 `previousWeekStart` / `nextWeekStart` 在不可跳转时为 `null`。

错误：

| 状态 | code | 场景 |
| --- | --- | --- |
| 400 | `INVALID_WEEK` | `weekStart` 不是合法日期 |
| 400 | `WEEK_FUTURE` | `weekStart` 晚于本周 |

---

## 提醒与微信订阅消息

提醒发送依赖微信订阅消息：服务端必须有 `WECHAT_APPID` / `WECHAT_SECRET`，并且至少配置一个模板 ID。模板申请与字段要求见 [WECHAT.md](WECHAT.md)。

### `GET /api/reminders`

返回当前身份的提醒开关、授权剩余次数和能力说明。

```json
{
  "capability": {
    "wechatEnabled": true,
    "templatesConfigured": true,
    "canSend": true,
    "reason": "",
    "notice": "只在没记录时提醒。微信规定每次授权只能收到一条，收到后可以在这里续订。"
  },
  "reminders": [
    {
      "kind": "lunch",
      "label": "午餐提醒",
      "description": "没记录午餐时提醒",
      "time": "12:30",
      "timeLabel": "每天 12:30",
      "enabled": true,
      "remaining": 1,
      "lastSentAt": null,
      "templateId": "TmplId...",
      "templateReady": true
    }
  ]
}
```

`kind` 固定四种：

| kind | 时间 | 条件 |
| --- | --- | --- |
| `lunch` | 每天 12:30 | 当天还没有 `mealType: "lunch"` 的记录 |
| `dinner` | 每天 19:30 | 当天还没有 `mealType: "dinner"` 的记录 |
| `weekly` | 周日 20:00 | 本周至少有一条记录 |
| `streak` | 每天 20:30 | 当天没有记录，且当前连续记录 ≥ 3 天 |

- 时间按 `Asia/Shanghai`，发送窗口为计划时间后 20 分钟。
- `remaining` 是服务端记录的“可发送额度”。微信一次性订阅每接受一次只能发一条，发送成功扣 1 次。
- `canSend` 为 `false` 时，`reason` 会说明是未配置微信登录、未配置模板，还是当前是设备模式。
- `templateId` 为空或 `templateReady: false` 表示这一项没有配置模板，客户端不应发起授权。

### `PUT /api/reminders/:kind`

```json
{ "enabled": true }
```

只改开关，不消耗授权额度。成功返回完整的 `GET /api/reminders` 结构。

### `POST /api/reminders/:kind/grant`

小程序在 `wx.requestSubscribeMessage` 返回 `accept` 后调用，给这一项记一次可发送额度，并自动把开关打开。

```json
{}
```

- 成功：`201`，返回完整提醒结构。
- 该 `kind` 没有配置模板：`400 REMINDER_TEMPLATE_MISSING`。
- `kind` 不合法：`400 INVALID_REMINDER_KIND`。
- 额度最多累计 5 次；用户拒绝授权（微信 `43101`）时服务端会清空额度，等用户重新授权。

> 微信的规则是“一次授权一条消息”，不是普通推送。目标页会在每次收到提醒后显示“授权已用完”，用户需要点“续订”再授权一次。

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
      ],
      "source": "builtin"
    }
  ]
}
```

最多 24 条。内置食物 `source` 为 `builtin`；用户自定义食物 `source` 为 `custom`，同名时排在前面并隐藏同名内置项。匹配规则：自定义食物优先，内置库按“完全命中 > 前缀 > 包含”，别名也参与匹配。

### `GET /api/foods?recent=1`

返回最近吃过的食物，按最近一次用餐时间去重，最多 20 种，供食物搜索的快捷入口使用。结构与 `GET /api/foods` 相同；自定义食物会按 `foodId` 重新读取最新营养值，不在库中的旧记录返回空 `portions`。

### `GET /api/custom-foods`

返回当前身份的自定义食物，最多 100 条，按最近更新排序。

```json
{
  "foods": [
    {
      "id": "custom_b6f0e7d2-...",
      "name": "妈妈做的番茄炒蛋",
      "emoji": "🍳",
      "category": "dish",
      "per100g": { "kcal": 120, "protein": 6, "carbs": 8, "fat": 7, "fiber": 1 },
      "portions": [{ "label": "一小碟", "grams": 150 }],
      "createdAt": "2026-11-05T08:00:00.000Z",
      "updatedAt": "2026-11-05T08:00:00.000Z"
    }
  ]
}
```

### `POST /api/custom-foods`

```json
{
  "name": "妈妈做的番茄炒蛋",
  "emoji": "🍳",
  "category": "dish",
  "per100g": { "kcal": 120, "protein": 6, "carbs": 8, "fat": 7, "fiber": 1 },
  "portions": [{ "label": "一小碟", "grams": 150 }]
}
```

- `name`：1–40 字，同一身份不能重名，重复返回 `409 CUSTOM_FOOD_EXISTS`。
- `per100g`：每 100g 营养值，范围与内置食物一致。
- `portions`：最多 5 个，每个 `label` 1–12 字、`grams` 1–3000；可省略。
- 成功：`201 { "food": {...} }`。

### `PUT /api/custom-foods/:id`

请求体同 `POST`，用于修改名称、分类、营养值和份量。成功返回 `200 { "food": {...} }`。

### `DELETE /api/custom-foods/:id`

成功 `204`。已保存的饮食记录不会受影响，因为餐次保存的是营养快照。

### `POST /api/aliases`

把“模型/用户原来看到的叫法”记到当前身份下，下次识别时优先替换成指定食物。

```json
{
  "alias": "香煎豆腐",
  "foodId": "custom_b6f0e7d2-...",
  "name": "妈妈做的番茄炒蛋",
  "emoji": "🍳",
  "category": "dish",
  "per100g": { "kcal": 120, "protein": 6, "carbs": 8, "fat": 7, "fiber": 1 },
  "portionHint": "一小碟 · 150g"
}
```

- 别名按去除空格、括号与常见标点，再转小写后去重；同一别名再次提交会覆盖旧映射。
- 每个身份最多 200 条，超出后淘汰最久未更新的。
- 别名只影响当前身份；`POST /api/analyze` 在返回结果前应用，示例餐盘保持固定内容。
- 修改自定义食物时，指向它的别名快照会同步刷新；删除自定义食物后别名仍保留旧快照。
- 成功：`201 { "alias": {...} }`。

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

- `provider`：`vision` | `demo`；`demo` 时小程序必须展示 `notice`。
- `confidence`：0–1。
- `source`：`database`（命中本地营养库）、`custom`（用户自定义食物）或 `ai`（模型估值）。
- `items[].name` 保留模型识别到的具体做法，`per100g` 可能来自库。
- 识别结果返回前会先应用当前身份的别名；命中别名时使用别名快照的 `foodId`、名称、营养值和份量提示，`confidence` 至少提升到 0.9。
- `advice` 固定 3 条，但某些异常情况下可能少于 3（客户端不应假设长度）。
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

## 营养标签 OCR

### `POST /api/analyze/label`

`multipart/form-data`，字段与 `/api/analyze` 相同：

| 字段 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `image` | File | 是 | 包装背面的营养成分表，JPG / PNG / WebP，≤8MB |

服务端会校验图片魔数，调用视觉模型读取营养成分表，并统一归一化成每 100g / 100ml 的数值。识别成功后图片会保存到 `/uploads/`，用于这一餐的记录展示。

成功：`201`

```json
{
  "label": {
    "productName": "燕麦片",
    "per100g": {
      "kcal": 286.8,
      "protein": 8.2,
      "carbs": 45.1,
      "fat": 7.6,
      "fiber": 2.1
    },
    "basis": "100g",
    "servingSize": 100,
    "servingUnit": "g",
    "energyKj": 1200,
    "sodium": 320,
    "confidence": 0.98,
    "notice": "数值来自包装标签，已按每 100g 归一化；请核对单位和份量。",
    "imageUrl": "/uploads/1761900000000-a1b2c3d4.png",
    "engine": "qwen3-vl-plus"
  }
}
```

口径：

- **kJ → kcal**：标签只写能量 kJ 时按 `1 kcal = 4.184 kJ` 换算；同时有 kcal 时优先用 kcal。
- **每份 → 每 100g**：`basis: "serving"` 时用 `servingSize` 折算；返回的 `per100g` 始终是每 100g 或每 100ml 的数值。
- **液体**：`basis: "100ml"` 时按 `1ml ≈ 1g` 参与后续克数计算，页面会提示核对。
- **钠**：`sodium` 单位是 mg，已经按同一基准归一化。
- **置信度**：0–1；低于 0.7 时建议用户核对。
- **notice**：模型或服务端给出的核对提示，直接展示给用户。

错误：

| 状态 | code | 场景 |
| --- | --- | --- |
| 400 | `IMAGE_REQUIRED` | 没有上传文件 |
| 413 | `LIMIT_FILE_SIZE` | 超过 8MB |
| 415 | `UNSUPPORTED_TYPE` / `INVALID_IMAGE` | MIME 或魔数不合法 |
| 429 | `RATE_LIMITED` | 与 `/api/analyze` 共用 10 分钟 20 次配额 |
| 501 | `VISION_REQUIRED` | 服务端未配置 `VISION_API_KEY` |
| 502 | `LABEL_UPSTREAM` / `LABEL_SCHEMA` / `LABEL_EMPTY` | 模型失败或返回结构不完整 |
| 504 | `LABEL_TIMEOUT` | 模型超时 |

客户端拿到结果后，让用户确认每 100g 数值和实际吃的克数，再调用 `POST /api/custom-foods` 保存为自定义食物，最后用该 `foodId` 调用 `POST /api/meals`。这样服务端会保留标签营养值，不会用内置食物库覆盖。

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

## 常用餐与快速记录

### `GET /api/repeat`

首页「一键再吃」的数据源。无需请求体。

```json
{
  "templates": [
    {
      "id": "uuid",
      "name": "香煎豆腐彩虹能量碗",
      "mealType": "lunch",
      "imageUrl": "/uploads/1761900000000-a1b2c3d4.jpg",
      "items": [
        {
          "foodId": "silken-tofu",
          "name": "香煎豆腐",
          "grams": 120,
          "per100g": { "kcal": 76, "protein": 8.1, "carbs": 1.9, "fat": 4.8, "fiber": 0.3 }
        }
      ],
      "itemCount": 8,
      "totals": { "kcal": 551, "protein": 37, "carbs": 36, "fat": 32, "fiber": 12 },
      "useCount": 3,
      "createdAt": "2026-11-01T04:00:00.000Z",
      "lastUsedAt": "2026-11-03T04:10:00.000Z"
    }
  ],
  "yesterday": [
    {
      "id": "uuid",
      "name": "香煎豆腐彩虹能量碗",
      "mealType": "lunch",
      "imageUrl": "/uploads/1761900000000-a1b2c3d4.jpg",
      "emoji": "⬜",
      "itemCount": 8,
      "totals": { "kcal": 551, "protein": 37, "carbs": 36, "fat": 32, "fiber": 12 }
    }
  ]
}
```

- `templates` 按最近使用排序，最多 12 个。
- `yesterday` 是上海时区昨天的最后 4 餐，最多 4 条；没有则为空数组。

### `POST /api/templates`

把某一餐存为常用餐。

```json
{ "mealId": "6b0d1a90-..." }
```

- 只能使用当前身份自己的餐次。
- 同名 + 同餐次重复保存会更新已有模板，不会新增重复项。
- `201` 新建，`200` 更新；响应 `{ "template": {...}, "updated": false }`。
- 每个身份最多保留 50 个模板，超出时淘汰使用次数最少、最久未打开的。

错误：`400 INVALID_TEMPLATE`、`404 MEAL_NOT_FOUND`。

### `POST /api/templates/:id/log`

把常用餐记录到某一天，服务端会按食物库重新计算营养。

```json
{ "date": "2026-11-03" }
```

- `date` 可省略，默认上海时区今天。
- 生成的新餐 `imageUrl` 为 `null`，避免复用旧照片。
- 成功 `201 { "meal": {...} }`。
- 错误：`400 INVALID_ID`、`404 TEMPLATE_NOT_FOUND`。

### `DELETE /api/templates/:id`

删除常用餐，成功 `204`；不存在返回 `404 TEMPLATE_NOT_FOUND`。

### `POST /api/meals/:id/copy`

复制某一餐到指定日期（日记「再来一份」、首页「复制昨天」共用）。

```json
{ "date": "2026-11-03" }
```

- `date` 可省略，默认今天。
- 保留原餐名称、餐次和照片；营养由服务端重新计算。
- 成功 `201 { "meal": {...} }`。
- 错误：`400 INVALID_ID`、`404 MEAL_NOT_FOUND`。

---

## 状态码汇总

| 状态 | 含义 |
| --- | --- |
| 200 | 查询/更新成功（含更新常用餐） |
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

## 客户端调用示例

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
