# Qoder Sites 部署约束与迁移计划

比赛的提交物要求作品链接必须是 **Qoder Sites 部署、且设为公开访问**的地址，不接受本地文件与压缩包。本文记录已核实的能力边界、Novara 与目标的差距、以及迁移顺序。

依据是 Qoder Sites 插件 v0.5.7 的内置文档与站点接口的实际返回值，核实时间 2026-11-25。平台能力会变，动手前重新核对一次。文中 `sites-building/references/*` 等路径是插件内的技能文件相对路径，在每台安装 Qoder 的机器上都存在，但绝对位置不同。

## 一、能力边界

| 关注点 | 结论 | 依据 |
| --- | --- | --- |
| 网站形态 | 静态文件，所选 `webDirectory` 下必须有 `index.html` | `sites-building/references/environment.md` |
| SPA | 由 `prepare_site.spa` 决定；`true` 时生成 `index.html` 的 200 兜底 | `sites-building/references/static-site.md` |
| 服务端代码 | 只允许**一个**名为 `app` 的 Edge Function：Deno TypeScript，`functionDirectory/index.ts`，HTTP handler，import 必须自包含 | `environment.md`、`functions.md` |
| 前端调后端 | 同源 `/functions/v1/app`，支持子路径与 query action | `functions.md` |
| 数据库（新项目） | `ensure_backend` 用 `databaseAccessModel: function_backend`，平台注入私有 `QODER_DATABASE`，Function 内使用链式查询客户端 | `references/function-backend.md` |
| 数据库（旧分配） | `assets/database-function` 的 Supabase anon key 适配器**只用于维护 legacy 分配** | `references/database.md` |
| 文件 | 平台 Storage，经注入的 SDK 在 Function 内访问 | `references/storage.md` |
| AI | 走 QCA，服务端持有 `QODER_PAT` | `sites-build-agent-app/SKILL.md` |
| 发布 | `prepare_site` → `get_publish_status` → `publish_site` | `sites-hosting/references/deployment.md` |

### 明确不支持

不要假设有 Node server、框架 SSR 进程、Cloudflare Worker binding，或部署时安装依赖的能力。打包器不编译应用源码、不补齐缺失依赖。**框架应用必须产出兼容的静态输出，并把所有服务端行为放到 Function 之后。**（`environment.md`）

> 结论：Next.js 的 SSR、server components、API Routes 不能原样部署。页面里的 `cookies()`、`redirect()`、`export const dynamic = "force-dynamic"` 都需要前端替代方案。

### 平台保留命名空间

`/api`、`/internal`、`/__qoder_auth`、`/__qoder_internal`、`/functions`、`/storage`、`/rest/v1`、`/supabase` 归平台所有，应用路由与静态资源必须避开。`/api` **不是**本平台的默认函数入口。（`static-site.md`）

> 现有 18 个 `src/app/api/**/route.ts` 对应的对外路径，迁移后一律改为 `/functions/v1/app/...` 子路径。

### 产物大小上限

本地打包器：单次目录扫描 10 000 文件、单文件 50 MiB、Web 原始内容 450 MiB、Function 原始内容 50 MiB；本地 ZIP 100 MiB，而当前 Worker 有更严的 50 MiB 产物上限。服务端会独立校验解压大小、压缩比与当期配额，本地通过不代表服务端接受。（`static-site.md`）

> Novara 的静态产物远小于该上限，体积不是本项目的问题。

## 二、配额：只有返回值可信

| 资源 | 含义 |
| --- | --- |
| `sites_total` | 可发布网站总数上限，**含已创建未发布的草稿与删除中的资源** |
| `backend_sites` | 可开通数据库与存储的站点数上限；`limit = 0` 表示当前计划仅支持静态站点 |
| `storage_bytes` | 部署存储不足（历史版本也占额度） |
| `artifact_size_exceeded` | 单次部署产物超限，仅在被明确上报时才成立 |

上限数字只在触发 `sites_quota_exceeded` 时由返回值给出 `resource` / `used` / `limit`。当前处于限时免费阶段，官网不公开额度，**不建站就无法预知，不要用假设推演配额**。（`sites-hosting/references/limits.md`）

已核实到的一部分事实（2026-11-25，CN 区账号）：名下已有 3 个站点，其中 1 个的数据库状态为 `ready`，即已占用后端名额；两个上限数字尚未取得。

## 三、差距清单

