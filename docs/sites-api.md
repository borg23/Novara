# Sites 侧 API 契约（v2 · 身份方案已并入）

对应 issue #18。这份文档是 Function 与前端唯一共同依赖的接口约定：**契约改动即两个 PR 同时改**，不允许某一侧先动。

现状依据是 `src/app/api/**/route.ts` 的 18 个文件逐个读出来的，不是设计构想。每条都标了它是「等价搬迁」还是「新增」，「新增」是现在没有、静态化后必须补的能力。

- 状态：契约条目已齐；5 处行为决策按工程最佳实践落定（见「已定」）；身份方案改为平台绑定后已重写「认证与身份」小节。评审通过后转定稿。
- **阶段一实现范围**：`/auth/session`、`/auth/me`、`/courses`（含 `{id}` 与 `{id}/slots`）、`/assignments`（含 `{id}`）、`/exams`（含 `{id}`）、`/tasks`（含 `{id}`）、`/widgets`、`/settings`。**阶段二未实现**：`/assignments/import`、`/focus`、`/gpa`、`/gpa/upload`、`/weather`——部署形态隐藏入口，不留半成品交互。
- 前缀：`/functions/v1/app`（下文省略），全部同源、`credentials: 'same-origin'`。Function 侧看到的实际路径形态见「通用约定 · 路由匹配」。
- 命名空间：`/api` 是平台保留路径，因此 `/api/*` → 业务子路径一对一改名，不改变层级语义。

## 通用约定

| 项 | 规定 | 理由 |
| --- | --- | --- |
| 字段大小写 | Function 输出 **camelCase**，与现在完全一致（`dueDate` / `assignmentId` / `courseName`） | 新库列是 snake_case，由 Function 做别名映射，前端 33 处 fetch 只需改前缀，不改字段读取 |
| 请求体 | `application/json`；除 `/gpa/upload` 的解析请求为 `multipart/form-data` | 现状即如此 |
| 错误体 | 统一 `{ "error": "<中文提示>" }`，前端直接展示 | 现有 `src/lib/http.ts` 的全部错误返回都是这个形状 |
| 状态码 | 400 输入无效 / 401 未登录或会话过期 / 403 身份上下文无效 / 404 资源不属于本用户或路径未知 / 405 方法不支持 / 409 唯一冲突 / 502 上游失败 / 503 依赖不可用 | 现状只有 400/401/404/409/502；403、405、503 是 Function 路由表必须自己补的（Next 会代答 405） |
| 列表默认排序 | 保持现状 SQL 的 `ORDER BY` 语义，不在迁移期顺手调整 | 面板与作业页的顺序感是用户已习惯的行为 |
| 方法约束 | GET 不得改状态；写方法需显式白名单 | 平台文档要求 |
| **路由匹配** | 先剥掉路径第一段再匹配业务子路径。**禁止硬编码 `app`**，也禁止按 `/functions/v1/app` 整段前缀匹配 | 实测（#26）：浏览器请求 `/functions/v1/app/transport`，Function 侧 `path_seen` 是 `/app-<32位hex>/transport`——函数名段被替换为**含部署哈希的物理名，每次部署可能变**，后缀保留 |
| **绝对 URL** | 需要公网 origin 时一律读站点设置的 `APP_ORIGIN`，不得由 `request.url` 拼接 | 实测（#26）：Function 看到的 host 是 `22.0.35.50:9998`（内网地址） |
| **只读标记的载体** | 对象响应（`/widgets`、`/gpa`、`/focus`）内嵌 `"readOnly": true`；**数组响应无法带字段，改用响应头 `x-novara-read-only: true`** | 「无上下文时业务 GET 返回样例数据且响应带 readOnly」这条对数组必须有个可实现的落法；前端以 `/auth/me` 为主判据，响应头用于兜底 |
| **谓词能力** | 阶段一只使用已证实可用的 `select` / `eq` / `order` / `limit` / `insert` / `insertIfAbsent` / `update` / `delete`；`today` / `overdue` / 排序在 Function 内存对**该 owner 自有行集**完成 | `or` / `in` / 范围比较仍无返回值证据（见「仍需实测」），不押注；内存过滤与现状 SQL 语义等价 |

