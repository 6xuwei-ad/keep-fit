# 食刻 · 微信小程序客户端

原生微信小程序（WXML / WXSS / JavaScript），直接调用仓库根目录的 Express API。

## 1. 导入微信开发者工具

1. 先启动 API：

   ```bash
   npm run dev:server
   # 或生产：npm run build && npm start
   ```

2. 打开微信开发者工具 → **导入项目**。
3. 项目目录选择仓库根目录（不是 `miniprogram/`），根目录的 `project.config.json` 已配置：

   ```json
   {
     "miniprogramRoot": "miniprogram/",
     "appid": "touristappid"
   }
   ```

4. 没有 AppID 时使用测试号 `touristappid` 即可预览页面；要真机调试/发布，请换成自己的小程序 AppID。
5. 详情 → 本地设置 → 勾选 **不校验合法域名、web-view（业务域名）、TLS 版本以及 HTTPS 证书**。

打开首页后，点击「先看看示例餐盘」即可完整走通识别 → 改克数 → 保存 → 日记流程。

## 2. API 地址

编辑 `miniprogram/config.js`：

```js
module.exports = {
  API_BASE: "http://127.0.0.1:8787",
  USE_WECHAT_LOGIN: true
};
```

- 开发者工具：`127.0.0.1` 可用。
- 真机预览：改成电脑的局域网 IP（手机与电脑同一 Wi-Fi），例如 `http://192.168.1.10:8787`。
- 正式发布：必须是已备案的 **HTTPS** 域名，并在小程序后台加入 request / uploadFile / downloadFile 合法域名。

## 3. 微信登录

默认 `USE_WECHAT_LOGIN: true`，启动时会：

```text
wx.login() → POST /api/auth/wechat → 服务端 code2Session → 签发会话 token
```

- 服务端未配置微信时返回 `501`，小程序自动回落到**设备模式**，仍可完整使用。
- 配置真实登录：在根目录 `.env` 填：

  ```dotenv
  WECHAT_APPID=wx...
  WECHAT_SECRET=...
  SESSION_SECRET=至少32位随机字符串
  ```

- 登录后用户身份是 `wx_<openid>`，记录会跟着微信账号走；设备模式则只跟当前设备走。
- 当前没有做「设备数据迁移到微信账号」，上线前应补一个账号归并流程。

## 4. 页面

| 页面 | 路径 | 能力 |
| --- | --- | --- |
| 今日 | `pages/home/index` | 今日概览、拍照/相册、示例餐盘、最近记录 |
| 确认份量 | `pages/review/index` | 识别结果、克数实时重算、补食物、保存 |
| 添加食物 | `pages/food-search/index` | 搜索 80+ 本地食物库 |
| 日记 | `pages/journal/index` | 日期切换、餐食列表、删除、每日建议 |
| 目标 | `pages/goals/index` | 昵称、减脂/维持/增肌、每日目标 |

## 5. 结构

```text
miniprogram/
├─ app.js / app.json / app.wxss
├─ config.js                   # API 地址、是否启用微信登录
├─ utils/
│  ├─ api.js                   # wx.request / wx.uploadFile / 会话
│  ├─ nutrition.js             # 克数缩放与汇总（与 shared/nutrition.ts 对齐）
│  ├─ advice.js                # 评分与建议（与 shared/advice.ts 对齐）
│  ├─ format.js
│  └─ constants.js
├─ components/
│  ├─ progress-ring/           # Canvas 2D 圆环
│  ├─ macro-bar/
│  └─ advice-card/
├─ pages/
│  ├─ home/
│  ├─ review/
│  ├─ food-search/
│  ├─ journal/
│  └─ goals/
└─ images/                     # tabBar 图标、示例餐盘、logo
```

## 6. 与 Web 端的关系

- 两端共用同一个 API、同一套食物库、同一套营养规则。
- Web 端用于桌面快速验收和大屏展示；微信端是主入口。
- `miniprogram/utils/nutrition.js`、`advice.js` 是 `shared/` 的 JS 版本，修改规则时必须两边同步，`npm test` 会校验计算结果一致。

## 7. 上线前检查

- [ ] 换成真实 AppID，填写 `WECHAT_APPID` / `WECHAT_SECRET` / `SESSION_SECRET`
- [ ] API 使用 HTTPS，域名加入 request / uploadFile / downloadFile 白名单
- [ ] 图片改为对象存储/CDN，并加入 downloadFile 域名
- [ ] 配置隐私保护指引：相机/相册、图片上传、AI 处理、保存期限、删除方式
- [ ] 类目选择工具/健康管理，文案避免医疗承诺
- [ ] 预览、真机调试、体验版全流程验证
- [ ] 设置 `ALLOW_DEMO=false`，避免线上展示演示餐盘
- [ ] 增加账号数据归并与删除账号能力
