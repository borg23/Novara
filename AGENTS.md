# AGENTS.md

面向编码代理与新加入开发者的仓库约定。给人看的产品说明见 [README.md](README.md)。部署到 Qoder Sites 的三份文档各有分工：[docs/sites.md](docs/sites.md) 是能力边界与实测记录，[docs/sites-api.md](docs/sites-api.md) 是 Function 与前端的接口契约，[docs/sites-schema.sql](docs/sites-schema.sql) 是目标库结构。

## 项目定位

面向学生的作业与课程管理工具，网站端，多用户，学生数据按 `user_id` 严格隔离。当前形态是 Next.js 全栈应用，数据落在仓库本地的 SQLite 文件。

## 仓库布局

| 路径 | 职责 |
| --- | --- |
| `src/app/` | 路由入口。`layout.tsx` 与 7 个 `page.tsx` 都是薄壳：根布局只挂 `IdentityProvider` 与导航，页面壳不再做任何服务端会话读取，2 个登录/注册页直接渲染表单 |
| `src/app/api/` | 19 个 REST 路由文件（auth / courses / course slots / assignments / exams / tasks / focus / widgets / gpa / weather）——**仅本地 Next 形态使用**，Sites 形态走 `functions/` |
| `src/components/` | 全部 UI 与业务交互，9 个 `'use client'` 组件（含 `identity.tsx`），请求一律经 `src/lib/api.ts` 发出 |
| `src/lib/` | `db.ts`（`node:sqlite` 连接与建表）、`auth.ts`（scrypt 口令与会话 Cookie）、`gpa.ts`、`weather.ts`、`http.ts`（响应辅助）、`api.ts`（两形态共用的请求前缀 `/functions/v1/app`） |
| `functions/` | Sites 形态的单个 Edge Function：`app.ts`（业务，纯依赖注入）、`index.ts`（平台注入薄壳）、`auth.mjs`（逐字复制插件 `assets/user-context/auth.mjs` 的身份读取）、`shared/`（Next 与 Deno 共用的纯函数） |
| `dev/` | `local.ts` 本地薄壳：注入 fake db（落 `dev/.data.json`，已 gitignore）与四种本地身份，绑定 `127.0.0.1:8000` |
| `web/` | 部署形态的静态壳：Vite + React 入口与 `vite.config.mts`，复用 `src/components` 与 `src/lib`，产物 `out/web/index.html` 为站点根 |
| `data/` | 运行期生成的 `novara.db`，已 gitignore，不属于交付物 |

## 如何运行

要求 Node.js ≥ 22.5（依赖内置 `node:sqlite`；`package.json` 未声明 `engines`，以 README 口径为准）。

```bash
npm install
cp .env.example .env   # 可选，四项都有默认值
npm run dev            # http://localhost:3000
```

## 命令

| 目的 | 命令 | 状态 |
| --- | --- | --- |
| 开发（本地 Next 形态） | `npm run dev` | 可用 |
| 构建（本地 Next 形态） | `npm run build` | 可用，且是改动后的主验证手段（Next 构建默认做类型检查） |
| 生产启动 | `npm start` | 可用 |
| 本地函数薄壳 | `npm run dev:function` | 可用；数据落 `dev/.data.json`，身份切换页 <http://127.0.0.1:8000/__local> |
| 开发（Sites 静态壳） | `npm run dev:web` | 可用；需先起 `npm run dev:function`，Vite 把 `/functions/v1/app` 代理到 `127.0.0.1:8000` |
| 构建（Sites 静态壳） | `npm run build:web` | 可用；先 `tsc -p web` 类型检查，再产出 `out/`（`out/web/index.html` 为站点根） |
| 测试 | 无 | 仓库没有测试框架，也没有测试用例。**不要臆造 `npm test`** |
| Lint | 无 | 未配置 ESLint / Prettier，也没有配置文件 |
| Function 类型检查 | `deno check functions/index.ts` | 仅用于部署形态的 Edge Function；本机 Deno 2.9.8 已就绪。**`npm run build` 不覆盖 Function** |

## 工程规范

- 改动走分支 + PR，`main` 不接受直接 push。
- PR 由 `.github/CODEOWNERS` 自动请求 `@borg23/project-novara` 审核；`main` 要求 1 个批准 + code owner 批准，**对管理员同样生效**，所以作者无法合并自己的 PR。
- 处于 `CHANGES_REQUESTED` 状态的 PR 不允许「先合并再补说明」。要么补评审要求的证据后请人 re-review，要么由评审人主动改为批准并在 issue 里记下这个例外。
- 分支前缀：`feat/`、`fix/`、`docs/`、`migrate/`。
- commit 用 Conventional Commits 描述中文内容，关联 issue 用 `(Closes #N)`；一条 commit 只关闭一条可独立验证的 issue。
- 新 issue 用 `.github/ISSUE_TEMPLATE/` 的模板：一个 issue 只装一个可独立验证的工作单元，关闭前须在评论里附达成证据。
- `bug` 标签只表示已复现的缺陷；尚未复现的风险改用「功能与改动」模板并在标题加 `[预登记]`。
- 新接口放在 `src/app/api/<资源>/route.ts`，参数校验留在 route 函数内，数据访问只经 `src/lib/db.ts` 导出的 `getDb()`。
- UI 新代码进 `src/components/`，页面壳保持薄壳，不要把业务逻辑写回 `page.tsx`。

