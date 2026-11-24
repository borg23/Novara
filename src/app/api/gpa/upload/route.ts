import { getSessionUser } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { computeGpa, parseCourseCsv, parseGrade, type ParsedCourseRow } from "@/lib/gpa";
import { json, badRequest, unauthorized } from "@/lib/http";

/** 上传 CSV/JSON 文件解析课程成绩：返回解析结果与 GPA 预览，不写库；确认后调 /api/gpa/import */
export async function POST(req: Request) {
  const user = await getSessionUser();
  if (!user) return unauthorized();
  const form = await req.formData();
  const file = form.get("file");
  if (!(file instanceof File)) return badRequest("请上传文件");
  const filename = file.name.toLowerCase();
  const text = await file.text();

  let rows: ParsedCourseRow[] = [];
  if (filename.endsWith(".json")) {
    rows = parseJsonRows(text);
  } else if (filename.endsWith(".csv")) {
    rows = parseCourseCsv(text);
  } else {
    return badRequest("仅支持 CSV 或 JSON 文件");
  }
  if (rows.length === 0) return badRequest("文件中没有可解析的课程数据");

  const hasError = rows.some((r) => r.error);
  const summary = computeGpa(
    rows.map((r) => ({
      name: r.name,
      credits: r.credits ?? 0,
      grade: r.grade,
      status: r.status,
      semester: r.semester,
    }))
  );
  return json({ rows, summary, hasError });
}

function parseJsonRows(text: string): ParsedCourseRow[] {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    return [];
  }
  const arr = Array.isArray(data) ? data : (data as { courses?: unknown[] })?.courses;
  if (!Array.isArray(arr)) return [];
  const out: ParsedCourseRow[] = [];
  for (const item of arr) {
    if (typeof item !== "object" || item === null) continue;
    const o = item as Record<string, unknown>;
    const name = String(o.name ?? o.课程名 ?? o.课程 ?? "").trim();
    if (!name) continue;
    const credits = Number(o.credits ?? o.学分 ?? 0);
    const gradeRaw = o.grade ?? o.成绩 ?? o.分数 ?? null;
    const grade = gradeRaw !== null && gradeRaw !== "" ? parseGrade(gradeRaw) : null;
    const statusMap: Record<string, string> = {
      计划: "planned", 计划中: "planned", planned: "planned",
      在读: "in_progress", 进行中: "in_progress", in_progress: "in_progress",
      已完成: "completed", 完成: "completed", completed: "completed",
    };
    const status = statusMap[String(o.status ?? o.状态 ?? "in_progress")] ?? "in_progress";
    out.push({
      name,
      credits: Number.isNaN(credits) ? 0 : credits,
      grade,
      status,
      semester: String(o.semester ?? o.学期 ?? "").trim(),
      error: gradeRaw !== null && gradeRaw !== "" && grade === null ? "成绩无法识别" : null,
    });
  }
  return out;
}

/** 确认导入：把解析结果合并进课程表（按课程名匹配，存在则更新成绩/学分/状态） */
export async function PUT(req: Request) {
  const user = await getSessionUser();
  if (!user) return unauthorized();
  const body = await req.json().catch(() => null) as { rows?: ParsedCourseRow[] } | null;
  const rows = body?.rows;
  if (!Array.isArray(rows) || rows.length === 0) return badRequest("没有可导入的数据");
  const db = getDb();
  const find = db.prepare("SELECT id FROM courses WHERE user_id = ? AND name = ?");
  const update = db.prepare(
    "UPDATE courses SET credits = ?, grade = ?, status = ?, semester = ? WHERE id = ?"
  );
  const insert = db.prepare(
    `INSERT INTO courses (user_id, name, credits, grade, status, semester) VALUES (?, ?, ?, ?, ?, ?)`
  );
  let created = 0;
  let updated = 0;
  for (const r of rows) {
    if (r.error || !r.name) continue;
    const existing = find.get(user.id, r.name) as { id: number } | undefined;
    const gradeStr = r.grade === null ? null : String(r.grade);
    if (existing) {
      update.run(r.credits ?? 0, gradeStr, r.status, r.semester ?? "", Number(existing.id));
      updated++;
    } else {
      insert.run(user.id, r.name, r.credits ?? 0, gradeStr, r.status, r.semester ?? "");
      created++;
    }
  }
  return json({ ok: true, created, updated });
}
