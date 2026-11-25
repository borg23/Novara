# Novara · 学生作业与课程管理工具

面向学生的作业与课程管理工具（比赛项目，网站端，多用户，学生课表相互隔离）。

## 文档

- [AGENTS.md](AGENTS.md)：仓库约定、命令、禁令与完成的定义。编码代理与新加入者先读这份。
- [docs/sites.md](docs/sites.md)：Qoder Sites 部署能力边界、差距清单与迁移顺序。

## 功能范围（本次比赛）

- 作业管理：作业项绑定课程、考试记录、文本批量导入
- GPA 计算器：独立模块，记录课程学分与成绩，按学分加权换算 4.0 绩点，支持上传 CSV/JSON 分析后导入，估算学分情况与课程完成度
- 计时功能：绑定作业项，记录每项作业的专注时长（类似滴答清单）
- 面板首页：今日任务、今日作业、日历、课程表、天气，组件模块化
- 组件化自定义：拖拽排序、列数（1/2/3）、格子样式（卡片/扁平），按用户持久化
- 主题：浅色 / 深色 / 跟随系统，登录用户在导航栏切换并持久化，访客跟随系统

**本次比赛不做**：强制专注功能（留待后续独立项目）。

## 技术栈

- Next.js 15（App Router）+ TypeScript —— 本地形态：页面壳 + `src/app/api/**` 路由
- Vite + React —— 部署形态的静态壳（`web/`），与 Next 共用 `src/components` 与 `src/lib`
- Deno Edge Function —— 部署形态的服务端（`functions/`），经链式查询客户端访问平台数据库
- SQLite（Node 内置 `node:sqlite`，零原生依赖；数据库文件位于 `data/novara.db`，自动创建）
- Tailwind CSS v3
- 认证：本地形态是会话 Cookie（HttpOnly）+ scrypt 口令；部署形态用平台注入的 Qoder 身份，用户记录仍由本库 `users` 持有。两种形态都按用户隔离

## 快速开始

要求：Node.js ≥ 22.5（推荐 24，自带 `node:sqlite`）；跑部署形态还需 Deno ≥ 2.2（本机 2.9.8）。

### 本地形态（Next + SQLite，可注册可登录）

```bash
npm install
npm run dev            # http://localhost:3000
```

打开 http://localhost:3000 ，注册账号即可使用。构建与生产启动用 `npm run build` / `npm start`。

### 部署形态（Vite 静态壳 + Deno Function，本地等价联调）

```bash
npm run dev:function   # 终端 1：Deno 薄壳，监听 127.0.0.1:8000
npm run dev:web        # 终端 2：Vite 壳，把 /functions/v1/app 代理到 8000
```

打开 http://127.0.0.1:5173 就是部署形态的行为：未登录读到的是公开示例数据，写控件隐藏。切换本地身份（账号 A / 账号 B / 未登录 / 上下文非法）访问 http://127.0.0.1:8000/__local 。

静态产物（站点根为 `out/web/index.html`）用 `npm run build:web`；Function 的提交前类型检查用 `deno check functions/index.ts`，两者不可互替。

## 环境变量

复制 `.env.example` 为 `.env` 后按需修改：

| 变量 | 说明 | 默认值 |
| --- | --- | --- |
| `WEATHER_PROVIDER` | 天气数据源：`open-meteo`（免 Key）或 `amap` | `open-meteo` |
| `AMAP_KEY` | 高德开放平台 Web 服务 Key（仅 `amap` 需要） | 空 |
| `GPA_TARGET_CREDITS` | 毕业目标学分，用于完成度估算 | `160` |
| `SESSION_DAYS` | 登录会话有效期（天） | `30` |

## 批量导入格式

### 作业（文本粘贴，每行一条）

逗号、分号或 Tab 分隔：`课程名, 作业标题, 截止日期(可选)`。课程不存在时自动创建。

```
高等数学, 第三章课后习题, 2026-11-30
大学英语, 背诵 Unit 5 单词
```

### 成绩单（CSV）

表头支持中文或英文别名：`课程名, 学分, 成绩, 状态, 学期`。成绩支持百分制（0-100）或等级（A、B、优、良、及格…）。状态：`计划中/在读/已完成`。

### 成绩单（JSON）

课程对象数组：

```json
[
  { "name": "高等数学", "credits": 4, "grade": 92, "status": "completed", "semester": "2026 秋" }
]
```

## 商业化方向（规划）

- 学校平台化：学校由上至下管理学生，学生登录即可看到所有课程
- 超星开发者平台 API 对接（有接口就做）：老师在本平台发布作业并同步到学习通

**当前阻塞**：超星开放开发者平台注册未成功，暂未接入；注册成功后可扩展 `/api` 下新增同步模块。

## 后续独立项目规划

- 比赛结束后将「强制专注」拆分为独立项目
- 平台优先：Windows 客户端 → Android →（暂无条件）Apple
- 桌面端 widgets 小组件（类似苹果信息面板），可自定义排列

## 项目结构

```
src/
  app/
    api/            # 本地形态 REST API（auth/courses/assignments/exams/tasks/focus/widgets/gpa/weather/settings）
    login|register
    homework/ courses/ gpa/ focus/   # 功能页（薄壳，不读会话）
  components/       # nav / panel / widgets / identity / 各页面视图（两种形态共用）
  lib/              # db / auth / gpa / weather / http / api（请求前缀）
functions/
  app.ts            # 部署形态业务逻辑，纯依赖注入
  index.ts          # 平台注入薄壳（Deno.serve）
  auth.mjs          # 平台身份上下文读取（逐字复制插件 user-context 范例）
  shared/           # 纯函数，Next 与 Deno 共用一份
dev/local.ts        # 本地薄壳：fake db + 身份切换，127.0.0.1:8000
web/                # 部署形态静态壳（Vite + React），产物 out/
```
