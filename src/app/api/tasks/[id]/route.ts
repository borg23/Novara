import { getSessionUser } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { json, badRequest, unauthorized, parseJson } from "@/lib/http";

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser();
  if (!user) return unauthorized();
  const { id } = await ctx.params;
  const body = await parseJson<{ title?: string; dueDate?: string | null; status?: string }>(req);
  const db = getDb();
  const own = db
    .prepare("SELECT id FROM tasks WHERE id = ? AND user_id = ?")
    .get(Number(id), user.id);
  if (!own) return json({ error: "任务不存在" }, 404);

  const fields: string[] = [];
  const values: (string | number | null)[] = [];
  const push = (col: string, v: string | number | null) => {
    fields.push(`${col} = ?`);
    values.push(v);
  };
  if (body?.title !== undefined) {
    const title = String(body.title).trim();
    if (!title) return badRequest("任务标题不能为空");
    push("title", title);
  }
  if (body?.dueDate !== undefined) push("due_date", body.dueDate || null);
  if (body?.status !== undefined) {
    if (!["todo", "done"].includes(String(body.status))) return badRequest("状态无效");
    push("status", String(body.status));
  }
  if (fields.length === 0) return badRequest("没有可更新的字段");
  db.prepare(`UPDATE tasks SET ${fields.join(", ")} WHERE id = ?`)
    .run(...values, Number(id));
  return json({ ok: true });
}

export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser();
  if (!user) return unauthorized();
  const { id } = await ctx.params;
  const db = getDb();
  const res = db
    .prepare("DELETE FROM tasks WHERE id = ? AND user_id = ?")
    .run(Number(id), user.id);
  if (Number(res.changes) === 0) return json({ error: "任务不存在" }, 404);
  return json({ ok: true });
}
