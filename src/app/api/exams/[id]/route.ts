import { getSessionUser } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { json, badRequest, unauthorized, parseJson } from "@/lib/http";

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser();
  if (!user) return unauthorized();
  const { id } = await ctx.params;
  const body = await parseJson<{
    title?: string;
    examDate?: string | null;
    score?: number | null;
    note?: string;
    courseId?: number | null;
  }>(req);
  const db = getDb();
  const own = db
    .prepare("SELECT id FROM exams WHERE id = ? AND user_id = ?")
    .get(Number(id), user.id);
  if (!own) return json({ error: "考试记录不存在" }, 404);

  const fields: string[] = [];
  const values: (string | number | null)[] = [];
  const push = (col: string, v: string | number | null) => {
    fields.push(`${col} = ?`);
    values.push(v);
  };
  if (body?.title !== undefined) {
    const title = String(body.title).trim();
    if (!title) return badRequest("考试名称不能为空");
    push("title", title);
  }
  if (body?.examDate !== undefined) push("exam_date", body.examDate || null);
  if (body?.score !== undefined) {
    const score = body.score === null ? null : Number(body.score);
    if (score !== null && (Number.isNaN(score) || score < 0 || score > 100)) {
      return badRequest("成绩需在 0-100 之间");
    }
    push("score", score);
  }
  if (body?.note !== undefined) push("note", String(body.note).trim());
  if (body?.courseId !== undefined) {
    let courseId = body.courseId ? Number(body.courseId) : null;
    if (courseId !== null) {
      const ownCourse = db
        .prepare("SELECT id FROM courses WHERE id = ? AND user_id = ?")
        .get(courseId, user.id);
      if (!ownCourse) return badRequest("所选课程不存在");
    }
    push("course_id", courseId);
  }
  if (fields.length === 0) return badRequest("没有可更新的字段");
  db.prepare(`UPDATE exams SET ${fields.join(", ")} WHERE id = ?`)
    .run(...values, Number(id));
  return json({ ok: true });
}

export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser();
  if (!user) return unauthorized();
  const { id } = await ctx.params;
  const db = getDb();
  const res = db
    .prepare("DELETE FROM exams WHERE id = ? AND user_id = ?")
    .run(Number(id), user.id);
  if (Number(res.changes) === 0) return json({ error: "考试记录不存在" }, 404);
  return json({ ok: true });
}
