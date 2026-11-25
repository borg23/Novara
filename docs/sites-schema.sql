-- Sites 侧 schema 草案（待 #19 评审与平台审批）
--
-- 依据：`src/lib/db.ts` 的 8 张 SQLite 表逐个对照，不是重新设计。
-- 方言：Postgres（平台 function_backend），业务表置于 app schema，访问策略由平台生成，
-- 本文件不含 GRANT / POLICY。提交给审批流程前请保持「只新增表/列」的 expand 形态。
--
-- 类型映射决策（逐条对应现状）
--   INTEGER PRIMARY KEY AUTOINCREMENT  -> uuid + 服务端 crypto.randomUUID() 生成
--     影响面：id 由前端只作不透明值使用，无需改交互；但 /gpa/upload 等「先查 id 再写」的
--     流程必须改成先由 Function 生成 id。
--   TEXT 时间（created_at / updated_at）-> timestamptz DEFAULT now()
--     注意现状不一致：SQLite 的 datetime('now') 写入的是 UTC 文本，而「今天」的判定用的却是
--     date('now','localtime')。两者本来就矛盾。统一为 timestamptz 后，「今天」必须由 Function
--     以 Asia/Shanghai 计算日期再比较，见契约未决 3。
--   TEXT 日期（due_date / exam_date）-> date
--     现状写入的是前端传来的字符串，需要 Function 侧统一校验 YYYY-MM-DD，非法返回 400。
--   TEXT 时间（course_slots.start_time / end_time）-> 保留 text + CHECK
--     现状是 "08:00" 这类字符串直存，改成 time 会让既有排序与比较语义变化，成本不必要。
--   REAL（credits / score）-> numeric，避免浮点误差影响绩点计算。
--   status 类字段 -> text + CHECK，不用 PG enum，便于后续加值不必改类型。

-- ===== 业务表（8 张，与现状一一对应）=====

CREATE TABLE app.users (
  id            uuid PRIMARY KEY,
  username      text NOT NULL UNIQUE,
  display_name  text NOT NULL,
  -- 认证方案为「自建账号」时需要以下三列；若采用平台身份，本表连同 sessions / auth_limiter 一并去掉。
  password_salt text,
  password_hash text,
  password_iterations integer,
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE app.sessions (
  token_digest  text PRIMARY KEY,          -- 现状列名 token_hash，语义同为 SHA-256 摘要
  user_id       uuid NOT NULL REFERENCES app.users (id) ON DELETE CASCADE,
  created_at    timestamptz NOT NULL DEFAULT now(),   -- 新增列，现状无签发时间
  expires_at    timestamptz NOT NULL,
  revoked_at    timestamptz                 -- 新增列：现状登出是直接 DELETE，无法审计与幂等撤销
);
CREATE INDEX sessions_user_idx ON app.sessions (user_id);

CREATE TABLE app.courses (
  id         uuid PRIMARY KEY,
  user_id    uuid NOT NULL REFERENCES app.users (id) ON DELETE CASCADE,
  name       text NOT NULL,
  teacher    text NOT NULL DEFAULT '',
  credits    numeric(5, 2) NOT NULL DEFAULT 0,
  grade      text,
  status     text NOT NULL DEFAULT 'in_progress'
             CHECK (status IN ('planned', 'in_progress', 'completed')),
  semester   text NOT NULL DEFAULT '',
  color      text NOT NULL DEFAULT '#6366f1',
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, name)   -- 见契约未决 6：两处导入都按 (user_id, name) 匹配，代码已假定唯一
);
CREATE INDEX courses_user_name_idx ON app.courses (user_id, name);

