-- 已存在的探针站（#35）：补 nullable 日期列与索引，用于验证 NULL 在范围比较中的语义。
-- 新站直接使用 schema.sql，不需要执行本文件。
ALTER TABLE app.probe_rows ADD COLUMN due_date_opt text;
CREATE INDEX probe_rows_owner_due_opt_idx ON app.probe_rows (owner_id, due_date_opt);