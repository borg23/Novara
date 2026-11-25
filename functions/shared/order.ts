import type { Row } from "./types.ts";

// 复刻现状 SQL 的 ORDER BY 键序：链式客户端只在等值谓词上排序，过滤与聚合在内存完成。
function compare(a: unknown, b: unknown): number {
  if (a === b) return 0;
  if (a === null || a === undefined) return 1;
  if (b === null || b === undefined) return -1;
  return a < b ? -1 : 1;
}

const isTodo = (row: Row) => (row.status === "todo" ? 0 : 1);

export function byText(key: string) {
  return (a: Row, b: Row) => compare(a[key], b[key]);
}

export function byOpenThenDue(a: Row, b: Row): number {
  return (
    isTodo(a) - isTodo(b) ||
    compare(a.dueDate, b.dueDate) ||
    -compare(a.createdAt, b.createdAt)
  );
}

export function byExamDateThenId(a: Row, b: Row): number {
  return compare(a.examDate, b.examDate) || -compare(a.id, b.id);
}

export function byDayThenStart(a: Row, b: Row): number {
  return compare(a.dayOfWeek, b.dayOfWeek) || compare(a.startTime, b.startTime);
}
