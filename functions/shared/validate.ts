const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

export const COURSE_STATUSES = ["planned", "in_progress", "completed"];
export const ITEM_STATUSES = ["todo", "done"];
export const WEEK_DAYS = [1, 2, 3, 4, 5, 6, 7];

export function isUuid(value: unknown): value is string {
  return typeof value === "string" && UUID_RE.test(value);
}

export type DateField = { ok: boolean; value: string | null };

export function readDateField(raw: unknown): DateField {
  if (raw === undefined || raw === null || raw === "") return { ok: true, value: null };
  if (typeof raw !== "string" || !DATE_RE.test(raw)) return { ok: false, value: null };
  return { ok: !Number.isNaN(Date.parse(`${raw}T00:00:00Z`)), value: raw };
}

export function isTimeOfDay(value: unknown): value is string {
  return typeof value === "string" && TIME_RE.test(value);
}

export function readDayOfWeek(raw: unknown): number | null {
  const day = Number(raw);
  return Number.isInteger(day) && day >= 1 && day <= 7 ? day : null;
}

export function numberOrZero(raw: unknown): number {
  const value = Number(raw);
  return Number.isFinite(value) ? value : 0;
}

export function readText(raw: unknown): string {
  return typeof raw === "string" ? raw.trim() : "";
}

export function optionalText(raw: unknown, fallback: string): string {
  if (raw === undefined || raw === null) return fallback;
  return String(raw);
}

export function normalizeScore(raw: unknown): { ok: boolean; value: number | null } {
  if (raw === undefined || raw === null || raw === "") return { ok: true, value: null };
  const value = Number(raw);
  return { ok: !Number.isNaN(value) && value >= 0 && value <= 100, value };
}
