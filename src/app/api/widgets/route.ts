import { getSessionUser } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { json, badRequest, unauthorized, parseJson } from "@/lib/http";

const DEFAULT_ORDER = ["todayTasks", "homework", "calendar", "schedule", "weather", "timer", "gpaSummary"];

export async function GET() {
  const user = await getSessionUser();
  if (!user) return unauthorized();
  const row = getDb()
    .prepare("SELECT columns, style, order_json AS orderJson FROM widget_configs WHERE user_id = ?")
    .get(user.id) as { columns: number; style: string; orderJson: string } | undefined;
  let order: string[];
  try {
    order = row ? JSON.parse(row.orderJson) : [...DEFAULT_ORDER];
  } catch {
    order = [...DEFAULT_ORDER];
  }
  return json({
    columns: row?.columns ?? 2,
    style: row?.style ?? "card",
    order,
  });
}

export async function PUT(req: Request) {
  const user = await getSessionUser();
  if (!user) return unauthorized();
  const body = await parseJson<{ columns?: number; style?: string; order?: string[] }>(req);
  const columns = Number(body?.columns) || 2;
  if (![1, 2, 3].includes(columns)) return badRequest("列数需为 1、2 或 3");
  if (body?.style !== undefined && !["card", "flat"].includes(String(body.style))) {
    return badRequest("样式无效");
  }
  let order = body?.order ?? null;
  if (!Array.isArray(order) || order.some((w) => typeof w !== "string")) {
    return badRequest("组件顺序无效");
  }
  order = (order as string[]).filter((w) => DEFAULT_ORDER.includes(w));
  getDb()
    .prepare(
      `INSERT INTO widget_configs (user_id, columns, style, order_json, updated_at)
       VALUES (?, ?, ?, ?, datetime('now'))
       ON CONFLICT(user_id) DO UPDATE SET columns = excluded.columns, style = excluded.style,
         order_json = excluded.order_json, updated_at = datetime('now')`
    )
    .run(user.id, columns, String(body?.style ?? "card"), JSON.stringify(order));
  return json({ ok: true, columns, style: body?.style ?? "card", order });
}