| # | 项目 | 现状 | 迁移后 | 规模 |
| --- | --- | --- | --- | --- |
| 1 | 页面壳与根布局 | 6 处服务端读取会话：`layout.tsx` 用 `getSessionUser()` 给导航传用户名，5 个受保护页面用 `requireUser()` + `force-dynamic` 服务端跳转 | 根布局与页面全部静态化；身份由前端在挂载时请求接口获取，未登录由前端导航到登录页 | 8 个文件（1 布局 + 7 页面） |
| 2 | 组件请求 | 33 处 `fetch('/api/...')`；3 处 `next/link`、`useRouter`、`usePathname` | 前缀改 `/functions/v1/app/...`，路由改用前端方案 | 2158 行，8 个 `'use client'` 组件 |
| 3 | 服务端 | 18 个 `route.ts` | **一个** Deno Function 的路由表；同步 `prepare().all()` 改异步链式查询 | 948 行 |
| 4 | Schema | 8 张表 SQLite DDL，`INTEGER PRIMARY KEY AUTOINCREMENT`、`datetime('now')` | 走平台审批的迁移；主键改 `uuid`（服务端 `crypto.randomUUID()` 生成），时间列改 `timestamptz` | 105 行 DDL |
| 5 | 认证 | scrypt + `novara_session` Cookie + `sessions` 表 | 见下方未决项：自建账号（PBKDF2 + `__Host-` Cookie + 数据库会话与限流表）或平台身份 | `src/lib/auth.ts` 73 行 |
| 6 | 天气外部调用 | `open-meteo` 免 Key，高德需 `AMAP_KEY` | 外部请求在 Function 内发起；Key 走 Site Settings 的应用 Secret，Secret 名不得以 `QODER_` / `SUPABASE_` / `POSTGRES_` 开头，也不得叫 `DATABASE_URL` | `src/app/api/weather/route.ts` |

## 四、迁移顺序与并行边界

1. **先定 API 契约**：子路径、HTTP 方法、请求与返回体形状、401 / 403 / 404 / 405 / 503 语义。契约没落定前，前端与服务端不要并行动手，否则会互相返工。
2. Schema 与迁移审批（阻塞第 3 步）。
3. Function：业务路由 + 认证。
4. 前端：去 SSR 依赖、请求改造、路由方案。只依赖第 1 步的契约，可以提前起步。
5. 部署：`prepare_site`（含 `databaseAccess` 与已验证的 `schemaRef`，同一 `projectId`）→ `get_publish_status` → `publish_site` → **在部署环境实测**，本地通过不代表线上可用。
6. 演示数据：云端从空库开始，本地 `data/` 不迁移。

数据库迁移走 expand-and-contract：先加兼容表与可选列、保留线上版本，再发布使用它们的 Function，验证通过后才处理删除与权限收紧。失败的发布不构成回滚迁移或删除数据的理由。

## 五、决策与待实测

**已定**

- **身份方案**：平台 Qoder 上下文作为凭证，**用户记录与业务数据仍由本库 `app.users` 持有**（可解绑、可导出、可停用）。本期不建口令、不建会话表与限流表。理由：自建身份提供方在主流架构文档中被列为反模式，平台已提供 IdP，不属「别无选择」；同时避免引入「按 email / 名称自动关联账户」这类账号接管风险面。
- **不做口令不等于做不到**：#26 实测显示应用 Cookie 在**未开启** `forwardApplicationCredentials` 时就已到达 Function 原始 header。所以这条决策的依据不是能力受限，而是边际收益：「评委没 Qoder 账号也能看」已由**匿名只读样例**覆盖（约 30 行）；「开发时切换用户测隔离」已由**本地身份 fixture**覆盖（第九节）。剩下的唯一增量是「无 Qoder 账号也能**创建**数据」——若它成为硬需求，按 expand 加回：约 350–400 行 Function、3 张表（`sessions` / `auth_limiter` / `users` 口令列）、约 1 人日，并且必须同时实现「绑定只能在已认证会话内显式发起」这条防接管规则。