## 认证与身份

本期**不做自建口令**：身份来自平台注入的 Qoder 上下文，但用户记录与业务数据仍由本库持有（`users` 表在，可解绑、可导出）。`/auth/register`、`/auth/login`、`/auth/logout` 三条**不迁移**——本地 Next 版本保留它们直到前端改造完成，属已知分叉，见文末。

| 子路径 | 方法 | 状态 | 请求 | 成功返回 | 关键规则 |
| --- | --- | --- | --- | --- | --- |
| `/auth/session` | POST | **新增** | 无 | `{id, displayName}` | 登录回跳后调用。读服务端注入上下文 → 按 `users.qoder_user_id` 查 → 未命中即 JIT 建号。幂等依据是该列的 `UNIQUE`，用 `insertIfAbsent`；若返回空说明并发已命中，改为**再读一次**而不是重试写。新用户同时插入默认 `widget_configs` 行（现状注册流程的等价行为） |
| `/auth/me` | GET | **新增** | 无 | 已登录 `{id, displayName, readOnly:false}`；匿名 `{readOnly:true}` 且 **200** | 替代 `layout.tsx` 的 `getSessionUser()` 与 5 个页面的 `requireUser()`。匿名不返 401，前端据此渲染只读横幅与登录入口，而不是跳登录页。**已登录时与 `/auth/session` 共用同一条 JIT 路径**：任一先到都完成绑定，前端启动只需一次请求；`/auth/session` 仍按契约保留给登录回跳显式调用 |

**匿名与写保护**

- 无上下文时，业务 **GET** 一律返回公开的只读样例 owner 数据，200 且响应带 `"readOnly": true`。
- 无上下文时，业务**写方法**（POST / PATCH / PUT / DELETE）一律 401 `{"error":"登录后才能编辑"}`。
- 401（未登录）与 403（上下文格式非法 `invalid_user_context`）界面必须区分：后者**不得**提示用户重新登录。

**安全规则（不可协商）**

- **owner 只能来自服务端注入上下文或已解析的 app 身份**；客户端传入的任何用户 id 一律忽略。
- **禁止按 email / 用户名 / 显示名自动关联既有账户**，唯一匹配路径是 `users.qoder_user_id` 精确相等。同类缺陷见 Keycloak CVE-2026-97175。
- 浏览器 `GET /__qoder_auth/me` 只可用于界面展示，**不得作为凭证**参与任何服务端判定。

> 实测依据（#26）：登录态 `context → {"sdk_verdict":"accepted","logged_in":true,"user_id_length":36}`；匿名态 `→ {"sdk_verdict":"absent","logged_in":false}`。**是缺失而不是无效**，因此上面的只读分支判定可靠。

## 课程与课表

| 子路径 | 方法 | 状态 | 返回 / 请求 | 校验与备注 |
| --- | --- | --- | --- | --- |
| `/courses` | GET | 等价搬迁 | 数组，每项含 `id,name,teacher,credits,grade,status,semester,color,createdAt,slots[]` | `slots` 由 Function 二次聚合进课程（现状是在 route 里 join 后按 courseId 分组），排序 `dayOfWeek, startTime`；课程按 `name` 排序 |
| `/courses` | POST | 等价搬迁 | `{name, teacher?, credits?, grade?, status?, semester?, color?}` → `{id,name}` | `name` 非空；`status ∈ {planned,in_progress,completed}`；`credits` 非法按 0；`color` 默认 `#6366f1` |
| `/courses/{id}` | PATCH | 等价搬迁 | 同 POST 字段，全部可选 → `{ok:true}` | 不属于本用户 → 400 字段无效 / 404 不存在；空更新 400 `没有可更新的字段` |
| `/courses/{id}` | DELETE | 等价搬迁 | → `{ok:true}` | 无匹配 404 |
| `/courses/{id}/slots` | PUT | **语义已重设计（无事务安全）** | `{slots:[{dayOfWeek,startTime,endTime,location?,weeks?}]}` → `{ok:true}` | 现状是 `DELETE 全部 + 逐行 INSERT`，平台无事务，中途失败会留下空课表。改为**补偿式替换**，见「已定 4」 |

