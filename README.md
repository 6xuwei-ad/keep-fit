# 食刻 SHIKE

> 拍一张，吃明白。  
> 微信原生小程序：AI 识别盘中食物，按实际克数计算热量与三大营养素，并给出这一餐可执行的调整建议。

食刻只有**微信原生小程序**一个客户端：`miniprogram/` 负责拍照、确认克数、日记和目标；`server/` 提供 API、微信登录、视觉模型调用和 SQLite 存储。两者共用 `shared/` 里的营养、建议和身体数据计算。

---

## 技术栈

| 层 | 选择 | 原因 |
| --- | --- | --- |
| 微信端 | 原生 WXML / WXSS / JavaScript | 直接导入微信开发者工具；拍照、上传、Canvas 圆环、tabBar 均为原生能力 |
| 后端 | Node.js 24 + Express 5 | Node 原生 TypeScript type stripping，服务端无需构建 |
| 数据库 | `node:sqlite`（内置 SQLite） | 零外部依赖、单文件、事务完整，适合单实例 MVP |
| 校验 | Zod 4 | 用户输入、模型 JSON、保存请求都有运行时边界 |
| 视觉模型 | 任意 OpenAI 兼容视觉模型 | 默认 `gpt-4.1-mini`，可换 Gemini 兼容网关、Qwen-VL 等 |
| 图片处理 | `wx.compressImage` + 服务端魔数校验 | 上传前压缩，服务端拒绝伪装扩展名 |
| 测试 | `node:test` | 零测试框架依赖，29 个单元/API/模型/小程序逻辑测试 |

---

## 功能

- **拍一张就识别**：相机拍摄或相册上传，自动压缩、识别、拆解混合菜肴。
- **每种食物都能改克数**：步进器、直接输入、±20% 快捷份量，热量与营养素实时重算。
- **按实际吃下多少计算**：整盘可选 100% / 75% / 50% / 25%，每种食物还提供“一掌心 ≈ 100g”这类可点击的份量参照。
- **可以补充漏识别食材**：内置 80+ 食物的搜索库，手动加入牛油果、米饭、鸡胸肉等。
- **识别错了可以换**：每个识别项都能「换一种」，低置信度会标红提示；替换后记住原来的叫法，下次识别优先匹配。
- **可以建自己的食物库**：填每 100g 营养值和常用份量，保存后搜索里带「我的」标记、排在内置库前面，可随时编辑或删除。
- **不是只给一个热量数字**：同时给出蛋白质 / 碳水 / 脂肪 / 纤维、餐盘均衡度评分、三条针对当前目标的建议。
- **今日日记**：按天查看每一餐、全天摄入、目标完成度与剩余额度，可删除记录。
- **常吃的不用重拍**：每餐可存为「常用餐」，首页一键记录；也能把昨天的早餐、午餐复制到今天；食物搜索优先显示最近吃过的 20 种。
- **目标可调**：减脂 / 维持 / 增肌三套推荐值；填写性别、年龄、身高、体重和活动量后，会按 Mifflin-St Jeor 估算 BMR/TDEE 并自动生成目标，也可以手动覆盖。
- **体重趋势**：每周记一次体重，按自然周画 12 周折线和周平均；新体重会同步档案，自动目标模式会按新体重重算目标。只描述趋势，不评价胖瘦。
- **本周报告**：7 天热量与蛋白质柱状图、目标线、热量/蛋白质达标天数、餐盘质量、连续记录和上周对比；规则式周总结只给三条能执行的建议，可左右切换历史周。
- **微信订阅提醒**：午餐/晚餐没记录、周报生成、连续记录快断时提醒；目标页按项授权、开关与续订。微信规定一次授权只能收一条，页面会显示剩余次数。
- **悬浮玻璃导航**：底部 tabBar 改为 iOS 液态玻璃风格的悬浮胶囊，带背景模糊、边缘高光和滑动选中块，并适配全面屏安全区。
- **无模型可体验**：未配置 API Key 时自动进入演示模式，使用内置示例餐盘完整走通流程。
- **微信登录可选**：配置 `WECHAT_APPID` / `WECHAT_SECRET` 后使用 `wx.login` + `openid` 会话；未配置时自动回落设备模式。
- **隐私边界清晰**：API Key 只在服务端；照片只用于识别和你的饮食记录。

---

## 快速开始

### 环境

- Node.js **24+**（使用原生 TypeScript type stripping 与 `node:sqlite`）
- npm 10+
- 微信开发者工具
- Windows / macOS / Linux 均可运行 API

### 安装与启动 API

```bash
npm install
cp .env.example .env      # Windows PowerShell: Copy-Item .env.example .env
npm run dev
```

API 启动在 <http://127.0.0.1:8787/api/health>。

