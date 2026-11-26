# function_backend 查询客户端能力探针

这是 #35 的部署环境实测工具，**不是参赛作品**，也不要把它挂到作品帖里。它只写入合成数据，不接触真实用户数据。

- 目录：`dev/query-probe/`
- 站点：私有探针站，使用当前 Qoder 账号创建，与最终提交账号隔离
- 目的：拿到 `or` / `and` / `in` / 范围比较 / 列裁剪 / offset / order+limit 的部署环境返回值，再决定 `functions/app.ts` 哪些过滤可以下推

## 结构

```text
dev/query-probe/
  function/index.ts   # 探针 Function；_qoder/backend.mjs 由平台注入
  web/index.html      # 静态壳，满足 prepare_site 的 webDirectory
  schema.sql          # app.probe_rows，仅合成数据
```

## 部署顺序

1. `prepare_site` 静态 bootstrap：`createNewSite: true`，`projectRoot` 为本目录，`webDirectory: "web"`，不发布。
2. `get_site(include: ["backend"])` → `ensure_backend(capabilities: ["database","functions"], databaseAccessModel: "function_backend")`，轮询 Operation。
3. `get_database_schema` 取 `schemaRef` → `create_database_migration`（`accessPolicies: []`）→ 审阅 → `apply_database_migration` → 回读。
4. 完整 `prepare_site`：同一 `projectId`，`webDirectory: "web"`，`functionDirectory: "function"`，`databaseAccess: "read_write"`，带 `schemaRef`。
5. `publish_site` → `get_publish_status` 确认 → 在浏览器打开探针站。

## 使用

1. `POST /functions/v1/app/probe/seed`：清掉本探针 owner 的旧行并写入 200 行合成数据。
2. `GET /functions/v1/app/probe/introspect`：查看查询对象上实际存在的方法。
3. `GET /functions/v1/app/probe/all`：跑全部用例；也可用 `?group=predicates|projection|paging|app|aggregate` 分组。
4. `GET /functions/v1/app/probe/case?name=...`：单条重跑。

静态页 `web/index.html` 有对应按钮，结果以 JSON 和表格显示。

## 证据口径

- 每个 case 记录：调用写法、Function HTTP 状态、DB error status/code、返回片段、条数、返回体字节、耗时。
- 错误信息和站点地址会脱敏；不返回 token、DB 地址或完整平台错误。
- 列裁剪只能证明“返回体的列和字节减少”；是否在传输层裁剪、`order+limit` 是否下推，客户端返回值无法直接证明，结论里必须写清这一点。
- 证据摘要回写 `docs/sites.md` 第七节与 #35 issue；原始 JSON 放本地 `evidence/`（已 gitignore）。

## 注意

- 不要在本目录创建 `_qoder/`；它由平台注入，本地不存在。
- 不要把本目录作为 `functionDirectory` 之外的入口打进正式 app Function。
- 探针站验收后是否删除由你决定；删除 `probe_rows` 不需要迁移（删站即可）。