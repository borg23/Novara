-- Sites 侧 schema（平台受限 DDL 版本，待正式站迁移计划实测）
--
-- 依据：`src/lib/db.ts` 的 9 张 SQLite 表逐个对照（`sessions` 随认证方案取消，落地 8 张）；
-- 方言：Postgres（平台 function_backend），业务表置于 app schema。
-- 平台只接受受限 DDL 子集，本文件已按 `database-migration.md` 改写：
--   支持 boolean / integer / bigint / text / uuid / timestamptz / jsonb；
--   date、numeric、varchar(n)、CHECK、DESC 索引、任意表达式默认值均不支持。
-- 访问策略：function_backend 由 AppHub 生成固定私有策略，迁移计划传 `accessPolicies: []`，
-- 本文件不含 GRANT / POLICY。迁移前请保持「只建新表/新索引」的 expand 形态。
--
-- 类型映射决策（逐条对应现状）
--   INTEGER PRIMARY KEY AUTOINCREMENT -> uuid + 服务端 crypto.randomUUID() 生成
--     影响面：id 由前端只作不透明值使用；/gpa/upload 等「先查 id 再写」的流程改为先由
--     Function 生成 id。
--   REAL credits / score -> integer 百分位（credits_centi / score_centi）
--     平台不支持 numeric；用 ×100 整数保存，Function 读写时换算：
--     读 `numberOrZero(row.credits_centi) / 100`，写 `Math.round(value * 100)`。
--   TEXT 时间（created_at / updated_at）-> timestamptz DEFAULT now()
--     「今天」必须由 Function 以 Asia/Shanghai 计算日期再比较，见契约未决 3。
--   TEXT 日期（due_date / exam_date）-> text
--     平台不支持 date；Function 统一校验 YYYY-MM-DD，非法返回 400。
--   TEXT 时间（course_slots.start_time / end_time）-> 保留 text
--     平台不支持时间类型与 CHECK；Function 按 ^([01][0-9]|2[0-3]):[0-5][0-9]$ 校验。
--   status / 枚举 / 范围类字段 -> text 或 integer，原 CHECK 改由 Function 校验（见文件末清单）。
--
-- ON DELETE：先按 CASCADE / SET NULL 提交计划；平台是否接受未实测。若以
-- unsupported_ddl / unsupported_constraint 拒绝，则去掉 ON DELETE，由 Function 显式补偿
-- 级联与置空，并把结果回写到 #19。

-- ===== 业务表（8 张，与现状一一对应）=====

-- 平台 Qoder 上下文即凭证，users 只保存应用侧记录。
-- qoder_user_id 允许为空：未来口令形态的账号可以暂不绑定平台身份。
-- 口令列、sessions 表、auth_limiter 表本期不建。
CREATE TABLE app.users (
  id            uuid PRIMARY KEY,          -- app 内部全局标识；所有业务表的 owner 就是它
  qoder_user_id text UNIQUE,               -- 平台身份绑定；JIT 建号的幂等依据
  display_name  text NOT NULL,
  created_at    timestamptz NOT NULL DEFAULT now()
);

-- owner 列保持 uuid：owner 存的是 app 自己的 users.id，平台 user_id 只出现在 users.qoder_user_id。
-- 换成 text 会丢掉类型校验、外键可比性与索引效率。

CREATE TABLE app.courses (
  id            uuid PRIMARY KEY,
  user_id       uuid NOT NULL REFERENCES app.users (id) ON DELETE CASCADE,
  name          text NOT NULL,
  teacher       text NOT NULL DEFAULT '',
  credits_centi integer NOT NULL DEFAULT 0, -- 350 = 3.50 学分
  grade         text,
  status        text NOT NULL DEFAULT 'in_progress',
  semester      text NOT NULL DEFAULT '',
  color         text NOT NULL DEFAULT '#6366f1',
  created_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, name)   -- 两处导入都按 (user_id, name) 匹配，代码已假定唯一
);
CREATE INDEX courses_user_name_idx ON app.courses (user_id, name);

CREATE TABLE app.course_slots (
  id          uuid PRIMARY KEY,
  course_id   uuid NOT NULL REFERENCES app.courses (id) ON DELETE CASCADE,
  day_of_week integer NOT NULL,            -- Function 校验 1..7
  start_time  text NOT NULL,               -- Function 校验 HH:MM
  end_time    text NOT NULL,
  location    text NOT NULL DEFAULT '',
  weeks       text NOT NULL DEFAULT 'all',
  batch_id    uuid          -- PUT /courses/{id}/slots 补偿式替换用；见契约「已定 4」
);
CREATE INDEX course_slots_course_day_idx ON app.course_slots (course_id, day_of_week, start_time);
CREATE INDEX course_slots_batch_idx ON app.course_slots (course_id, batch_id);

