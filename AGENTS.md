# AGENTS.md

面向编码代理与新加入开发者的仓库约定。给人看的产品说明见 [README.md](README.md)；部署到 Qoder Sites 的硬约束与迁移顺序见 [docs/sites.md](docs/sites.md)。

## 项目定位

面向学生的作业与课程管理工具，网站端，多用户，学生数据按 `user_id` 严格隔离。当前形态是 Next.js 全栈应用，数据落在仓库本地的 SQLite 文件。

## 仓库布局

| 路径 | 职责 |
| --- | --- |
| `src/app/` | 路由入口。`layout.tsx` 与 7 个 `page.tsx` 都是薄壳：根布局和 5 个受保护页面读取会话，2 个登录/注册页直接渲染表单 |
| `src/app/api/` | 18 个 REST 路由文件（auth / courses / course slots / assignments / exams / tasks / focus / widgets / gpa / weather） |
| `src/components/` | 全部 UI 与业务交互，8 个 `'use client'` 组件，请求都从这里直接发出 |
| `src/lib/` | `db.ts`（`node:sqlite` 连接与建表）、`auth.ts`（scrypt 口令与会话 Cookie）、`gpa.ts`、`weather.ts`、`http.ts`（响应辅助） |
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
| 开发 | `npm run dev` | 可用 |
| 构建 | `npm run build` | 可用，且是改动后的主验证手段（Next 构建默认做类型检查） |
| 生产启动 | `npm start` | 可用 |
| 测试 | 无 | 仓库没有测试框架，也没有测试用例。**不要臆造 `npm test`** |
| Lint | 无 | 未配置 ESLint / Prettier，也没有配置文件 |

## 工程规范

- 改动走分支 + PR，`main` 不接受直接 push。
- 分支前缀：`feat/`、`fix/`、`docs/`、`migrate/`。
- commit 用 Conventional Commits 描述中文内容，关联 issue 用 `(Closes #N)`；一条 commit 只关闭一条可独立验证的 issue。
- 新接口放在 `src/app/api/<资源>/route.ts`，参数校验留在 route 函数内，数据访问只经 `src/lib/db.ts` 导出的 `getDb()`。
- UI 新代码进 `src/components/`，页面壳保持薄壳，不要把业务逻辑写回 `page.tsx`。

## 约束与禁令

- **每一条数据访问都必须带 `user_id` 谓词。** 示例：`db.prepare("SELECT ... FROM assignments WHERE user_id = ?")`。漏一个谓词就是学生 A 看到学生 B 的课表，这是本项目唯一的数据安全边界。
- 除 `auth` 下三条路由外，每个 API handler 的第一件事是 `await getSessionUser()`，为空返回 `unauthorized()`（401）。
- SQL 一律用 `prepare()` 占位符传参，不拼接用户输入。
- 不修改、不提交 `data/`、`.env`、`.env.local`；它们已在 `.gitignore` 中，禁止解除忽略。
- 口令哈希格式是 `scrypt` 的 `salt:hash`，会话表只存令牌的 SHA-256 摘要（`sessions.token_hash`）。更换算法或哈希长度会让已注册账号与会话全部失效，除迁移方案明确要求外不要改动。
- 会话 Cookie 名 `novara_session`，属性为 HttpOnly + SameSite=Lax + `SESSION_DAYS` 有效期；放宽这些属性属于安全回退，需在 PR 里单独说明。
- 不在本仓库引入新的运行时依赖去"顺手优化"；依赖变更只允许服务于交付目标本身。
- `data/` 下是本地运行期数据，不提交、不上传、不作为对外截图或演示素材。

## 完成的定义

一次改动算完成，当且仅当：

1. `npm run build` 通过。
2. 浏览器手测以下两条不变量，并把截图附在 PR 或 issue 评论里：
   - 未登录访问 `/homework`、`/courses`、`/gpa`、`/focus` 任一页跳转 `/login`；
   - 两个账号各自注册后，作业 / 课程 / 成绩 / 面板配置互不可见。
3. 涉及新页面、新接口或新环境变量时，README 对应小节同步更新。

本仓库没有自动化测试与 CI，第 2 步是唯一的回归防线。缺少这两项证据的 PR 视为未完成。