不填写 `VISION_API_KEY` 也能使用：会进入**演示识别模式**，配置后可切到真实视觉模型。

### 打开微信小程序

1. 保持 API 运行：`npm run dev`（或生产模式 `npm start`）。
2. 微信开发者工具 → 导入项目 → 选择**仓库根目录**。
3. `project.config.json` 已指向 `miniprogram/`，当前使用真实 AppID；没有权限时换成自己的 AppID。
4. 详情 → 本地设置 → 勾选「不校验合法域名…」。
5. 首页点击「先看看示例餐盘」，走通识别 → 改克数 → 保存 → 日记。

真机调试时，把 `miniprogram/config.js` 的 `API_BASE` 改成电脑局域网 IP；正式发布必须使用 HTTPS，并把 request / uploadFile / downloadFile 域名加入微信后台白名单。

详见 [miniprogram/README.md](miniprogram/README.md) 和 [docs/WECHAT.md](docs/WECHAT.md)。

### 配置视觉模型

编辑 `.env`：

```dotenv
VISION_API_KEY=sk-...
VISION_BASE_URL=https://api.openai.com/v1
VISION_MODEL=gpt-4.1-mini
VISION_TIMEOUT_MS=45000
ALLOW_DEMO=true
```

微信登录（可选，不配置则小程序使用设备模式）：

```dotenv
WECHAT_APPID=wx...
WECHAT_SECRET=...
SESSION_SECRET=至少32位随机字符串
```

微信订阅消息提醒（可选，不配置模板时目标页会显示“未配置模板”）：

```dotenv
WECHAT_TEMPLATE_LUNCH=TmplId...
WECHAT_TEMPLATE_DINNER=TmplId...
WECHAT_TEMPLATE_WEEKLY=TmplId...
WECHAT_TEMPLATE_STREAK=TmplId...
WECHAT_REMINDER_FIELDS={"title":"thing1","time":"time2","note":"thing3"}
WECHAT_MINIPROGRAM_STATE=formal
```

申请模板、字段要求和一次性授权限制见 [docs/WECHAT.md](docs/WECHAT.md) 的「订阅消息提醒」。

要求模型支持 **Chat Completions + image_url（data URI）**。服务端会自动尝试 JSON mode；如果兼容网关不支持 `response_format`，会再请求一次不带 JSON mode 的版本。

任何 OpenAI 兼容的视觉服务都可以接入，只需改 `VISION_BASE_URL` 和 `VISION_MODEL`。若供应商要求额外请求头，在 `server/services/vision.ts` 的请求处扩展即可。

> 生产环境建议把 `ALLOW_DEMO=false`，这样模型不可用时返回明确错误，而不是悄悄展示演示餐盘。

### 生产运行

```bash
npm start
```

API 默认监听 `8787`，数据库和上传图片在 `data/`。Node 直接运行 TypeScript，不需要先构建。

### Docker

```bash
docker build -t shike .
docker run --rm -p 8787:8787 \
  -e VISION_API_KEY=sk-... \
  -e SESSION_SECRET=至少32位随机字符串 \
  -e ALLOW_DEMO=false \
  -v "$(pwd)/data:/app/data" \
  shike
```

---

## 常用脚本

| 命令 | 作用 |
| --- | --- |
| `npm run dev` | 启动 API（8787，`node --watch`） |
| `npm start` | 生产模式启动 API |
| `npm run typecheck` | 检查 `server/` 与 `shared/` 的 TypeScript |
| `npm run check:mini` | 校验小程序 JSON / JS / WXSS、页面文件和 tabBar 图标 |
| `npm test` | 29 个营养、建议、周报、提醒、体重、视觉解析、会话、API 与小程序逻辑测试 |
| `npm run check` | 类型检查 + 小程序检查 + 测试 |

测试使用 `--test-isolation=none`，避免在受限环境里为每个测试文件创建子进程。

---

## 目录

```text
.
├─ miniprogram/             # 微信原生小程序（页面、组件、wx API 客户端）
├─ server/                  # Express API、微信登录、识别适配器、SQLite
├─ shared/                  # 服务端共用的类型、计算、建议规则
├─ public/images/           # 示例餐盘（demo 识别使用）
├─ docs/                    # 架构、API、微信运行与路线图
├─ data/                    # 运行时数据（SQLite 与上传图片，gitignored）
├─ scripts/                 # 小程序静态检查
├─ project.config.json      # 微信开发者工具项目配置
├─ tsconfig.server.json     # 仅检查 API/shared，避免 DevTools 读取根 tsconfig.json
├─ Dockerfile
├─ .env.example
└─ package.json
```

完整数据流、ERD 与扩展路线见 **[docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)**。

---

## API 一览

个人数据接口支持两种身份：

