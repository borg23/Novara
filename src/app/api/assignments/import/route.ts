import { getSessionUser } from "@/lib/auth";
import { getDb, insertId } from "@/lib/db";
import { parseAssignmentText } from "@/lib/gpa";
import { json, badRequest, unauthorized, parseJson } from "@/lib/http";

/** 文本批量导入：每行「课程名, 作业标题, 截止日期(可选)」，课程不存在时自动创建 */
export async function POST(req: Request) {
  const user = await getSessionUser();
  if (!user) return unauthorized();
  const body = await parseJson<{ text?: string }>(req);
  const text = body?.text ?? "";
  if (!text.trim()) return badRequest("请输入要导入的文本");

  const parsed = parseAssignmentText(text);
  const db = getDb();
  const findCourse = db.prepare("SELECT id FROM courses WHERE user_id = ? AND name = ?");
  const insertCourse = db.prepare(
    "INSERT INTO courses (user_id, name, credits, status) VALUES (?, ?, 0, 'in_progress')"
  );
  const insertAssignment = db.prepare(
    `INSERT INTO assignments (user_id, course_id, title, due_date) VALUES (?, ?, ?, ?)`
  );

  const created: { id: number; title: string; courseName: string }[] = [];
  const failed: { line: string; error: string }[] = [];

  for (const row of parsed) {
    if (row.error || !row.title) {
      failed.push({ line: row.title || "(空行)", error: row.error ?? "无法解析" });
      continue;
    }
    let courseId: number | null = null;
    if (row.course) {
      const existing = findCourse.get(user.id, row.course) as { id: number } | undefined;
      if (existing) {
        courseId = Number(existing.id);
      } else {
        courseId = insertId(insertCourse.run(user.id, row.course));
      }
    }
    const res = insertAssignment.run(user.id, courseId, row.title, row.dueDate);
    created.push({ id: insertId(res), title: row.title, courseName: row.course || "" });
  }

  if (created.length === 0 && failed.length === 0) {
    return badRequest("未解析到任何作业项");
  }
  return json({ created, failed, total: parsed.length });
}
