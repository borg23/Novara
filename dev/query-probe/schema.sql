-- 私有探针站 schema（#35）。仅用于部署环境实测 function_backend 查询客户端。
-- 只用平台迁移支持的子集：uuid / text / integer / timestamptz；不使用 date、numeric、CHECK、DESC 索引。
CREATE TABLE app.probe_rows (
  id            uuid PRIMARY KEY,
  owner_id      uuid NOT NULL,
  seq           integer NOT NULL,
  status        text NOT NULL,
  due_date      text NOT NULL,
  started_at    timestamptz NOT NULL,
  duration_sec  integer NOT NULL,
  assignment_id uuid,
  title         text NOT NULL,
  grade         text,
  payload       text NOT NULL,
  created_at    timestamptz NOT NULL
);
CREATE INDEX probe_rows_owner_seq_idx ON app.probe_rows (owner_id, seq);
CREATE INDEX probe_rows_owner_started_idx ON app.probe_rows (owner_id, started_at);
CREATE INDEX probe_rows_owner_due_idx ON app.probe_rows (owner_id, status, due_date);