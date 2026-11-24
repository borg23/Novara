import { getSessionUser } from "@/lib/auth";
import { getDb, insertId } from "@/lib/db";
import { json, badRequest, unauthorized, parseJson } from "@/lib/http";

interface SlotInput {
  dayOfWeek: number;
  startTime: string;
  endTime: string;
  location?: string;
  weeks?: string;
}

export async function GET() {
  const user = await getSessionUser();
  if (!user) return unauthorized();
  const db = getDb();
  const courses = db
    .prepare(
      `SELECT id, name, teacher, credits, grade, status, semester, color, created_at AS createdAt
       FROM courses WHERE user_id = ? ORDER BY name`
    )
    .all(user.id);
  const slots = db
    .prepare(
      `SELECT s.id, s.course_id AS courseId, s.day_of_week AS dayOfWeek, s.start_time AS startTime,
              s.end_time AS endTime, s.location, s.weeks
       FROM course_slots s JOIN courses c ON c.id = s.course_id
       WHERE c.user_id = ? ORDER BY s.day_of_week, s.start_time`
    )
    .all(user.id);
  const byCourse = new Map<number, unknown[]>();
  for (const s of slots as { courseId: number }[]) {
    const list = byCourse.get(s.courseId) ?? [];
    list.push(s);
    byCourse.set(s.courseId, list);
  }
  return json(
    (courses as { id: number }[]).map((c) => ({ ...c, slots: byCourse.get(c.id) ?? [] }))
  );
}

export async function POST(req: Request) {
  const user = await getSessionUser();
  if (!user) return unauthorized();
  const body = await parseJson<{
    name?: string;
    teacher?: string;
    credits?: number;
    grade?: string | null;
    status?: string;
    semester?: string;
    color?: string;
  }>(req);
  const name = body?.name?.trim() ?? "";
  if (!name) return badRequest("课程名不能为空");
  if (!["planned", "in_progress", "completed"].includes(body?.status ?? "in_progress")) {
    return badRequest("课程状态无效");
  }
  const db = getDb();
  const res = db
    .prepare(
      `INSERT INTO courses (user_id, name, teacher, credits, grade, status, semester, color)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      user.id,
      name,
      body?.teacher?.trim() ?? "",
      Number(body?.credits) || 0,
      body?.grade ? String(body.grade).trim() : null,
      body?.status ?? "in_progress",
      body?.semester?.trim() ?? "",
      body?.color ?? "#6366f1"
    );
  return json({ id: insertId(res), name });
}
