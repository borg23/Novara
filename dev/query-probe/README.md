# function_backend 查询客户端能力探针

这是 #35 的部署环境实测工具，**不是参赛作品**，也不要把它挂到作品帖里。它只写入合成数据，不接触真实用户数据。

- 目录：`dev/query-probe/`
- 站点：私有探针站，使用当前 Qoder 账号创建，与最终提交账号隔离
- 目的：拿到 `or` / `and` / `in` / 范围比较 / 列裁剪 / offset / order+limit 的部署环境返回值，再决定 `functions/app.ts` 哪些过滤可以下推

## 结构

```text
dev/query-probe/
  function/index.ts                    # 探针 Function；_qoder/backend.mjs 由平台注入
  web/index.html                       # 静态壳，满足 prepare_site 的 webDirectory
  schema.sql                           # app.probe_rows，仅合成数据
  migration-002-due-date-opt.sql       # 已存在探针站补 nullable 日期列用
```

## 数据设计

- `PROBE_OWNER` 1200 行：`seq` 0–1199，日期覆盖过去/今天/未来，含 NULL `due_date_opt`、NULL `grade`、宽 `payload`。
- `OTHER_OWNER` 5 行哨兵：用于验证 `.or` / `.and` 不会绕过 `.eq(owner_id)`；所有带 owner 的 case 都断言结果只属于 `PROBE_OWNER`。
- 关键 case 带 `check`：期望条数、seq 范围/顺序、全部 owner、日期比较结果。`ok=false` 表示查询成功但语义不符合预期，不等于请求失败。

## 部署顺序

1. `prepare_site` 静态 bootstrap：`createNewSite: true`，`projectRoot` 为本目录，`webDirectory: "web"`，不发布。
2. `get_site(include: ["backend"])` → `ensure_backend(capabilities: ["database","functions"], databaseAccessModel: "function_backend")`，轮询 Operation。
3. `get_database_schema` 取 `schemaRef` → `create_database_migration`（`accessPolicies: []`）→ 审阅 → `apply_database_migration` → 回读。
4. 已存在的探针站若缺少 `due_date_opt`，追加执行 `migration-002-due-date-opt.sql` 对应的迁移；新站直接用 `schema.sql`。
5. 完整 `prepare_site`：同一 `projectId`，`webDirectory: "web"`，`functionDirectory: "function"`，`databaseAccess: "read_write"`，带最新 `schemaRef`。
6. `publish_site` → `get_publish_status` 确认 → 在浏览器打开探针站。

> 改了 Function/静态页后必须用**新的 actionId** 重新 `prepare_site`；已冻结的旧 draft 不会自动更新。

## 使用

1. `POST /functions/v1/app/probe/seed`：清掉两个探针 owner 的旧行，写入 1200 + 5 行合成数据。
2. `GET /functions/v1/app/probe/introspect`：查看查询对象上实际存在的方法。
3. `GET /functions/v1/app/probe/all?group=predicates|projection|paging|app|aggregate`：按组运行；不带 `group` 会跑全部，可能接近 Function 超时。
4. `GET /functions/v1/app/probe/case?name=...`：单条重跑。

静态页 `web/index.html` 的 “Run all” 会**逐组请求**再合并结果，避免单次请求过长；也保留分组按钮。

## 证据口径

- 每个 case 记录：调用写法、Function HTTP 状态、DB error status/code、返回片段、条数、返回体字节、耗时、`queryOk` / `checkOk` / `check.reason`。
- 错误信息和站点地址会脱敏；不返回 token、DB 地址或完整平台错误。
- 列裁剪只能证明“返回体的列和字节减少”；是否在传输层裁剪、`order+limit` 是否下推，客户端返回值无法直接证明，结论里必须写清这一点。
- 证据摘要回写 `docs/sites.md` 第七节与 #35 issue；原始 JSON 放本地 `evidence/`（已 gitignore）。

## 注意

- 不要在本目录创建 `_qoder/`；它由平台注入，本地不存在。
- 不要把本目录作为 `functionDirectory` 之外的入口打进正式 app Function。
- 探针站验收后是否删除由你决定；删除 `probe_rows` 不需要迁移（删站即可）。
- 私有站需要浏览器以探针账号登录；若访问被网关拦截，先确认登录状态，再决定是否单独授权临时公开。