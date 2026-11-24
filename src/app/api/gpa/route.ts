import { getSessionUser } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { computeGpa, parseGrade, type GpaRow } from "@/lib/gpa";
import { json, unauthorized } from "@/lib/http";

export async function GET() {
  const user = await getSessionUser();
  if (!user) return unauthorized();
  const rows = getDb()
    .prepare(
      `SELECT name, credits, grade, status, semester
       FROM courses WHERE user_id = ? ORDER BY name`
    )
    .all(user.id) as { name: string; credits: number; grade: string | null; status: string; semester: string }[];
  const summary = computeGpa(
    rows.map((r): GpaRow => ({
      name: r.name,
      credits: Number(r.credits) || 0,
      grade: r.grade ? parseGrade(r.grade) : null,
      status: r.status,
      semester: r.semester,
    }))
  );
  return json({ summary, courses: rows });
}