```http
Authorization: Bearer <微信登录会话 token>
# 或开发/设备模式
x-device-id: <8–64 位设备 ID>
```

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| GET | `/api/health` | 健康检查 |
| GET | `/api/meta` | 视觉模型 / 微信登录能力 |
| POST | `/api/auth/wechat` | `code` 换 `openid` 会话；未配置返回 501 |
| GET | `/api/profile` | 获取/初始化个人目标 |
| PUT | `/api/profile` | 更新昵称、目标、身体数据与每日营养目标 |
| GET | `/api/weights` | 体重记录、周平均、28 天变化 |
| POST | `/api/weights` | 记录或修正某天体重，并同步目标 |
| DELETE | `/api/weights/:id` | 删除体重记录 |
| GET | `/api/reports/weekly` | 指定自然周的饮食周报、连续记录与上周对比 |
| GET | `/api/reminders` | 提醒开关、授权剩余次数与可用状态 |
| PUT | `/api/reminders/:kind` | 开关某一项提醒 |
| POST | `/api/reminders/:kind/grant` | 记录一次订阅授权额度 |
| GET | `/api/foods?q=` | 搜索内置食物库 + 我的食物 |
| GET | `/api/foods?recent=1` | 最近吃过的食物 |
| GET | `/api/custom-foods` | 我的食物列表 |
| POST | `/api/custom-foods` | 新建自定义食物 |
| PUT | `/api/custom-foods/:id` | 修改自定义食物 |
| DELETE | `/api/custom-foods/:id` | 删除自定义食物 |
| POST | `/api/aliases` | 记住识别叫法与食物的映射 |
| POST | `/api/analyze` | 上传图片，返回识别结果（multipart，≤8MB） |
| POST | `/api/analyze/demo` | 无需上传，返回内置示例餐盘 |
| GET | `/api/day?date=YYYY-MM-DD` | 某天的餐食、汇总、建议 |
| GET | `/api/meals?date=YYYY-MM-DD` | 某天的餐食列表 |
| POST | `/api/meals` | 保存一餐（服务端重算营养） |
| POST | `/api/meals/:id/copy` | 复制一餐到指定日期 |
| DELETE | `/api/meals/:id` | 删除记录 |
| GET | `/api/repeat` | 首页常用餐 + 昨天餐次 |
| POST | `/api/templates` | 把一餐存为常用餐 |
| POST | `/api/templates/:id/log` | 一键记录常用餐 |
| DELETE | `/api/templates/:id` | 删除常用餐 |

详细字段与示例见 [docs/API.md](docs/API.md)。

---

## 计算与边界

1. **营养值**来自内置食物库或你的自定义食物，按每 100g 计算；自定义食物命中时以你填写的值为准，未命中才使用模型估值。
2. **AI 负责“是什么”，你负责“多少”**。保存时服务端会重新按克数与食物库计算，客户端提交的 totals 不作为可信数据。
3. **热量是估算**。烹调油、酱汁、隐藏糖和份量误差都会影响结果，产品用于趋势观察，不替代医疗或营养处方。
4. **模型输出不可信**。服务端用 Zod 校验结构、限制克数/营养值范围、限制条目数量，并对未知食物降级到通用估值。

---

## 文档

- [架构与项目结构](docs/ARCHITECTURE.md)
- [API 契约](docs/API.md)
- [产品路线图与功能优先级](docs/ROADMAP.md)
- [微信小程序运行与发布](docs/WECHAT.md)
- [微信小程序客户端说明](miniprogram/README.md)
- [.env.example](.env.example)

---

## 已知限制与下一步

- 微信登录已实现；发布前必须确认真实 AppID、AppSecret 与 `SESSION_SECRET` 只存在于服务端 `.env`，不要提交到仓库。
- 设备模式下的历史记录不会自动归并到微信账号，上线前应补账号数据归并流程。
- SQLite 适合单实例 MVP；多实例部署请迁移 PostgreSQL，并把图片移到对象存储。
- 分析请求同步等待模型（3–8 秒）。流量上来后可改为任务队列 + WebSocket/轮询。
- 已有体重趋势、饮食周报、连续记录、订阅提醒、识别纠错与个人食物库；还缺少餐次编辑和营养标签 OCR。
- 订阅提醒需要在微信公众平台申请模板并填入 `.env`，并且受微信“一次授权一条消息”的限制。
- 周报的历史周使用当前目标计算，目标版本化尚未实现；分享卡片不含体重和照片。
- 视觉识别对复配菜、遮挡、俯拍角度和深色酱汁仍会出错，建议持续积累「用户实际克数」反馈并建立评测集。

下一步按 [docs/ROADMAP.md](docs/ROADMAP.md) 推进：营养标签 OCR。