- **前端形态（已定，2026-11-25）**：部署形态改用 **Vite + React 静态壳**（`web/`），Next.js 形态保留用于本地开发与演示。判据不是偏好，而是三条硬事实：① 静态导出与 18 个 route handler 不能共存于一个产物；② `next/link` / `useRouter` / `usePathname` 在静态壳里没有对应物；③ 本地函数薄壳要求 Vite 代理 `/functions/v1/app`。代价是迁移期仓库里有两套页面壳，共用同一批 `src/components` 与 `src/lib`。产物落在 `out/web/`，`index.html` 与 `assets/` 同级，站点根是 `out/web/index.html`（`webDirectory` 取 `out/web`，无需引用目录外的文件）。
- **`/exams` 归阶段一**：8 张表里已有 `exams`，作业页的「考试记录」标签是既有可见功能，隐藏它等于砍掉已交付能力；实现成本是两个 handler。
- **匿名样例的落地方式**：Function 内以固定 uuid JIT 建「示例同学」并写入样例课程 / 课表 / 作业 / 任务 / 考试，**不改审批用的 `docs/sites-schema.sql`**；样例写入失败不放大成 5xx，只让访客读到空列表。

**待实测（不能靠猜实现）**

- **`function_backend` 查询客户端的能力面**：官方范例只演示了 `select` / `eq` / `order` / `limit` / `insert` / `insertIfAbsent` / `update` / `delete`。面板与 GPA 需要的 `or` / `in` / 范围比较**未经证实，必须实测**，不能按 Supabase 全集假设。
- **没有事务**：文档明确多次 SDK 调用不是一个事务，也不提供 Function 侧事务 API。批量导入与课表替换都按补偿式与幂等键设计（见契约「已定」）。
- **后端模型必须显式选**：#26 探针只申请 functions，平台却返回 `database_access_model:"legacy"` 并附带 storage。而 legacy **不能原地切换**——正式站第一步要 `ensure_backend(database + functions, databaseAccessModel:"function_backend")` 并回读确认，选错只能换站点重配。
- **平台身份的隔离性**：SDK 只校验格式不校验签名；Provider 直连、备用入口、跨租户路径是否已封堵需单独验证，未验证前不得按「已隔离」上线。
- **配额数值仍未知**：探针全程未触发 `sites_quota_exceeded`，`sites_total` / `backend_sites` 的 `used/limit` 只能等正式站 prepare 时报错取得。
- **部署账号**：站点 owner 就是执行发布的账号，后续改名、可见性与删除都在该账号下。多账号分别部署等于配额翻倍，但作品帖只能挂一个链接，其余站点仍需独立保持公开可访问。
- **前端形态**：插件自带 `templates/react-starter`（Vite + React + Tailwind v4）作为框架应用的官方起点；保留 Next.js 只做静态导出也可以，但需要把 server component 的 Cookie 与 redirect 用法全部下掉。**这是唯一还阻塞全部实现 PR 的决策。**

## 六、外部硬约束

- 报名与发布作品**同时**截止于 2026-11-30 18:00，提交物是天池赛题页的论坛帖 + Qoder Sites 公开地址。
- 开发与部署均需由 Qoder 完成，并在帖中说明使用过程，尽量多附截图凭证。
- 全部成员须在截止前完成天池实名认证与阿里云大学生认证，否则取消获奖资格。
- 作品介绍需覆盖：自我介绍 / 作品是什么 / 为什么做 / 怎么用（5 步以内）/ 用 Qoder 做出来的过程。
- 三人天池实名与阿里云大学生认证**均已完成**（2026-11-25 确认）。

## 七、部署环境实测记录

### 2026-11-25 · 探针站 #26（`auth-probe`，只含 functions + 静态页）

