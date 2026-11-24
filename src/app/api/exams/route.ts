import { getSessionUser } from "@/lib/auth";
import { getDb, insertId } from "@/lib/db";
import { json, badRequest, unauthorized, parseJson } from "@/lib/http";

export async function GET() {
  const user = await getSessionUser();
  if (!user) return unauthorized();
  const rows = getDb()
    .prepare(
      `SELECT e.id, e.title, e.exam_date AS examDate, e.score, e.note,
              e.course_id AS courseId, c.name AS courseName, c.color AS courseColor
       FROM exams e LEFT JOIN courses c ON c.id = e.course_id
       WHERE e.user_id = ? ORDER BY e.exam_date IS NULL, e.exam_date, e.id DESC`
    )
    .all(user.id);
  return json(rows);
}

export async function POST(req: Request) {
  const user = await getSessionUser();
  if (!user) return unauthorized();
  const body = await parseJson<{
    title?: string;
    examDate?: string | null;
    score?: number | null;
    note?: string;
    courseId?: number | null;
  }>(req);
  const title = body?.title?.trim() ?? "";
  if (!title) return badRequest("考试名称不能为空");
  const db = getDb();
  let courseId = body?.courseId ? Number(body.courseId) : null;
  if (courseId !== null) {
    const own = db
      .prepare("SELECT id FROM courses WHERE id = ? AND user_id = ?")
      .get(courseId, user.id);
    if (!own) return badRequest("所选课程不存在");
  }
  const score = body?.score !== undefined && body.score !== null ? Number(body.score) : null;
  if (score !== null && (Number.isNaN(score) || score < 0 || score > 100)) {
    return badRequest("成绩需在 0-100 之间");
  }
  const res = db
    .prepare(
      `INSERT INTO exams (user_id, course_id, title, exam_date, score, note)
       VALUES (?, ?, ?, ?, ?, ?)`
    )
    .run(user.id, courseId, title, body?.examDate || null, score, body?.note?.trim() ?? "");
  return json({ id: insertId(res), title });
}
