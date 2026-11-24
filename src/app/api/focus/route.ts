import { getSessionUser } from "@/lib/auth";
import { getDb, insertId } from "@/lib/db";
import { json, badRequest, unauthorized, parseJson } from "@/lib/http";

export async function GET() {
  const user = await getSessionUser();
  if (!user) return unauthorized();
  const db = getDb();
  const rows = db
    .prepare(
      `SELECT f.id, f.assignment_id AS assignmentId, a.title AS assignmentTitle,
              f.started_at AS startedAt, f.duration_sec AS durationSec, f.note
       FROM focus_sessions f LEFT JOIN assignments a ON a.id = f.assignment_id
       WHERE f.user_id = ? ORDER BY f.started_at DESC LIMIT 200`
    )
    .all(user.id);
  const todayTotal = db
    .prepare(
      `SELECT COALESCE(SUM(duration_sec), 0) AS total
       FROM focus_sessions
       WHERE user_id = ? AND date(started_at) = date('now', 'localtime')`
    )
    .get(user.id) as { total: number };
  const perAssignment = db
    .prepare(
      `SELECT f.assignment_id AS assignmentId, a.title AS title,
              COALESCE(SUM(f.duration_sec), 0) AS totalSec, COUNT(*) AS count
       FROM focus_sessions f LEFT JOIN assignments a ON a.id = f.assignment_id
       WHERE f.user_id = ?
       GROUP BY f.assignment_id ORDER BY totalSec DESC`
    )
    .all(user.id);
  return json({
    records: rows,
    todayTotalSec: Number(todayTotal.total) || 0,
    perAssignment,
  });
}

export async function POST(req: Request) {
  const user = await getSessionUser();
  if (!user) return unauthorized();
  const body = await parseJson<{
    assignmentId?: number | null;
    startedAt?: string;
    durationSec?: number;
    note?: string;
  }>(req);
  const durationSec = Math.round(Number(body?.durationSec) || 0);
  if (durationSec < 1 || durationSec > 24 * 3600) {
    return badRequest("时长无效");
  }
  const db = getDb();
  let assignmentId = body?.assignmentId ? Number(body.assignmentId) : null;
  if (assignmentId !== null) {
    const own = db
      .prepare("SELECT id FROM assignments WHERE id = ? AND user_id = ?")
      .get(assignmentId, user.id);
    if (!own) return badRequest("所选作业不存在");
  }
  const startedAt = body?.startedAt && !Number.isNaN(Date.parse(body.startedAt))
    ? new Date(body.startedAt).toISOString()
    : new Date().toISOString();
  const res = db
    .prepare(
      `INSERT INTO focus_sessions (user_id, assignment_id, started_at, duration_sec, note)
       VALUES (?, ?, ?, ?, ?)`
    )
    .run(user.id, assignmentId, startedAt, durationSec, body?.note?.trim() ?? "");
  return json({ id: insertId(res) });
}