| 关注点 | 实测结果 | 对实现的影响 |
| --- | --- | --- |
| Function 收到的路径 | `/functions/v1/app/transport` → `path_seen = /app-<32位hex>/transport` | 函数名段被替换为**含部署哈希的物理名**、后缀保留。路由必须剥第一段，禁止硬编码 `app` |
| Function 看到的 host | `22.0.35.50:9998` | 内网地址。绝对 URL 一律读站点设置的 `APP_ORIGIN` |
| 登录态身份上下文 | `sdk_verdict:"accepted"`，`user_id` 长度 36，`has_org_id:false` | 平台身份路径可用，#27 前提成立 |
| 匿名请求 | `sdk_verdict:"absent"`、`logged_in:false`，**200 不是 403** | 只读分支判定可靠 |
| 应用 Cookie | `app_cookie_visible:true`（未开启 `forwardApplicationCredentials`）；第二轮补测 `Set-Cookie` 原样穿过网关、回环可见 | 自建口令与 Cookie 会话**技术上可做**，不做是取舍 |
| 物理函数名跨部署 | 第一次 `/app-d01a21202b2d8721698c8de860972f6d5`，第二次 `/app-d01a21285470d79b29ff2ae93f36b5f2f` | **同一次发布就变了**——硬编码路径必炸，只能剥第一段 |
| 未知 action | `404 {"error":"not_found"}` | 路由表的 404 分支在线上生效 |
| 私有站点 | 全部路径含静态首页 → `401 {"code":"sites_gateway_login_required"}` | 作品**必须设为公开访问**，否则评委只会看到这一行 JSON |
| 后端分配 | `capabilities:["functions","storage"]`、`database_access_model:"legacy"` | 见「五」：正式站要显式选 `function_backend`，legacy 不可原地切换 |
| 配额 | 全程无 `sites_quota_exceeded` | 两个上限仍未知；探针已使名下站点 3 → 4，且很可能消耗了一个后端名额 |
| 本地检查 | `deno check functions/index.ts` exit=0（Deno 2.9.8，装在 `D:\Programs\Deno`） | Function 有提交前类型检查；`npm run build` 只覆盖前端，二者不可互替 |

### 2026-11-25 · 阶段一本地实测（`dev/local.ts` + Vite 壳，**未部署**）

只证明业务逻辑与契约形状，不证明 RLS、配额、Set-Cookie、外部放行（见第九节边界说明）。

| 关注点 | 实测结果 | 对实现的影响 |
| --- | --- | --- |
| 路由匹配 | 本地以 `/functions/v1/app/<业务路径>` 进入，剥掉 `functions/v1` 与函数名段后命中；未知路径 `404 {"error":"接口不存在"}` | 与 #26 的物理名剥段口径一致，未硬编码 `app` |
| 方法约束 | `POST /auth/me` → `405` 且带 `allow: GET` | 405 由 Function 自己补，不再依赖 Next 代答 |
| 匿名只读 | `GET /auth/me` → `200 {"readOnly":true}`；业务 GET 返回样例 owner 数据并带 `x-novara-read-only: true` | 数组响应无法携带 `readOnly` 字段，改用响应头 + 对象响应内嵌两种形态并存 |
| 匿名写保护 | `POST/PATCH/PUT/DELETE` → `401 {"error":"登录后才能编辑"}` | 前端据此关掉写控件，不留 401 按钮 |
| 两账号隔离 | fixture A 与 B 各自的 `users.id` 下数据互不可见；B 改 A 的课程 → `404`，B 挂 A 的课程建作业 → `400 所选课程不存在` | owner 谓词逐条生效，跨用户即视为不存在 |
| 课表补偿式替换 | 注入「删除旧槽位失败」后：`503`，课表变成 **重复行而非空课表**；同载荷重试收敛为精确 2 行 | 「已定 4」在无事务环境下的顺序成立 |
| 重名课程 | `POST /courses` 命中 `UNIQUE(user_id,name)` → `409 课程名已存在，请改用其他名称` | 约束先于提示：本地 fake db 复刻了该唯一键 |
| 「今天」判定 | `scope=today` / `overdue` 以 Asia/Shanghai 日期字符串比较，与运行环境时区无关 | 「已定 3」落地；样例数据里同时存在今日与逾期项 |
| 面板配置 | `PUT /widgets` 走 `insertIfAbsent` + `update` 两步；`order` 逐项过滤到白名单 | 无 `ON CONFLICT DO UPDATE` 的等价实现 |
| 类型门禁 | `deno check functions/index.ts` 与 `deno check dev/local.ts` 均 exit=0；`npm run build`、`npm run build:web` 均通过 | 三者不可互替 |

**本轮对契约的两处实现方式修正**（语义不变，已同步 `docs/sites-api.md`）：

1. 过滤与排序下移到 Function 内存：阶段一所有查询只用已证实可用的 `eq`（外加 `select` / `order` / `limit`），`today` / `overdue` / 排序在自有行集上内存完成，避免押注未实测的 `or` / `in` / 范围比较。
2. `GET /auth/me` 与 `POST /auth/session` 共用同一套 JIT：任一先到都能完成绑定，前端启动只需一次请求；`/auth/session` 仍按契约保留。

## 八、红线清单（实现前对照，超出即返工）
### A. 形态级——做不到，不是麻烦

