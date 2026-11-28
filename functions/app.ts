import { shiftDate, todayInShanghai } from "./shared/date.ts";
import { byDayThenStart, byExamDateThenId, byOpenThenDue, byText } from "./shared/order.ts";
import type { AppDeps, DbQuery, Row } from "./shared/types.ts";
import {
  COURSE_STATUSES,
  ITEM_STATUSES,
  isTimeOfDay,
  isUuid,
  normalizeScore,
  numberOrZero,
  optionalText,
  readDateField,
  readDayOfWeek,
  readText,
} from "./shared/validate.ts";
import {
  DEFAULT_WIDGET_COLUMNS,
  DEFAULT_WIDGET_STYLE,
  WIDGET_STYLES,
  defaultWidgetOrder,
  normalizeWidgetOrder,
} from "./shared/widgets.ts";
import { isTheme } from "./shared/theme.ts";

const ROW_CAP = 5000;
const BODY_CAP = 262144;

const SAMPLE_USER_ID = "7a3f1c52-7a6b-4f6e-9b7c-1f0a2b3c4d5e";
const SAMPLE_COURSE_MATH = "7a3f1c52-7a6b-4f6e-9b7c-1f0a2b3c4d51";
const SAMPLE_COURSE_ENGLISH = "7a3f1c52-7a6b-4f6e-9b7c-1f0a2b3c4d52";
const SAMPLE_ASSIGNMENT_TODAY = "7a3f1c52-7a6b-4f6e-9b7c-1f0a2b3c4d53";
const SAMPLE_ASSIGNMENT_OVERDUE = "7a3f1c52-7a6b-4f6e-9b7c-1f0a2b3c4d54";
const SAMPLE_TASK_TODAY = "7a3f1c52-7a6b-4f6e-9b7c-1f0a2b3c4d55";
const SAMPLE_TASK_OPEN = "7a3f1c52-7a6b-4f6e-9b7c-1f0a2b3c4d56";
const SAMPLE_EXAM = "7a3f1c52-7a6b-4f6e-9b7c-1f0a2b3c4d57";

const COURSE_COLUMNS = "id,name,teacher,credits,grade,status,semester,color,created_at";
const SLOT_COLUMNS = "id,course_id,day_of_week,start_time,end_time,location,weeks";
const ASSIGNMENT_COLUMNS =
  "id,user_id,course_id,title,description,due_date,status,priority,created_at";
const EXAM_COLUMNS = "id,user_id,course_id,title,exam_date,score,note";
const TASK_COLUMNS = "id,title,due_date,status,created_at";

class AppFailure extends Error {
  constructor(readonly status: number, message: string, readonly headers?: Record<string, string>) {
    super(message);
    this.name = "AppFailure";
  }
}

const str = (value: unknown): string => (value === null || value === undefined ? "" : String(value));

async function read(query: DbQuery, conflictMessage?: string): Promise<Row[]> {
  let result: Awaited<DbQuery>;
  try {
    result = await query;
  } catch {
    throw new AppFailure(503, "数据服务暂时不可用，请稍后重试");
  }
  if (result.error) throw mapDbFailure(result.error.code, result.error.status, conflictMessage);
  return Array.isArray(result.data) ? result.data : [];
}

async function write(query: DbQuery, conflictMessage?: string): Promise<void> {
  await read(query, conflictMessage);
}

function mapDbFailure(
  code: string | undefined,
  status: number | undefined,
  conflictMessage?: string
): AppFailure {
  if (status === 409 || code === "23505" || code === "unique_violation") {
    return new AppFailure(409, conflictMessage ?? "该记录已存在");
  }
  return new AppFailure(503, "数据服务暂时不可用，请稍后重试");
}

function respond(data: unknown, status = 200, readOnly = false): Response {
  const headers: Record<string, string> = { "cache-control": "private, no-store" };
  if (readOnly) headers["x-novara-read-only"] = "true";
  return Response.json(data, { status, headers });
}