CREATE TABLE app.course_slots (
  id          uuid PRIMARY KEY,
  course_id   uuid NOT NULL REFERENCES app.courses (id) ON DELETE CASCADE,
  day_of_week integer NOT NULL CHECK (day_of_week BETWEEN 1 AND 7),
  start_time  text NOT NULL CHECK (start_time ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'),
  end_time    text NOT NULL CHECK (end_time   ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'),
  location    text NOT NULL DEFAULT '',
  weeks       text NOT NULL DEFAULT 'all',
  batch_id    uuid          -- 契约「已定 4」：PUT /courses/{id}/slots 的补偿式替换用。
                            -- 先插入带 batch_id 的新行，成功后再删除该课程不在此 batch 的旧行；
                            -- 失败留下的是重复行（可被同载荷重试清理），不是空课表。
);
-- 现状 GET /courses 按 day_of_week, start_time 排序取全部槽位；user_id 需经 course_id 关联过滤。
CREATE INDEX course_slots_course_day_idx ON app.course_slots (course_id, day_of_week, start_time);
CREATE INDEX course_slots_batch_idx ON app.course_slots (course_id, batch_id);

CREATE TABLE app.assignments (
  id          uuid PRIMARY KEY,
  user_id     uuid NOT NULL REFERENCES app.users (id) ON DELETE CASCADE,
  course_id   uuid REFERENCES app.courses (id) ON DELETE SET NULL,
  title       text NOT NULL,
  description text NOT NULL DEFAULT '',
  due_date    date,
  status      text NOT NULL DEFAULT 'todo' CHECK (status IN ('todo', 'done')),
  priority    integer NOT NULL DEFAULT 0,
  created_at  timestamptz NOT NULL DEFAULT now(),
  -- 契约「已定 5」：/assignments/import 的逐行幂等键，值为 请求级 Idempotency-Key + 行号。
  -- 重试同一载荷时 insertIfAbsent 命中同一行，避免重复导入产生重复作业。
  idempotency_key text,
  UNIQUE (user_id, idempotency_key)
);
-- 覆盖 today / overdue 过滤与列表排序（status 未完成优先 → due_date → created_at 倒序）。
CREATE INDEX assignments_user_status_due_idx ON app.assignments (user_id, status, due_date);

CREATE TABLE app.exams (
  id         uuid PRIMARY KEY,
  user_id    uuid NOT NULL REFERENCES app.users (id) ON DELETE CASCADE,
  course_id  uuid REFERENCES app.courses (id) ON DELETE SET NULL,
  title      text NOT NULL,
  exam_date  date,
  score      numeric(5, 2) CHECK (score IS NULL OR (score BETWEEN 0 AND 100)),
  note       text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX exams_user_date_idx ON app.exams (user_id, exam_date);

CREATE TABLE app.focus_sessions (
  id             uuid PRIMARY KEY,
  user_id        uuid NOT NULL REFERENCES app.users (id) ON DELETE CASCADE,
  assignment_id  uuid REFERENCES app.assignments (id) ON DELETE SET NULL,
  started_at     timestamptz NOT NULL,
  duration_sec   integer NOT NULL CHECK (duration_sec BETWEEN 1 AND 86400),  -- 与 API 校验一致
  note           text NOT NULL DEFAULT ''
);
CREATE INDEX focus_user_started_idx ON app.focus_sessions (user_id, started_at DESC);
CREATE INDEX focus_user_assignment_idx ON app.focus_sessions (user_id, assignment_id);

CREATE TABLE app.tasks (
  id         uuid PRIMARY KEY,
  user_id    uuid NOT NULL REFERENCES app.users (id) ON DELETE CASCADE,
  title      text NOT NULL,
  due_date   date,
  status     text NOT NULL DEFAULT 'todo' CHECK (status IN ('todo', 'done')),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX tasks_user_status_due_idx ON app.tasks (user_id, status, due_date);

CREATE TABLE app.widget_configs (
  user_id    uuid PRIMARY KEY REFERENCES app.users (id) ON DELETE CASCADE,
  columns    integer NOT NULL DEFAULT 2 CHECK (columns IN (1, 2, 3)),
  style      text NOT NULL DEFAULT 'card' CHECK (style IN ('card', 'flat')),
  order_json text NOT NULL DEFAULT '["todayTasks","homework","calendar","schedule","weather","timer","gpaSummary"]',
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- ===== 认证为「自建账号」时额外需要（若走平台身份则整段删除）=====

-- 固定窗口限流，唯一主键用于并发安全的原子判定。
CREATE TABLE app.auth_limiter (
  key               text PRIMARY KEY,
  window_started_at timestamptz NOT NULL,
  attempt_count     integer NOT NULL
);

-- ===== 遗留问题（审批前需明确，不悄悄带过）=====

-- 1. 聚合无处落地：链式客户端不提供 SUM / GROUP BY。契约「已定 2」已选择「Function 读有界行集后
--    内存聚合」，因此本草案**不加汇总表**；触发条件（单用户 >5000 行或响应体接近上限）写在契约里，
--    届时按 expand 方式补一张按天汇总表，不动现有表。
-- 2. 只增不减的行：sessions 过期行、auth_limiter 历史窗口，以及 course_slots 的残留批次
--    （补偿式替换在插入成功、删除失败时留下的重复行）都需要保留/清理策略。现状 SQLite 同样没有清理，
--    不是迁移新引入的问题，但持续使用后必须处理；重复槽位对用户可见，清理按 (course_id, 非当前批次) 判定。
-- 3. 外键是否生效：平台侧是否强制启用 RLS 与外键约束需在 #19 实测确认；若外键不生效，
--    ON DELETE CASCADE 的隔离与清理语义必须由 Function 显式补偿。
-- 4. 约束先于提示：courses (user_id, name) UNIQUE 必须先于「重名报逐行错误」的前端提示上线，
--    否则约束冲突会以 409 直传到界面而不是可读提示。属于 expand 顺序问题，审批时注意。