| # | 红线 | 对本项目的具体后果 |
| --- | --- | --- |
| 1 | 无 Node 运行时、无框架 SSR、无 server components、无 API Routes、无常驻进程、无后台任务与定时器 | 7 个页面壳 + 全部 route 都要重写形态 |
| 2 | **只有一个** Edge Function（逻辑名 `app`） | 18 个 route 合并成一份路由表 |
| 3 | 部署时不装依赖；打包器不编译源码、不补依赖 | import 必须自包含、带显式扩展名 |
| 4 | **无文件系统**：`node:fs`、`node:path`、`node:sqlite` 均不可用 | `src/lib/db.ts` 在 Sites 上一行都跑不了 |
| 5 | `node:crypto` 的 **scrypt 不存在**（WebCrypto 只有 PBKDF2 / HKDF） | 若做口令必须换算法，已存哈希作废 |
| 6 | **无事务**，也不提供 Function 侧事务 API | 课表替换、批量导入按补偿式与幂等键设计（见契约「已定」） |
| 7 | 保留路径：`/api`、`/functions`、`/storage`、`/internal`、`/__qoder_auth`、`/__qoder_internal`、`/rest/v1`、`/supabase` | 现有 `/api/*` 全部改名 |
| 8 | 数据库只能从 Function 访问；**legacy 模型不能原地切 `function_backend`** | 正式站第一步就要显式选对模型 |
| 9 | 产物 ≤50 MiB；`.git`、`node_modules`、`.env*`、私钥、`_qoder` 目录禁止入包 | 上传前检查 source map 与内嵌配置 |

### B. 运行时认知级——本轮实测出来的，最容易白踩

| # | 事实 | 规则 |
| --- | --- | --- |
| 10 | Function 看到的 host 是内网地址（`22.0.35.50:9998`） | 需要公网 origin 一律读站点设置的 `APP_ORIGIN` |
| 11 | 路径首段是**含部署哈希的物理名，每次部署都变**（两次实测不同） | 先剥第一段再匹配；禁止硬编码 `app` |
| 12 | 私有站点连静态首页都返回 `401 sites_gateway_login_required` | 作品必须 public，发布后核实访问模式 |
| 13 | 配额只在 `sites_quota_exceeded` 报错里给 `used/limit` | 不排"应该够用"的计划 |
| 14 | `next/headers` 的 `cookies()` / `redirect()` 没有对应物 | 6 处服务端会话读取必须下掉 |

## 九、本地开发与结构约束

迁移期间有一条铁律：**`main` 在任何时刻都必须能 `npm run dev` 跑起来、能登录、能演示**。因此在 Sites 形态验收通过之前，**不删除** `src/app/api/**` 与 `src/lib/auth.ts`；本地 Next 形态与部署形态并行存在，之后再一次性移除旧形态。

新形态的本地结构（对齐插件范例的依赖注入形状）：

```text
functions/
  app.ts        业务逻辑，纯依赖注入，不含任何平台 import
  shared/       computeGpa / 解析器等纯函数，Next 与 Deno 共用同一份实现
  index.ts      生产薄壳：注入平台 SDK（createDatabaseClient 等）
dev/
  local.ts      本地薄壳：注入 fake db 与 fixture 身份，绑定 127.0.0.1:8000
```

四条要点：

1. `_qoder/backend.mjs` 只在部署时由平台注入，本地不存在 → **`index.ts` 不得进本地测试路径**，业务逻辑必须能脱离它运行。
2. 前端同源代理：Vite dev 把 `/functions/v1/app` 代理到 `127.0.0.1:8000` 并保留路径。**代理配置不是生产路由**，本地通过不构成线上证据。
3. 身份用开发态 fixture（`A` / `B` / `anonymous` / `error` 四态）而不是给用户加口令。生产端点**不得包含 fixture 开关**——`functions/` 目录内出现 `fixture` 字样即视为缺陷。
4. 本地持久化：`dev/` 里的 fake db 需把数据落 JSON 文件，否则重启即丢，测不了面板配置与成绩持久化。
5. 纯逻辑只放 `functions/shared/` 一份，Next 也从那 import。**不要维护两份 `gpa.ts`**——分叉的是 I/O 层，不是算法层。

> 边界说明：本地跑通只证明业务逻辑，不证明 RLS、配额、Set-Cookie 行为、外部接口放行。这些只有部署环境算数（见第七节）。
