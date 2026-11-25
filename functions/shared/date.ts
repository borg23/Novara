const ZONE = "Asia/Shanghai";

const parts = new Intl.DateTimeFormat("en-CA", {
  timeZone: ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

export function todayInShanghai(now: Date): string {
  const pick = (type: Intl.DateTimeFormatPartTypes) =>
    parts.formatToParts(now).find((p) => p.type === type)?.value ?? "";
  return `${pick("year")}-${pick("month")}-${pick("day")}`;
}

export function shiftDate(dateOnly: string, days: number): string {
  const [y, m, d] = dateOnly.split("-").map(Number);
  const utc = Date.UTC(y, m - 1, d + days);
  return new Date(utc).toISOString().slice(0, 10);
}
