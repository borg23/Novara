import { getSessionUser } from "@/lib/auth";
import { getDb, insertId } from "@/lib/db";
import { json, badRequest, unauthorized, parseJson } from "@/lib/http";
import type { NextRequest } from "next/server";

export async function GET(req: NextRequest) {
  const user = await getSessionUser();
  if (!user) return unauthorized();
  const db = getDb();
  const scope = req.nextUrl.searchParams.get("scope") ?? "all";
  let where = "t.user_id = ?";
  const params: (string | number | null)[] = [user.id];
  if (scope === "today") {
    where += " AND t.due_date IS NOT NULL AND date(t.due_date) = date('now', 'localtime') AND t.status = 'todo'";
  }
  const rows = db
    .prepare(
      `SELECT t.id, t.title, t.due_date AS dueDate, t.status, t.created_at AS createdAt
       FROM tasks t WHERE ${where}
       ORDER BY t.status = 'todo' DESC, t.due_date IS NULL, t.due_date, t.created_at DESC`
    )
    .all(...params);
  return json(rows);
}

export async function POST(req: Request) {
  const user = await getSessionUser();
  if (!user) return unauthorized();
  const body = await parseJson<{ title?: string; dueDate?: string | null }>(req);
  const title = body?.title?.trim() ?? "";
  if (!title) return badRequest("任务标题不能为空");
  const res = getDb()
    .prepare("INSERT INTO tasks (user_id, title, due_date) VALUES (?, ?, ?)")
    .run(user.id, title, body?.dueDate || null);
  return json({ id: insertId(res), title });
}
