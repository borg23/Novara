import { getSessionUser } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { json, badRequest, unauthorized, parseJson } from "@/lib/http";

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser();
  if (!user) return unauthorized();
  const { id } = await ctx.params;
  const body = await parseJson<{
    name?: string;
    teacher?: string;
    credits?: number;
    grade?: string | null;
    status?: string;
    semester?: string;
    color?: string;
  }>(req);
  const db = getDb();
  const own = db
    .prepare("SELECT id FROM courses WHERE id = ? AND user_id = ?")
    .get(Number(id), user.id);
  if (!own) return json({ error: "课程不存在" }, 404);

  const fields: string[] = [];
  const values: (string | number | null)[] = [];
  const push = (col: string, v: string | number | null) => {
    fields.push(`${col} = ?`);
    values.push(v);
  };
  if (body?.name !== undefined) {
    const name = String(body.name).trim();
    if (!name) return badRequest("课程名不能为空");
    push("name", name);
  }
  if (body?.teacher !== undefined) push("teacher", String(body.teacher).trim());
  if (body?.credits !== undefined) push("credits", Number(body.credits) || 0);
  if (body?.grade !== undefined) push("grade", body.grade ? String(body.grade).trim() : null);
  if (body?.status !== undefined) {
    if (!["planned", "in_progress", "completed"].includes(String(body.status))) {
      return badRequest("课程状态无效");
    }
    push("status", String(body.status));
  }
  if (body?.semester !== undefined) push("semester", String(body.semester).trim());
  if (body?.color !== undefined) push("color", String(body.color));
  if (fields.length === 0) return badRequest("没有可更新的字段");
  db.prepare(`UPDATE courses SET ${fields.join(", ")} WHERE id = ?`)
    .run(...values, Number(id));
  return json({ ok: true });
}

export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser();
  if (!user) return unauthorized();
  const { id } = await ctx.params;
  const db = getDb();
  const res = db
    .prepare("DELETE FROM courses WHERE id = ? AND user_id = ?")
    .run(Number(id), user.id);
  if (Number(res.changes) === 0) return json({ error: "课程不存在" }, 404);
  return json({ ok: true });
}
