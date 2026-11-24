/** 将成绩（百分制数字或等级文本）解析为 0-100 分数；无法解析返回 null */
export function parseGrade(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  if (typeof value === "number") {
    return value >= 0 && value <= 100 ? value : null;
  }
  const s = String(value).trim();
  if (!s) return null;
  const letterMap: Record<string, number> = {
    "A+": 100,
    "A": 95,
    "A-": 90,
    "优秀": 95,
    "优": 95,
    "B+": 85,
    "B": 82,
    "B-": 78,
    "良好": 82,
    "良": 82,
    "C+": 75,
    "C": 72,
    "C-": 68,
    "中等": 72,
    "中": 72,
    "D+": 64,
    "D": 61,
    "及格": 61,
    "合格": 61,
    "通过": 61,
    "F": 50,
    "不及格": 50,
    "不通过": 50,
  };
  const upper = s.toUpperCase();
  if (upper in letterMap) return letterMap[upper];
  const m = s.match(/\d+(\.\d+)?/);
  if (m) {
    const n = parseFloat(m[0]);
    if (n >= 0 && n <= 100) return n;
  }
  return null;
}

/** 百分制 → 4.0 绩点 */
export function scoreToPoints(score: number): number {
  if (score >= 90) return 4.0;
  if (score >= 85) return 3.7;
  if (score >= 82) return 3.3;
  if (score >= 78) return 3.0;
  if (score >= 75) return 2.7;
  if (score >= 72) return 2.3;
  if (score >= 68) return 2.0;
  if (score >= 64) return 1.7;
  if (score >= 60) return 1.0;
  return 0;
}

export interface GpaRow {
  name: string;
  credits: number;
  grade: number | null;
  status: string;
  semester: string;
}

export interface GpaSummary {
  gpa: number | null;
  weighted: number;
  gradedCredits: number;
  earnedCredits: number;
  plannedCredits: number;
  targetCredits: number;
  completion: number | null;
  rows: (GpaRow & { points: number })[];
}

export function computeGpa(rows: GpaRow[]): GpaSummary {
  let weighted = 0;
  let gradedCredits = 0;
  let earnedCredits = 0;
  let plannedCredits = 0;
  const out: (GpaRow & { points: number })[] = [];
  for (const r of rows) {
    const credits = Number(r.credits) || 0;
    plannedCredits += credits;
    if (r.status === "completed") earnedCredits += credits;
    if (r.grade !== null && credits > 0) {
      const points = scoreToPoints(r.grade);
      weighted += points * credits;
      gradedCredits += credits;
      out.push({ ...r, credits, points });
    }
  }
  const target = Number(process.env.GPA_TARGET_CREDITS ?? 160) || 160;
  return {
    gpa: gradedCredits > 0 ? weighted / gradedCredits : null,
    weighted,
    gradedCredits,
    earnedCredits,
    plannedCredits,
    targetCredits: target,
    completion: target > 0 ? earnedCredits / target : null,
    rows: out,
  };
}

/** 极简 CSV 解析：支持引号包裹与 "" 转义，返回字符串二维数组（跳过空行） */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ",") {
      row.push(field);
      field = "";
    } else if (ch === "\n") {
      row.push(field);
      if (row.some((f) => f.trim() !== "")) rows.push(row);
      row = [];
      field = "";
    } else if (ch !== "\r") {
      field += ch;
    }
  }
  row.push(field);
  if (row.some((f) => f.trim() !== "")) rows.push(row);
  return rows;
}

/** 从表头列名定位字段：支持中文/英文表头别名 */
const COLUMN_ALIASES: Record<string, string[]> = {
  name: ["课程名", "课程名称", "课程", "name", "course"],
  credits: ["学分", "credits", "credit"],
  grade: ["成绩", "分数", "等级", "grade", "score"],
  status: ["状态", "status"],
  semester: ["学期", "semester"],
};

function findColumn(header: string[]): Record<string, number> {
  const map: Record<string, number> = {};
  header.forEach((h, idx) => {
    const key = h.trim().toLowerCase();
    for (const [field, aliases] of Object.entries(COLUMN_ALIASES)) {
      if (aliases.includes(key) && !(field in map)) map[field] = idx;
    }
  });
  return map;
}

export interface ParsedCourseRow {
  name: string;
  credits: number | null;
  grade: number | null;
  status: string;
  semester: string;
  error: string | null;
}

/** 把 CSV 文本解析为课程成绩行（跳过表头；无表头时按默认列序） */
export function parseCourseCsv(text: string): ParsedCourseRow[] {
  const table = parseCsv(text);
  if (table.length === 0) return [];
  const first = table[0];
  const map = findColumn(first);
  const hasHeader = "name" in map;
  const body = hasHeader ? table.slice(1) : table;
  const out: ParsedCourseRow[] = [];
  for (const cells of body) {
    const get = (field: string): string => {
      const idx = map[field];
      return idx !== undefined ? (cells[idx] ?? "").trim() : "";
    };
    const name = hasHeader ? get("name") : (cells[0] ?? "").trim();
    const creditsRaw = hasHeader ? get("credits") : (cells[1] ?? "").trim();
    const gradeRaw = hasHeader ? get("grade") : (cells[2] ?? "").trim();
    const statusRaw = hasHeader ? get("status") : (cells[3] ?? "").trim();
    const semester = hasHeader ? get("semester") : (cells[4] ?? "").trim();
    if (!name && !creditsRaw && !gradeRaw) continue;
    const errors: string[] = [];
    if (!name) errors.push("缺少课程名");
    const credits = creditsRaw ? Number(creditsRaw) : null;
    if (creditsRaw && (Number.isNaN(credits) || credits === null || credits < 0)) errors.push("学分格式错误");
    const grade = gradeRaw ? parseGrade(gradeRaw) : null;
    if (gradeRaw && grade === null) errors.push("成绩无法识别");
    const statusMap: Record<string, string> = {
      计划: "planned",
      计划中: "planned",
      planned: "planned",
      在读: "in_progress",
      进行中: "in_progress",
      in_progress: "in_progress",
      已完成: "completed",
      完成: "completed",
      completed: "completed",
    };
    const status = statusRaw ? statusMap[statusRaw.trim()] ?? "in_progress" : "in_progress";
    out.push({
      name,
      credits: credits ?? 0,
      grade,
      status,
      semester,
      error: errors.length > 0 ? errors.join("；") : null,
    });
  }
  return out;
}

/** 解析用户粘贴的批量作业文本（每行一条：课程名 + 作业标题 + 截止日期） */
export function parseAssignmentText(text: string): ParsedAssignmentRow[] {
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  const out: ParsedAssignmentRow[] = [];
  for (const line of lines) {
    const parts = line.split(/[,，;；\t|]+/).map((p) => p.trim()).filter(Boolean);
    let title = "";
    let course = "";
    let dueDate: string | null = null;
    const dateIdx = parts.findIndex((p) => /^\d{4}[-/.]\d{1,2}[-/.]\d{1,2}/.test(p));
    if (dateIdx >= 0) {
      dueDate = parts[dateIdx].replace(/[./]/g, "-");
      parts.splice(dateIdx, 1);
    }
    if (parts.length >= 2) {
      course = parts[0];
      title = parts.slice(1).join(" ");
    } else if (parts.length === 1) {
      title = parts[0];
    }
    if (!title) {
      out.push({ course: "", title: "", dueDate: null, error: "无法解析该行" });
      continue;
    }
    out.push({ course, title, dueDate, error: null });
  }
  return out;
}

export interface ParsedAssignmentRow {
  course: string;
  title: string;
  dueDate: string | null;
  error: string | null;
}
