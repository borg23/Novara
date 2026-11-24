import { getSessionUser } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { json, badRequest, unauthorized, parseJson } from "@/lib/http";

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser();
  if (!user) return unauthorized();
  const { id } = await ctx.params;
  const body = await parseJson<{
    title?: string;
    description?: string;
    dueDate?: string | null;
    courseId?: number | null;
    priority?: number;
    status?: string;
  }>(req);
  const db = getDb();
  const own = db
    .prepare("SELECT id FROM assignments WHERE id = ? AND user_id = ?")
    .get(Number(id), user.id);
  if (!own) return json({ error: "作业不存在" }, 404);

  const fields: string[] = [];
  const values: (string | number | null)[] = [];
  const push = (col: string, v: string | number | null) => {
    fields.push(`${col} = ?`);
    values.push(v);
  };
  if (body?.title !== undefined) {
    const title = String(body.title).trim();
    if (!title) return badRequest("作业标题不能为空");
    push("title", title);
  }
  if (body?.description !== undefined) push("description", String(body.description).trim());
  if (body?.dueDate !== undefined) push("due_date", body.dueDate || null);
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
  if (body?.priority !== undefined) push("priority", Number(body.priority) || 0);
  if (body?.status !== undefined) {
    if (!["todo", "done"].includes(String(body.status))) return badRequest("状态无效");
    push("status", String(body.status));
  }
  if (fields.length === 0) return badRequest("没有可更新的字段");
  db.prepare(`UPDATE assignments SET ${fields.join(", ")} WHERE id = ?`)
    .run(...values, Number(id));
  return json({ ok: true });
}

export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser();
  if (!user) return unauthorized();
  const { id } = await ctx.params;
  const db = getDb();
  const res = db
    .prepare("DELETE FROM assignments WHERE id = ? AND user_id = ?")
    .run(Number(id), user.id);
  if (Number(res.changes) === 0) return json({ error: "作业不存在" }, 404);
  return json({ ok: true });
}