`dayOfWeek` 取值 1–7 且必须为整数，否则 400 `星期取值需为 1-7`；`startTime`/`endTime` 必填；`weeks` 默认 `"all"`。

## 作业与考试

| 子路径 | 方法 | 状态 | 返回 / 请求 | 校验与备注 |
| --- | --- | --- | --- | --- |
| `/assignments?scope=all\|today\|overdue` | GET | 等价搬迁（过滤语义需重实现） | 数组，含 `id,title,description,dueDate,status,priority,courseId,courseName,courseColor,createdAt` | `today`＝未完成且截止日为「今天」；`overdue`＝未完成且截止日早于今天。现状用 `date(...)=date('now','localtime')`，**链式客户端无法表达该谓词**，改法见「已定 3」 |
| `/assignments` | POST | 等价搬迁 | `{title, description?, dueDate?, courseId?, priority?}` → `{id,title}` | `title` 非空；`courseId` 非空时必须属于本用户，否则 400 `所选课程不存在`；`priority` 非法按 0 |
| `/assignments/{id}` | PATCH | 等价搬迁 | 同 POST + `status` → `{ok:true}` | `status ∈ {todo,done}`；其余同课程 PATCH 规则 |
| `/assignments/{id}` | DELETE | 等价搬迁 | → `{ok:true}` | 无匹配 404 |
| `/assignments/import` | POST | 等价搬迁，**需幂等键** | `{text}` → `{created:[{id,title,courseName}], failed:[{line,error}], total}` | 每行「课程名, 作业标题, 截止日期(可选)」，分隔符 `,`/`;`/Tab；课程按 `user_id + name` 匹配，不存在则自动建（`credits 0, status in_progress`）。逐行写入无原子性，见「已定 5」 |
| `/exams` | GET | 等价搬迁 | 数组，含 `id,title,examDate,score,note,courseId,courseName,courseColor` | 排序 `examDate` 空值最后，再按日期，再按 `id DESC` |
| `/exams` | POST | 等价搬迁 | `{title, examDate?, score?, note?, courseId?}` → `{id,title}` | `title` 非空；`score` 非空时必须为 0–100，否则 400 `成绩需在 0-100 之间` |
| `/exams/{id}` | PATCH / DELETE | 等价搬迁 | → `{ok:true}` | 同上校验规则 |

## 任务、计时、面板

| 子路径 | 方法 | 状态 | 返回 / 请求 | 校验与备注 |
| --- | --- | --- | --- | --- |
| `/tasks?scope=all\|today` | GET | 等价搬迁 | 数组 `{id,title,dueDate,status,createdAt}` | `today` 语义同作业；排序「未完成优先 → 无截止日最后 → 截止日 → 创建时间倒序」 |
| `/tasks` | POST | 等价搬迁 | `{title, dueDate?}` → `{id,title}` | `title` 非空否则 400 |
| `/tasks/{id}` | PATCH / DELETE | 等价搬迁 | → `{ok:true}` | `status ∈ {todo,done}` |
| `/focus` | GET | **聚合方式已定，不再是截断语义** | `{records:[{id,assignmentId,assignmentTitle,startedAt,durationSec,note}], todayTotalSec, perAssignment:[{assignmentId,title,totalSec,count}]}` | `records` 改为分页返回（200 条一页，带 `hasMore` / `nextOffset`）。`todayTotalSec` 与 `perAssignment` **必须覆盖全部行**，不得受 `records` 页大小影响——现状 `LIMIT 200` 之后仍对全表聚合，若照搬会静默少算，见「已定 2」 |
| `/focus` | POST | 等价搬迁 | `{assignmentId?, startedAt?, durationSec, note?}` → `{id}` | `durationSec` 必须落在 1–86400，否则 400 `时长无效`；`assignmentId` 非空时须属于本用户，否则 400 `所选作业不存在`；`startedAt` 解析失败则回落当前时间 |
| `/widgets` | GET | 等价搬迁 | `{columns, style, order:[...]}` | 无配置行时返回默认：`columns 2`、`style card`、`order = ["todayTasks","homework","calendar","schedule","weather","timer","gpaSummary"]`；`order_json` 解析失败同样回落默认 |
| `/widgets` | PUT | 等价搬迁，upsert 需两步 | `{columns, style?, order}` → `{ok:true, columns, style, order}` | `columns ∈ {1,2,3}` 否则 400 `列数需为 1、2 或 3`；`style ∈ {card,flat}`；`order` 必须是字符串数组且**逐项过滤到白名单**后落库。现状是 `ON CONFLICT(user_id) DO UPDATE`，链式客户端需 `insertIfAbsent` + `update` 两步（无事务，但重复执行结果一致，可接受） |