## 约束与禁令

- **每一条数据访问都必须带 `user_id` 谓词。** 示例：`db.prepare("SELECT ... FROM assignments WHERE user_id = ?")`。漏一个谓词就是学生 A 看到学生 B 的课表，这是本项目唯一的数据安全边界。
- 除 `auth` 下三条路由外，每个 API handler 的第一件事是 `await getSessionUser()`，为空返回 `unauthorized()`（401）。
- SQL 一律用 `prepare()` 占位符传参，不拼接用户输入。
- 不修改、不提交 `data/`、`.env`、`.env.local`；它们已在 `.gitignore` 中，禁止解除忽略。
- 口令与会话（**仅本地 Next 形态**）：哈希是 `scrypt` 的 `salt:hash`，会话表只存令牌的 SHA-256 摘要（`sessions.token_hash`）。更换算法或哈希长度会让已注册账号与会话全部失效。部署到 Qoder Sites 的形态**不建口令、不建会话表**，身份来自平台注入上下文——两套模型并存是刻意分叉，见 `docs/sites.md`。
- 会话 Cookie 名 `novara_session`，属性为 HttpOnly + SameSite=Lax + `SESSION_DAYS` 有效期；放宽这些属性属于安全回退，需在 PR 里单独说明。
- **部署形态的 owner 只能来自服务端注入的平台上下文或已解析的 app 身份**，客户端传入的任何用户 id 一律忽略。
- **禁止按 email / 用户名 / 显示名自动关联账户**，唯一匹配路径是 `users.qoder_user_id` 精确相等（同类缺陷见 Keycloak CVE-2026-97175）。
- 部署形态的路由必须**剥掉路径第一段再匹配**：Function 实际收到的是 `/app-<部署哈希>/...`，禁止硬编码 `app`。需要绝对 URL 时读站点设置的 `APP_ORIGIN`，不得用 `request.url` 的 host。
- 动 Sites 形态的实现前，先对照 `docs/sites.md` 第八节**红线清单**（14 条）。超出平台能力的方案不是"麻烦"，是做不到，会整段返工。
- **迁移期间 `main` 必须始终 `npm run dev` 可跑、可登录、可演示**：Sites 形态验收通过前不删除 `src/app/api/**` 与 `src/lib/auth.ts`。
- Function 目录结构：业务逻辑在 `functions/app.ts`（纯依赖注入），平台注入只在 `functions/index.ts`，本地薄壳在 `dev/`。`_qoder/` 由平台注入，**本地不可 import，也禁止创建该目录**。
- 纯函数只在 `functions/shared/` 存一份，Next 与 Deno 共用。不维护两份 `gpa.ts`——分叉的只能是 I/O 层，不是算法层。
- 开发态身份 fixture（`A` / `B` / `anonymous` / `error`）只允许出现在 `dev/`；**`functions/` 目录内出现 `fixture` 字样即视为缺陷**。
- 不在本仓库引入新的运行时依赖去"顺手优化"；依赖变更只允许服务于交付目标本身。
- `data/` 下是本地运行期数据，不提交、不上传、不作为对外截图或演示素材。
- 依赖变更的唯一豁免：`vite` 与 `@vitejs/plugin-react` 作为 `devDependencies` 服务静态壳构建，**不得**新增任何运行时依赖，也不得把两者打进 Function 包。
- 组件层只允许经 `src/lib/api.ts` 发请求，前缀固定 `/functions/v1/app`；本地 Next 形态靠 `next.config.mjs` 的 `rewrites` 把它映射回既有 `/api` 路由。不要在组件里写死 `/api`，也不要在部署形态引入第二套前缀。
- 阶段二能力（GPA 与成绩单上传、专注计时与聚合、天气、批量导入）在部署形态里**只隐藏入口，不留半成品交互**：写控件由 `IfWritable` 与 `features` 共同关掉，不得留下点了只会 401 的按钮。

## 完成的定义

一次改动算完成，当且仅当：

1. `npm run build` 通过。
2. 浏览器手测以下两条不变量，并把截图附在 PR 或 issue 评论里：
   - 未登录访问 `/homework`、`/courses`、`/gpa`、`/focus` 任一页跳转 `/login`（部署形态下改为：匿名只能读到只读样例且写操作被拒，见 `docs/sites-api.md`）；
   - 两个账号各自注册后，作业 / 课程 / 成绩 / 面板配置互不可见。
3. 涉及新页面、新接口或新环境变量时，README 对应小节同步更新。
4. 改动 Edge Function 时 `deno check functions/index.ts` 通过——`npm run build` 不覆盖 Function。

本仓库没有自动化测试与 CI，第 2 步是唯一的回归防线。缺少这两项证据的 PR 视为未完成。
