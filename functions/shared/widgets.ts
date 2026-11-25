export const WIDGET_MODULES = [
  "todayTasks",
  "homework",
  "calendar",
  "schedule",
  "weather",
  "timer",
  "gpaSummary",
];

export const WIDGET_STYLES = ["card", "flat"];
export const DEFAULT_WIDGET_COLUMNS = 2;
export const DEFAULT_WIDGET_STYLE = "card";

export function defaultWidgetOrder(): string[] {
  return [...WIDGET_MODULES];
}

export function normalizeWidgetOrder(raw: unknown): string[] | null {
  if (!Array.isArray(raw)) return null;
  return raw.filter((item): item is string => WIDGET_MODULES.includes(item));
}