async function readBody(request: Request): Promise<Row> {
  const text = await request.text();
  if (text.length > BODY_CAP) throw new AppFailure(400, "请求内容过大");
  try {
    const parsed: unknown = JSON.parse(text);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? (parsed as Row) : {};
  } catch {
    return {};
  }
}

function courseOf(row: Row): Row {
  return {
    id: str(row.id),
    name: str(row.name),
    teacher: str(row.teacher),
    credits: numberOrZero(row.credits),
    grade: row.grade === null || row.grade === undefined ? null : str(row.grade),
    status: str(row.status),
    semester: str(row.semester),
    color: str(row.color) || "#6366f1",
    createdAt: str(row.created_at),
    slots: [],
  };
}

function slotOf(row: Row): Row {
  return {
    id: str(row.id),
    courseId: str(row.course_id),
    dayOfWeek: numberOrZero(row.day_of_week),
    startTime: str(row.start_time),
    endTime: str(row.end_time),
    location: str(row.location),
    weeks: str(row.weeks) || "all",
  };
}

function assignmentOf(row: Row, courses: Map<string, Row>): Row {
  const course = row.course_id ? courses.get(str(row.course_id)) : undefined;
  return {
    id: str(row.id),
    title: str(row.title),
    description: str(row.description),
    dueDate: row.due_date === null || row.due_date === undefined ? null : str(row.due_date),
    status: str(row.status),
    priority: numberOrZero(row.priority),
    courseId: row.course_id ? str(row.course_id) : null,
    courseName: course ? str(course.name) : null,
    courseColor: course ? str(course.color) : null,
    createdAt: str(row.created_at),
  };
}

function examOf(row: Row, courses: Map<string, Row>): Row {
  const course = row.course_id ? courses.get(str(row.course_id)) : undefined;
  return {
    id: str(row.id),
    title: str(row.title),
    examDate: row.exam_date === null || row.exam_date === undefined ? null : str(row.exam_date),
    score: row.score === null || row.score === undefined ? null : numberOrZero(row.score),
    note: str(row.note),
    courseId: row.course_id ? str(row.course_id) : null,
    courseName: course ? str(course.name) : null,
    courseColor: course ? str(course.color) : null,
  };
}

function taskOf(row: Row): Row {
  return {
    id: str(row.id),
    title: str(row.title),
    dueDate: row.due_date === null || row.due_date === undefined ? null : str(row.due_date),
    status: str(row.status),
    createdAt: str(row.created_at),
  };
}

function courseIndex(rows: Row[]): Map<string, Row> {
  return new Map(rows.map((row) => [str(row.id), row]));
}

export function routePath(pathname: string): string {
  const segments = pathname.split("/").filter(Boolean);
  // 平台把函数名段换成含部署哈希的物理名（每次部署可变），Provider 可能已剥掉 /functions/v1。
  if (segments[0] === "functions" && segments[1] === "v1") segments.splice(0, 2);
  segments.shift();
  return `/${segments.join("/")}`;
}

interface Route {
  pattern: RegExp;
  allow: string[];
  run: (matches: string[], url: URL, request: Request) => Promise<Response>;
}

