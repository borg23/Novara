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

## 五、未决项

- **认证方案**：自建账号在插件里有完整范例（`assets/application-auth/password/`，注册 / 登录 / 数据库会话 / 固定窗口限流），但它依赖 `createSiteContext(request, { forwardApplicationCredentials: true })`，文档明确要求**部署前确认目标 Worker 具备该能力**，旧版本会静默丢弃凭证。另一条路是使用平台注入的身份上下文，代价是注册与登录页不再是本项目实现。
- **`function_backend` 查询客户端的能力面**：官方范例只演示了 `select` / `eq` / `order` / `limit` / `insert` / `insertIfAbsent` / `update` / `delete`。面板与 GPA 需要的 `or` / `in` / 范围比较**未经证实，必须实测**，不能按 Supabase 全集假设。
- **没有事务**：文档明确多次 SDK 调用不是一个事务，也不提供 Function 侧事务 API。成绩单批量导入（按课程名逐行 upsert）需要按幂等键重新设计，不能假设原子性。
- **部署账号**：站点 owner 就是执行发布的账号，后续改名、可见性与删除都在该账号下。多账号分别部署等于配额翻倍，但作品帖只能挂一个链接，其余站点仍需独立保持公开可访问。
- **前端形态**：插件自带 `templates/react-starter`（Vite + React + Tailwind v4）作为框架应用的官方起点；保留 Next.js 只做静态导出也可以，但需要把 server component 的 Cookie 与 redirect 用法全部下掉。该选择尚未落定。

## 六、外部硬约束

- 报名与发布作品**同时**截止于 2026-11-30 18:00，提交物是天池赛题页的论坛帖 + Qoder Sites 公开地址。
- 开发与部署均需由 Qoder 完成，并在帖中说明使用过程，尽量多附截图凭证。
- 全部成员须在截止前完成天池实名认证与阿里云大学生认证，否则取消获奖资格。
- 作品介绍需覆盖：自我介绍 / 作品是什么 / 为什么做 / 怎么用（5 步以内）/ 用 Qoder 做出来的过程。