## 主题设置

| 子路径 | 方法 | 状态 | 返回 / 请求 | 校验与备注 |
| --- | --- | --- | --- | --- |
| `/settings` | GET | 等价搬迁 | `{theme}` | 无配置行时返回默认 `theme: "system"`；`theme ∈ {light,dark,system}`，落库值非法则回落 `system` |
| `/settings` | PUT | 等价搬迁，upsert 需两步 | `{theme}` → `{ok:true, theme}` | `theme ∈ {light,dark,system}` 否则 400 `主题需为 light、dark 或 system`；upsert 同 `/widgets`：`insertIfAbsent` + `update` 两步 |

## GPA

| 子路径 | 方法 | 状态 | 返回 / 请求 | 校验与备注 |
| --- | --- | --- | --- | --- |
| `/gpa` | GET | 等价搬迁 | `{summary, courses:[{name,credits,grade,status,semester}]}` | `summary` 由 `computeGpa` 在内存算得，与数据库无关，可直接搬到 Function。毕业目标学分现在来自 `GPA_TARGET_CREDITS` 环境变量 → 迁移后走 Function 的应用 Secret 或写死默认值 |
| `/gpa/upload` | POST | 等价搬迁 | multipart `file`（`.csv` / `.json`）→ `{rows, summary, hasError}` | **不写库**，只解析预览。表头支持中英文别名；成绩支持百分制与等级；无法识别的行 `error: "成绩无法识别"`。Deno 侧用 `request.formData()` 取文件后按文本解析 |
| `/gpa/upload` | PUT | 等价搬迁，**需幂等键** | `{rows:[...]}` → `{ok:true, created, updated}` | 按 `user_id + name` 匹配，存在则更新 `credits/grade/status/semester`，否则插入。逐行读后写，无原子性 |

## 天气

| 子路径 | 方法 | 状态 | 返回 / 请求 | 校验与备注 |
| --- | --- | --- | --- | --- |
| `/weather?city=<id>` | GET | 等价搬迁 | `{provider, city, current:{temp,text,wind}, daily:[{date,max,min,text}]}` | 上游请求必须在 Function 内发起，8 秒超时保留；上游失败返回 **502** `{provider, city, error}`（现状如此）。`city` 未知 400 `未知城市`，默认 `beijing`。`WEATHER_PROVIDER` 与 `AMAP_KEY` 迁到站点设置的应用 Secret，Secret 名不得用 `QODER_`/`SUPABASE_`/`POSTGRES_` 前缀或 `DATABASE_URL` |

## 已定（本轮按工程最佳实践落定，改动需同时改两侧）