CREATE TABLE app.assignments (
  id              uuid PRIMARY KEY,
  user_id         uuid NOT NULL REFERENCES app.users (id) ON DELETE CASCADE,
  course_id       uuid REFERENCES app.courses (id) ON DELETE SET NULL,
  title           text NOT NULL,
  description     text NOT NULL DEFAULT '',
  due_date        text,                    -- YYYY-MM-DD，Function 校验
  status          text NOT NULL DEFAULT 'todo',  -- Function 校验 todo/done
  priority        integer NOT NULL DEFAULT 0,
  created_at      timestamptz NOT NULL DEFAULT now(),
  -- /assignments/import 的逐行幂等键：请求级 Idempotency-Key + 行号。
  idempotency_key text,
  UNIQUE (user_id, idempotency_key)
);
CREATE INDEX assignments_user_status_due_idx ON app.assignments (user_id, status, due_date);

CREATE TABLE app.exams (
  id          uuid PRIMARY KEY,
  user_id     uuid NOT NULL REFERENCES app.users (id) ON DELETE CASCADE,
  course_id   uuid REFERENCES app.courses (id) ON DELETE SET NULL,
  title       text NOT NULL,
  exam_date   text,                        -- YYYY-MM-DD，Function 校验
  score_centi integer,                     -- 8550 = 85.50 分；Function 校验 0..10000
  note        text NOT NULL DEFAULT '',
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX exams_user_date_idx ON app.exams (user_id, exam_date);

CREATE TABLE app.focus_sessions (
  id            uuid PRIMARY KEY,
  user_id       uuid NOT NULL REFERENCES app.users (id) ON DELETE CASCADE,
  assignment_id uuid REFERENCES app.assignments (id) ON DELETE SET NULL,
  started_at    timestamptz NOT NULL,
  duration_sec  integer NOT NULL,          -- Function 校验 1..86400
  note          text NOT NULL DEFAULT ''
);
-- 平台不支持 DESC 索引；反向读取由查询侧完成。
CREATE INDEX focus_user_started_idx ON app.focus_sessions (user_id, started_at);
CREATE INDEX focus_user_assignment_idx ON app.focus_sessions (user_id, assignment_id);

CREATE TABLE app.tasks (
  id         uuid PRIMARY KEY,
  user_id    uuid NOT NULL REFERENCES app.users (id) ON DELETE CASCADE,
  title      text NOT NULL,
  due_date   text,                         -- YYYY-MM-DD，Function 校验
  status     text NOT NULL DEFAULT 'todo', -- Function 校验 todo/done
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX tasks_user_status_due_idx ON app.tasks (user_id, status, due_date);

CREATE TABLE app.widget_configs (
  user_id    uuid PRIMARY KEY REFERENCES app.users (id) ON DELETE CASCADE,
  columns    integer NOT NULL DEFAULT 2,   -- Function 校验 1..3
  style      text NOT NULL DEFAULT 'card', -- Function 校验 card/flat
  order_json text NOT NULL DEFAULT '["todayTasks","homework","calendar","schedule","weather","timer","gpaSummary"]',
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- ===== 本期不建的表 =====

-- app.sessions（令牌摘要 / 过期 / 撤销）与 app.auth_limiter（固定窗口限流）属于自建口令形态。
-- 身份改走平台上下文后两者不需要；若日后确实要口令登录，按 expand 新增，不动现有表。

-- ===== 原 CHECK 约束的 Function 侧校验清单（平台不支持 CHECK）=====

-- courses.status            ∈ planned / in_progress / completed
-- courses.credits_centi     ≥ 0（原 SQLite 无 CHECK，导入时已校验学分格式）
-- course_slots.day_of_week  1..7
-- course_slots.start_time   ^([01][0-9]|2[0-3]):[0-5][0-9]$
-- course_slots.end_time     同上
-- assignments.status        ∈ todo / done
-- assignments.due_date      YYYY-MM-DD 或 null
-- exams.exam_date           YYYY-MM-DD 或 null
-- exams.score_centi         0..10000 或 null
-- focus_sessions.duration_sec 1..86400
-- tasks.status              ∈ todo / done
-- tasks.due_date            YYYY-MM-DD 或 null
-- widget_configs.columns    ∈ 1 / 2 / 3
-- widget_configs.style      ∈ card / flat
-- widget_configs.order_json 只保留契约白名单里的组件名

-- ===== 遗留问题（审批前需明确，不悄悄带过）=====

-- 1. 聚合无处落地：链式客户端不提供 SUM / GROUP BY。契约「已定 2」已选择「Function 读有界行集后
--    内存聚合」，因此本草案**不加汇总表**；触发条件（单用户 >5000 行或响应体接近上限）写在契约里，
--    届时按 expand 方式补一张按天汇总表，不动现有表。
-- 2. 只增不减的行：`course_slots` 的残留批次需要清理策略；重复槽位对用户可见，
--    清理按 (course_id, 非当前批次) 判定。自建口令形态下的 sessions / auth_limiter 增长项随该形态取消而消失。
-- 3. 外键与级联：function_backend 的固定私有策略已由平台承担；ON DELETE 的 CASCADE / SET NULL
--    是否被平台接受需在 #19 的迁移计划上实测。若不接受，改由 Function 显式补偿并在 #19 记录。
-- 4. 约束先于提示：courses (user_id, name) UNIQUE 必须先于「重名报逐行错误」的前端提示上线，
--    否则约束冲突会以 409 直传到界面而不是可读提示。属于 expand 顺序问题，审批时注意。
