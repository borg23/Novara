import { getSessionUser } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { json, badRequest, unauthorized, parseJson } from "@/lib/http";

export async function PUT(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser();
  if (!user) return unauthorized();
  const { id } = await ctx.params;
  const body = await parseJson<{
    slots?: { dayOfWeek: number; startTime: string; endTime: string; location?: string; weeks?: string }[];
  }>(req);
  const db = getDb();
  const own = db
    .prepare("SELECT id FROM courses WHERE id = ? AND user_id = ?")
    .get(Number(id), user.id);
  if (!own) return json({ error: "课程不存在" }, 404);

  db.prepare("DELETE FROM course_slots WHERE course_id = ?").run(Number(id));
  const insert = db.prepare(
    `INSERT INTO course_slots (course_id, day_of_week, start_time, end_time, location, weeks)
     VALUES (?, ?, ?, ?, ?, ?)`
  );
  for (const s of body?.slots ?? []) {
    const day = Number(s.dayOfWeek);
    if (!Number.isInteger(day) || day < 1 || day > 7) return badRequest("星期取值需为 1-7");
    if (!s.startTime || !s.endTime) return badRequest("上课时间不能为空");
    insert.run(
      Number(id),
      day,
      String(s.startTime),
      String(s.endTime),
      String(s.location ?? ""),
      String(s.weeks ?? "all")
    );
  }
  return json({ ok: true });
}