1. **`courses(user_id, name)` 加唯一约束**（schema 已写）。代码在两处导入里都按这个组合匹配课程，即已经假定唯一；库不保证时，同名课程命中哪一行是未定义行为。约束补上后，**重名课程在导入时报错而不是随机命中**：`/assignments/import` 与 `/gpa/upload` 对同名冲突返回逐行错误 `课程名重复，请先合并`。空库上线使这一改动没有历史数据成本。
2. **聚合下移方式**：`todayTotalSec` 用「当日日期范围 + 只读 `duration_sec` 一列」取回该用户当天的全部行后在 Function 内存求和——一天的行数天然有界；`perAssignment` 读该用户全部行的 `(assignment_id, duration_sec)` 两列后内存聚合。`records` 列表单独按 200 条分页。**核心要求是聚合结果不受分页大小影响**，与现状 SQL 在全表上 `SUM` 的语义一致。当单用户行数超过约 5000、或响应体接近上限时，再引入按天汇总表——触发条件写在这里，避免到时候凭感觉决定。
3. **「今天」的时区显式化**：Function 侧以 `Asia/Shanghai` 计算当天日期字符串，再对 `date` 列做等值或范围比较；不依赖运行环境时区。现状 `datetime('now')`（UTC）写入、`date('now','localtime')`（服务器时区）判定，本来就是矛盾的，部署到非东八区会出现「今日作业」变空。
4. **`/courses/{id}/slots` 改为补偿式替换**，请求形状不变（仍是不带 id 的整个数组，前端无需改）：先为该课程插入打上批次标记（`course_slots.batch_id` 可空列）的全部新槽位，插入成功后再删除该课程不在此批次内的旧槽位。任一步失败的后果是**多出重复行而不是丢课表**；重试同一载荷时先清掉自己上一次的残留批次再重新插入；仍失败返回 503 并让前端保留原载荷，不自动重放。这是无事务环境下唯一不把用户数据置于丢失风险的顺序。
5. **两个批量导入必须带 `Idempotency-Key`**（一次用户提交生成一次，重试沿用同一个）：`/assignments/import` 与 `PUT /gpa/upload`。配合第 1 条的唯一约束，用 `insertIfAbsent` 让重复提交落到同一行。响应丢失后前端只做**显式重试**——平台明确不重试写。

## 仍需实测（阻塞项，不能靠猜实现）

- **`function_backend` 客户端的能力面**：`or` / `in` / 范围比较 / 显式列裁剪是否在范例演示之外可用，必须在 #20 开工前实测拿到返回值确认。本文所有过滤条件（`today` / `overdue` / 日期范围）都押在这项能力上。
- **平台身份路径的隔离性**：身份上下文由网关注入、SDK 只校验格式不校验签名；是否已封堵 Provider 直连与跨租户路径需单独验证，未验证前不得按「已隔离」上线。
- **配额**：`sites_total` 与 `backend_sites` 的 `used/limit` 只能在真实 `prepare_site` 报错时取得。#26 探针全程未触发报错，因此两个上限仍未知；且探针只申请 functions 却自动带上了 storage。
- **外部调用放行**：`open-meteo` 与高德接口从 Function 侧发起是否可达，需在部署环境实测；本地通不代表线上通。

## 已知分叉（本地 vs 部署形态）

- 本地 Next 仍是 `scrypt + novara_session Cookie + sessions 表`；部署形态走平台身份，**不建口令、不建会话表**。两套身份模型并存是本期刻意取舍，代价是本地无法验证绑定路径——需要 `dev/` 里的身份 fixture，且 fixture 头**不得**进生产端点。
- `/auth/*` 语义因此不同：本地有 `login` / `register` / `logout`，线上只有 `session` 与 `me`。#21 前端改造完成后本地口令分支去留由队长定：保留 = 可离线开发与演示；删除 = 单一模型。
- **一条实测修正**：Cookie 在未开启 `forwardApplicationCredentials` 时就已到达 Function 原始 header，且 Function 返回的 `Set-Cookie` 能原样穿过网关回环（#26 第二轮，`probe_set` 往返可见）。也就是说「部署形态做不了自建口令」是**错的**——不做口令的真实理由是边际收益：免登录可看由匿名只读覆盖，本地切用户由 fixture 覆盖；只有「无 Qoder 账号也要创建数据」才需要它，代价约 350–400 行 Function + 3 张表，且必须同时禁止按 email / 名称自动关联。
