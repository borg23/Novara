import { verifyPassword, createSession } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { json, parseJson } from "@/lib/http";

export async function POST(req: Request) {
  const body = await parseJson<{ username?: string; password?: string }>(req);
  const username = body?.username?.trim() ?? "";
  const password = body?.password ?? "";

  const row = getDb()
    .prepare("SELECT id, username, display_name AS displayName, password_hash AS passwordHash FROM users WHERE username = ?")
    .get(username) as { id: number; username: string; displayName: string; passwordHash: string } | undefined;

  if (!row || !verifyPassword(password, row.passwordHash)) {
    return json({ error: "用户名或密码错误" }, 401);
  }

  await createSession(Number(row.id));
  return json({ id: Number(row.id), username: row.username, displayName: row.displayName });
}
