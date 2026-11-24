import { getSessionUser } from "@/lib/auth";
import { getDb, insertId } from "@/lib/db";
import { json, badRequest, unauthorized, parseJson } from "@/lib/http";
import type { NextRequest } from "next/server";

export async function GET(req: NextRequest) {
  const user = await getSessionUser();
  if (!user) return unauthorized();
  const db = getDb();
  const scope = req.nextUrl.searchParams.get("scope") ?? "all";
  let where = "a.user_id = ?";
  const params: (string | number | null)[] = [user.id];
  if (scope === "today") {
    where += " AND a.due_date IS NOT NULL AND date(a.due_date) = date('now', 'localtime') AND a.status = 'todo'";
  } else if (scope === "overdue") {
    where += " AND a.due_date IS NOT NULL AND date(a.due_date) < date('now', 'localtime') AND a.status = 'todo'";
  }
  const rows = db
    .prepare(
      `SELECT a.id, a.title, a.description, a.due_date AS dueDate, a.status, a.priority,
              a.course_id AS courseId, c.name AS courseName, c.color AS courseColor,
              a.created_at AS createdAt
       FROM assignments a LEFT JOIN courses c ON c.id = a.course_id
       WHERE ${where} ORDER BY a.status = 'todo' DESC, a.due_date IS NULL, a.due_date, a.created_at DESC`
    )
    .all(...params);
  return json(rows);
}

export async function POST(req: Request) {
  const user = await getSessionUser();
  if (!user) return unauthorized();
  const body = await parseJson<{
    title?: string;
    description?: string;
    dueDate?: string | null;
    courseId?: number | null;
    priority?: number;
  }>(req);
  const title = body?.title?.trim() ?? "";
  if (!title) return badRequest("作业标题不能为空");
  const db = getDb();
  let courseId = body?.courseId ? Number(body.courseId) : null;
  if (courseId !== null) {
    const own = db
      .prepare("SELECT id FROM courses WHERE id = ? AND user_id = ?")
      .get(courseId, user.id);
    if (!own) return badRequest("所选课程不存在");
  }
  const res = db
    .prepare(
      `INSERT INTO assignments (user_id, course_id, title, description, due_date, priority)
       VALUES (?, ?, ?, ?, ?, ?)`
    )
    .run(user.id, courseId, title, body?.description?.trim() ?? "", body?.dueDate || null, Number(body?.priority) || 0);
  return json({ id: insertId(res), title });
}