export function application(deps: AppDeps) {
  const { db } = deps;

  async function appUserId(): Promise<string | null> {
    const identity = deps.identity;
    if (!identity) return null;
    const found = await read(
      db.from("users").select("id,display_name").eq("qoder_user_id", identity.qoderUserId).limit(1)
    );
    if (found.length > 0) return str(found[0].id);

    const created: Row = {
      id: deps.newId(),
      qoder_user_id: identity.qoderUserId,
      display_name: identity.displayName || "同学",
    };
    const inserted = await read(
      db.from("users").insertIfAbsent(created, { onConflict: "qoder_user_id" }).select("id")
    );
    if (inserted.length > 0) {
      const userId = str(inserted[0].id);
      // 与 assignments/tasks 同一条原则：不依赖库列默认值，默认面板配置显式落库。
      const config: Row = {
        user_id: userId,
        columns: DEFAULT_WIDGET_COLUMNS,
        style: DEFAULT_WIDGET_STYLE,
        order_json: JSON.stringify(defaultWidgetOrder()),
        updated_at: deps.now().toISOString(),
      };
      await write(db.from("widget_configs").insert(config)).catch(() => {});
      return userId;
    }
    // insertIfAbsent 返回空说明并发已命中同一绑定，改为再读一次而不是重试写。
    const again = await read(
      db.from("users").select("id").eq("qoder_user_id", identity.qoderUserId).limit(1)
    );
    if (again.length === 0) throw new AppFailure(503, "账户初始化失败，请稍后重试");
    return str(again[0].id);
  }

  function requireWriter(): void {
    if (!deps.identity) throw new AppFailure(401, "登录后才能编辑");
  }

  async function owner(): Promise<{ id: string; readOnly: boolean }> {
    const id = await appUserId();
    if (id) return { id, readOnly: false };
    return { id: await sampleOwnerId(), readOnly: true };
  }

  async function sampleOwnerId(): Promise<string> {
    const existing = await read(db.from("users").select("id").eq("id", SAMPLE_USER_ID).limit(1));
    if (existing.length > 0) return SAMPLE_USER_ID;
    await seedSampleData();
    return SAMPLE_USER_ID;
  }

  async function seedSampleData(): Promise<void> {
    const today = todayInShanghai(deps.now());
    try {
      await write(db.from("users").insert({ id: SAMPLE_USER_ID, qoder_user_id: null, display_name: "示例同学" }));
      await write(
        db.from("courses").insert([
          {
            id: SAMPLE_COURSE_MATH,
            user_id: SAMPLE_USER_ID,
            name: "高等数学",
            teacher: "王老师",
            credits: 4,
            grade: null,
            status: "in_progress",
            semester: "2026 秋",
            color: "#6366f1",
          },
          {
            id: SAMPLE_COURSE_ENGLISH,
            user_id: SAMPLE_USER_ID,
            name: "大学英语",
            teacher: "李老师",
            credits: 2,
            grade: null,
            status: "in_progress",
            semester: "2026 秋",
            color: "#10b981",
          },
        ])
      );
      await write(
        db.from("course_slots").insert([
          sampleSlot(SAMPLE_COURSE_MATH, 1, "08:00", "09:40", "一教 201"),
          sampleSlot(SAMPLE_COURSE_MATH, 3, "10:00", "11:40", "一教 201"),
          sampleSlot(SAMPLE_COURSE_ENGLISH, 2, "14:00", "15:40", "外语楼 305"),
        ])
      );
      await write(
        db.from("assignments").insert([
          {
            id: SAMPLE_ASSIGNMENT_TODAY,
            user_id: SAMPLE_USER_ID,
            course_id: SAMPLE_COURSE_MATH,
            title: "第三章课后习题",
            description: "完成 12 题，重点是中值定理",
            due_date: today,
            status: "todo",
            priority: 2,
          },
          {
            id: SAMPLE_ASSIGNMENT_OVERDUE,
            user_id: SAMPLE_USER_ID,
            course_id: SAMPLE_COURSE_ENGLISH,
            title: "背诵 Unit 5 单词",
            description: "",
            due_date: shiftDate(today, -2),
            status: "todo",
            priority: 1,
          },
        ])
      );
      await write(
        db.from("tasks").insert([
          { id: SAMPLE_TASK_TODAY, user_id: SAMPLE_USER_ID, title: "整理错题本", due_date: today, status: "todo" },
          { id: SAMPLE_TASK_OPEN, user_id: SAMPLE_USER_ID, title: "预约图书馆研讨室", due_date: null, status: "todo" },
        ])
      );
      await write(
        db.from("exams").insert([
          {
            id: SAMPLE_EXAM,
            user_id: SAMPLE_USER_ID,
            course_id: SAMPLE_COURSE_MATH,
            title: "高等数学期中",
            exam_date: shiftDate(today, 12),
            score: null,
            note: "闭卷，允许一张 A4 公式纸",
          },
        ])
      );
    } catch {
      // 样例数据是只读演示内容，种子竞态或写入失败都不该让匿名访客读到 5xx。
    }
  }

  function sampleSlot(courseId: string, day: number, start: string, end: string, location: string): Row {
    return {
      id: deps.newId(),
      course_id: courseId,
      day_of_week: day,
      start_time: start,
      end_time: end,
      location,
      weeks: "all",
      batch_id: null,
    };
  }

  async function ownCourse(courseId: string, userId: string): Promise<Row> {
    if (!isUuid(courseId)) throw new AppFailure(404, "课程不存在");
    const found = await read(
      db.from("courses").select("id").eq("id", courseId).eq("user_id", userId).limit(1)
    );
    if (found.length === 0) throw new AppFailure(404, "课程不存在");
    return found[0];
  }

  async function ownItem(table: string, id: string, userId: string, label: string): Promise<Row> {
    if (!isUuid(id)) throw new AppFailure(404, label);
    const found = await read(db.from(table).select("id").eq("id", id).eq("user_id", userId).limit(1));
    if (found.length === 0) throw new AppFailure(404, label);
    return found[0];
  }

  async function checkedCourseId(raw: unknown, userId: string): Promise<string | null> {
    if (raw === undefined || raw === null || raw === "") return null;
    const courseId = String(raw);
    if (!isUuid(courseId)) throw new AppFailure(400, "所选课程不存在");
    const found = await read(
      db.from("courses").select("id").eq("id", courseId).eq("user_id", userId).limit(1)
    );
    if (found.length === 0) throw new AppFailure(400, "所选课程不存在");
    return courseId;
  }

  function dueDateOf(body: Row, key: string): string | null {
    const field = readDateField(body[key]);
    if (!field.ok) throw new AppFailure(400, "日期格式需为 YYYY-MM-DD");
    return field.value;
  }

  async function coursesWithSlots(userId: string): Promise<Row[]> {
    const courses = (
      await read(db.from("courses").select(COURSE_COLUMNS).eq("user_id", userId).limit(ROW_CAP))
    ).map(courseOf).sort(byText("name"));
    const slotLists = await Promise.all(
      courses.map((course) =>
        read(
          db.from("course_slots").select(SLOT_COLUMNS).eq("course_id", course.id).limit(ROW_CAP)
        ).then((rows) => rows.map(slotOf).sort(byDayThenStart))
      )
    );
    return courses.map((course, index) => ({ ...course, slots: slotLists[index] }));
  }

  async function listScoped(table: string, columns: string, userId: string) {
    const [items, courses] = await Promise.all([
      read(db.from(table).select(columns).eq("user_id", userId).limit(ROW_CAP)),
      read(db.from("courses").select("id,name,color").eq("user_id", userId).limit(ROW_CAP)),
    ]);
    return { items, courses: courseIndex(courses) };
  }

  async function currentAccount(): Promise<{ id: string; displayName: string } | null> {
    const id = await appUserId();
    if (!id) return null;
    const found = await read(db.from("users").select("display_name").eq("id", id).limit(1));
    return { id, displayName: found.length ? str(found[0].display_name) : "" };
  }

  const routes: Route[] = [
    {
      pattern: /^\/auth\/session$/,
      allow: ["POST"],
      run: async () => {
        if (!deps.identity) throw new AppFailure(401, "未登录或会话已过期");
        const account = await currentAccount();
        if (!account) throw new AppFailure(503, "账户初始化失败，请稍后重试");
        return respond({ id: account.id, displayName: account.displayName });
      },
    },
    {
      pattern: /^\/auth\/me$/,
      allow: ["GET"],
      run: async () => {
        const account = await currentAccount();
        if (!account) return respond({ readOnly: true });
        return respond({ id: account.id, displayName: account.displayName, readOnly: false });
      },
    },
    {
      pattern: /^\/courses$/,
      allow: ["GET", "POST"],
      run: async (_matches, _url, request) => {
        if (request.method === "GET") {
          const target = await owner();
          const courses = await coursesWithSlots(target.id);
          return respond(
            target.readOnly ? { courses, readOnly: true } : courses,
            200,
            target.readOnly
          );
        }
        requireWriter();
        const target = await owner();
        const body = await readBody(request);
        const name = readText(body.name);
        if (!name) throw new AppFailure(400, "课程名不能为空");
        const status = optionalText(body.status, "in_progress");
        if (!COURSE_STATUSES.includes(status)) throw new AppFailure(400, "课程状态无效");
        const grade = body.grade === undefined || body.grade === null || body.grade === "" ? null : readText(body.grade);
        const row: Row = {
          id: deps.newId(),
          user_id: target.id,
          name,
          teacher: readText(body.teacher),
          credits: numberOrZero(body.credits),
          grade,
          status,
          semester: readText(body.semester),
          color: optionalText(body.color, "#6366f1"),
        };
        await write(db.from("courses").insert(row), "课程名已存在，请改用其他名称");
        return respond({ id: row.id, name });
      },
    },
    {
      pattern: /^\/courses\/([^/]+)$/,
      allow: ["PATCH", "DELETE"],
      run: async (matches, _url, request) => {
        requireWriter();
        const target = await owner();
        const id = matches[1];
        if (request.method === "DELETE") {
          await ownCourse(id, target.id);
          // 外键是否由平台强制尚未确认，删除课程时显式清掉课表槽位。
          await write(db.from("course_slots").delete().eq("course_id", id));
          await write(db.from("courses").delete().eq("id", id).eq("user_id", target.id));
          return respond({ ok: true }, 200, false);
        }
        await ownCourse(id, target.id);
        const body = await readBody(request);
        const patch: Row = {};
        if (body.name !== undefined) {
          const name = readText(body.name);
          if (!name) throw new AppFailure(400, "课程名不能为空");
          patch.name = name;
        }
        if (body.teacher !== undefined) patch.teacher = readText(body.teacher);
        if (body.credits !== undefined) patch.credits = numberOrZero(body.credits);
        if (body.grade !== undefined) {
          patch.grade = body.grade === null || body.grade === "" ? null : readText(body.grade);
        }
        if (body.status !== undefined) {
          const status = String(body.status);
          if (!COURSE_STATUSES.includes(status)) throw new AppFailure(400, "课程状态无效");
          patch.status = status;
        }
        if (body.semester !== undefined) patch.semester = readText(body.semester);
        if (body.color !== undefined) patch.color = String(body.color);
        if (Object.keys(patch).length === 0) throw new AppFailure(400, "没有可更新的字段");
        await write(
          db.from("courses").update(patch).eq("id", id).eq("user_id", target.id),
          "课程名已存在，请改用其他名称"
        );
        return respond({ ok: true });
      },
    },
    {
      pattern: /^\/courses\/([^/]+)\/slots$/,
      allow: ["PUT"],
      run: async (matches, _url, request) => {
        requireWriter();
        const target = await owner();
        const id = matches[1];
        await ownCourse(id, target.id);
        const body = await readBody(request);
        const input = Array.isArray(body.slots) ? (body.slots as Row[]) : [];
        const rows: Row[] = [];
        const batchId = deps.newId();
        for (const slot of input) {
          const day = readDayOfWeek(slot.dayOfWeek);
          if (day === null) throw new AppFailure(400, "星期取值需为 1-7");
          if (!isTimeOfDay(slot.startTime) || !isTimeOfDay(slot.endTime)) {
            throw new AppFailure(400, "上课时间格式需为 HH:MM");
          }
          rows.push({
            id: deps.newId(),
            course_id: id,
            day_of_week: day,
            start_time: slot.startTime,
            end_time: slot.endTime,
            location: str(slot.location),
            weeks: optionalText(slot.weeks, "all"),
            batch_id: batchId,
          });
        }
        // 无事务：先插入带批次的新行，再删旧行。失败留下的是重复行，可被同载荷重试收敛，而不是空课表。
        if (rows.length > 0) await write(db.from("course_slots").insert(rows));
        const current = await read(
          db.from("course_slots").select("id,batch_id").eq("course_id", id).limit(ROW_CAP)
        );
        const stale = current.filter((row) => str(row.batch_id) !== batchId).map((row) => str(row.id));
        if (rows.length === 0 && stale.length === 0) return respond({ ok: true });
        try {
          await Promise.all(stale.map((staleId) => write(db.from("course_slots").delete().eq("id", staleId))));
        } catch {
          throw new AppFailure(503, "课表保存未完成，请保留当前内容后重试");
        }
        return respond({ ok: true });
      },
    },
    {
      pattern: /^\/assignments$/,
      allow: ["GET", "POST"],
      run: async (_matches, url, request) => {
        if (request.method === "GET") {
          const target = await owner();
          const { items, courses } = await listScoped("assignments", ASSIGNMENT_COLUMNS, target.id);
          const today = todayInShanghai(deps.now());
          const scope = url.searchParams.get("scope") ?? "all";
          let rows = items.map((row) => assignmentOf(row, courses));
          if (scope === "today") {
            rows = rows.filter((row) => row.status === "todo" && row.dueDate === today);
          } else if (scope === "overdue") {
            rows = rows.filter((row) => row.status === "todo" && row.dueDate && row.dueDate < today);
          }
          rows.sort(byOpenThenDue);
          return respond(target.readOnly ? { assignments: rows, readOnly: true } : rows, 200, target.readOnly);
        }
        requireWriter();
        const target = await owner();
        const body = await readBody(request);
        const title = readText(body.title);
        if (!title) throw new AppFailure(400, "作业标题不能为空");
        const row: Row = {
          id: deps.newId(),
          user_id: target.id,
          course_id: await checkedCourseId(body.courseId, target.id),
          title,
          description: readText(body.description),
          due_date: dueDateOf(body, "dueDate"),
          status: "todo",
          priority: numberOrZero(body.priority),
        };
        await write(db.from("assignments").insert(row));
        return respond({ id: row.id, title });
      },
    },
    {
      pattern: /^\/assignments\/([^/]+)$/,
      allow: ["PATCH", "DELETE"],
      run: async (matches, _url, request) => {
        requireWriter();
        const target = await owner();
        const id = matches[1];
        if (request.method === "DELETE") {
          await ownItem("assignments", id, target.id, "作业不存在");
          await write(db.from("assignments").delete().eq("id", id).eq("user_id", target.id));
          return respond({ ok: true });
        }
        await ownItem("assignments", id, target.id, "作业不存在");
        const body = await readBody(request);
        const patch: Row = {};
        if (body.title !== undefined) {
          const title = readText(body.title);
          if (!title) throw new AppFailure(400, "作业标题不能为空");
          patch.title = title;
        }
        if (body.description !== undefined) patch.description = readText(body.description);
        if (body.dueDate !== undefined) patch.due_date = dueDateOf(body, "dueDate");
        if (body.courseId !== undefined) patch.course_id = await checkedCourseId(body.courseId, target.id);
        if (body.priority !== undefined) patch.priority = numberOrZero(body.priority);
        if (body.status !== undefined) {
          const status = String(body.status);
          if (!ITEM_STATUSES.includes(status)) throw new AppFailure(400, "状态无效");
          patch.status = status;
        }
        if (Object.keys(patch).length === 0) throw new AppFailure(400, "没有可更新的字段");
        await write(db.from("assignments").update(patch).eq("id", id).eq("user_id", target.id));
        return respond({ ok: true });
      },
    },
    {
      pattern: /^\/exams$/,
      allow: ["GET", "POST"],
      run: async (_matches, _url, request) => {
        if (request.method === "GET") {
          const target = await owner();
          const { items, courses } = await listScoped("exams", EXAM_COLUMNS, target.id);
          const rows = items.map((row) => examOf(row, courses)).sort(byExamDateThenId);
          return respond(target.readOnly ? { exams: rows, readOnly: true } : rows, 200, target.readOnly);
        }
        requireWriter();
        const target = await owner();
        const body = await readBody(request);
        const title = readText(body.title);
        if (!title) throw new AppFailure(400, "考试名称不能为空");
        const score = normalizeScore(body.score);
        if (!score.ok) throw new AppFailure(400, "成绩需在 0-100 之间");
        const row: Row = {
          id: deps.newId(),
          user_id: target.id,
          course_id: await checkedCourseId(body.courseId, target.id),
          title,
          exam_date: dueDateOf(body, "examDate"),
          score: score.value,
          note: readText(body.note),
        };
        await write(db.from("exams").insert(row));
        return respond({ id: row.id, title });
      },
    },
    {
      pattern: /^\/exams\/([^/]+)$/,
      allow: ["PATCH", "DELETE"],
      run: async (matches, _url, request) => {
        requireWriter();
        const target = await owner();
        const id = matches[1];
        if (request.method === "DELETE") {
          await ownItem("exams", id, target.id, "考试记录不存在");
          await write(db.from("exams").delete().eq("id", id).eq("user_id", target.id));
          return respond({ ok: true });
        }
        await ownItem("exams", id, target.id, "考试记录不存在");
        const body = await readBody(request);
        const patch: Row = {};
        if (body.title !== undefined) {
          const title = readText(body.title);
          if (!title) throw new AppFailure(400, "考试名称不能为空");
          patch.title = title;
        }
        if (body.examDate !== undefined) patch.exam_date = dueDateOf(body, "examDate");
        if (body.score !== undefined) {
          const score = normalizeScore(body.score);
          if (!score.ok) throw new AppFailure(400, "成绩需在 0-100 之间");
          patch.score = score.value;
        }
        if (body.note !== undefined) patch.note = readText(body.note);
        if (body.courseId !== undefined) patch.course_id = await checkedCourseId(body.courseId, target.id);
        if (Object.keys(patch).length === 0) throw new AppFailure(400, "没有可更新的字段");
        await write(db.from("exams").update(patch).eq("id", id).eq("user_id", target.id));
        return respond({ ok: true });
      },
    },
    {
      pattern: /^\/tasks$/,
      allow: ["GET", "POST"],
      run: async (_matches, url, request) => {
        if (request.method === "GET") {
          const target = await owner();
          const items = await read(
            db.from("tasks").select(TASK_COLUMNS).eq("user_id", target.id).limit(ROW_CAP)
          );
          const today = todayInShanghai(deps.now());
          let rows = items.map(taskOf);
          if ((url.searchParams.get("scope") ?? "all") === "today") {
            rows = rows.filter((row) => row.status === "todo" && row.dueDate === today);
          }
          rows.sort(byOpenThenDue);
          return respond(target.readOnly ? { tasks: rows, readOnly: true } : rows, 200, target.readOnly);
        }
        requireWriter();
        const target = await owner();
        const body = await readBody(request);
        const title = readText(body.title);
        if (!title) throw new AppFailure(400, "任务标题不能为空");
        const row: Row = {
          id: deps.newId(),
          user_id: target.id,
          title,
          due_date: dueDateOf(body, "dueDate"),
          status: "todo",
        };
        await write(db.from("tasks").insert(row));
        return respond({ id: row.id, title });
      },
    },
    {
      pattern: /^\/tasks\/([^/]+)$/,
      allow: ["PATCH", "DELETE"],
      run: async (matches, _url, request) => {
        requireWriter();
        const target = await owner();
        const id = matches[1];
        if (request.method === "DELETE") {
          await ownItem("tasks", id, target.id, "任务不存在");
          await write(db.from("tasks").delete().eq("id", id).eq("user_id", target.id));
          return respond({ ok: true });
        }
        await ownItem("tasks", id, target.id, "任务不存在");
        const body = await readBody(request);
        const patch: Row = {};
        if (body.title !== undefined) {
          const title = readText(body.title);
          if (!title) throw new AppFailure(400, "任务标题不能为空");
          patch.title = title;
        }
        if (body.dueDate !== undefined) patch.due_date = dueDateOf(body, "dueDate");
        if (body.status !== undefined) {
          const status = String(body.status);
          if (!ITEM_STATUSES.includes(status)) throw new AppFailure(400, "状态无效");
          patch.status = status;
        }
        if (Object.keys(patch).length === 0) throw new AppFailure(400, "没有可更新的字段");
        await write(db.from("tasks").update(patch).eq("id", id).eq("user_id", target.id));
        return respond({ ok: true });
      },
    },
    {
      pattern: /^\/widgets$/,
      allow: ["GET", "PUT"],
      run: async (_matches, _url, request) => {
        if (request.method === "GET") {
          const target = await owner();
          const found = await read(
            db.from("widget_configs").select("columns,style,order_json").eq("user_id", target.id).limit(1)
          );
          const row = found[0];
          let order = defaultWidgetOrder();
          if (row) {
            try {
              order = normalizeWidgetOrder(JSON.parse(str(row.order_json))) ?? order;
            } catch {
              order = defaultWidgetOrder();
            }
          }
          return respond(
            {
              columns: row ? numberOrZero(row.columns) : DEFAULT_WIDGET_COLUMNS,
              style: row ? str(row.style) : DEFAULT_WIDGET_STYLE,
              order,
              ...(target.readOnly ? { readOnly: true } : {}),
            },
            200,
            target.readOnly
          );
        }
        requireWriter();
        const target = await owner();
        const body = await readBody(request);
        const columns = numberOrZero(body.columns) || DEFAULT_WIDGET_COLUMNS;
        if (![1, 2, 3].includes(columns)) throw new AppFailure(400, "列数需为 1、2 或 3");
        const style = body.style === undefined ? DEFAULT_WIDGET_STYLE : String(body.style);
        if (!WIDGET_STYLES.includes(style)) throw new AppFailure(400, "样式无效");
        const order = normalizeWidgetOrder(body.order);
        if (order === null) throw new AppFailure(400, "组件顺序无效");
        const orderJson = JSON.stringify(order);
        const timestamp = deps.now().toISOString();
        const config: Row = { user_id: target.id, columns, style, order_json: orderJson, updated_at: timestamp };
        // 无 ON CONFLICT DO UPDATE：insertIfAbsent + update 两步，重复执行结果一致。
        await write(db.from("widget_configs").insertIfAbsent(config, { onConflict: "user_id" }));
        await write(
          db
            .from("widget_configs")
            .update({ columns, style, order_json: orderJson, updated_at: timestamp })
            .eq("user_id", target.id)
        );
        return respond({ ok: true, columns, style, order });
      },
    },
    {
      pattern: /^\/settings$/,
      allow: ["GET", "PUT"],
      run: async (_matches, _url, request) => {
        if (request.method === "GET") {
          const target = await owner();
          const found = await read(
            db.from("user_settings").select("theme").eq("user_id", target.id).limit(1)
          );
          const row = found[0];
          return respond(
            { theme: row && isTheme(row.theme) ? row.theme : "system", ...(target.readOnly ? { readOnly: true } : {}) },
            200,
            target.readOnly
          );
        }
        requireWriter();
        const target = await owner();
        const body = await readBody(request);
        const theme = body.theme === undefined ? "system" : String(body.theme);
        if (!isTheme(theme)) throw new AppFailure(400, "主题需为 light、dark 或 system");
        const timestamp = deps.now().toISOString();
        // 无 ON CONFLICT DO UPDATE：insertIfAbsent + update 两步，重复执行结果一致。
        await write(db.from("user_settings").insertIfAbsent({ user_id: target.id, theme, updated_at: timestamp }, { onConflict: "user_id" }));
        await write(
          db.from("user_settings").update({ theme, updated_at: timestamp }).eq("user_id", target.id)
        );
        return respond({ ok: true, theme });
      },
    },
  ];

  return async function handle(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const path = routePath(url.pathname);
    try {
      for (const route of routes) {
        const matches = route.pattern.exec(path);
        if (!matches) continue;
        if (!route.allow.includes(request.method)) {
          return Response.json(
            { error: "方法不支持" },
            {
              status: 405,
              headers: { "cache-control": "private, no-store", allow: route.allow.join(", ") },
            }
          );
        }
        return await route.run(matches, url, request);
      }
      return respond({ error: "接口不存在" }, 404);
    } catch (error) {
      if (error instanceof AppFailure) return respond({ error: error.message }, error.status);
      return respond({ error: "服务暂时不可用" }, 503);
    }
  };
}
