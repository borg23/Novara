import { getSessionUser } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { json, badRequest, unauthorized, parseJson } from "@/lib/http";
import { isTheme } from "@/lib/theme";

export async function GET() {
  const user = await getSessionUser();
  if (!user) return unauthorized();
  const row = getDb()
    .prepare("SELECT theme FROM user_settings WHERE user_id = ?")
    .get(user.id) as { theme: string } | undefined;
  const theme = isTheme(row?.theme) ? row!.theme : "system";
  return json({ theme });
}

export async function PUT(req: Request) {
  const user = await getSessionUser();
  if (!user) return unauthorized();
  const body = await parseJson<{ theme?: unknown }>(req);
  const theme = body?.theme;
  if (!isTheme(theme)) {
    return badRequest("主题需为 light、dark 或 system");
  }
  getDb()
    .prepare(
      `INSERT INTO user_settings (user_id, theme) VALUES (?, ?)
       ON CONFLICT(user_id) DO UPDATE SET theme = excluded.theme`
    )
    .run(user.id, theme);
  return json({ ok: true, theme });
}
