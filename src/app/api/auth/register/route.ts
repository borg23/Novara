import { hashPassword, createSession } from "@/lib/auth";
import { getDb, insertId } from "@/lib/db";
import { json, parseJson } from "@/lib/http";

export async function POST(req: Request) {
  const body = await parseJson<{ username?: string; password?: string; displayName?: string }>(req);
  const username = body?.username?.trim() ?? "";
  const password = body?.password ?? "";
  const displayName = body?.displayName?.trim() || username;

  if (!/^[\w\u4e00-\u9fa5]{2,20}$/.test(username)) {
    return json({ error: "用户名需为 2-20 位字母、数字、下划线或中文" }, 400);
  }
  if (password.length < 6) {
    return json({ error: "密码至少 6 位" }, 400);
  }

  const db = getDb();
  const exists = db.prepare("SELECT id FROM users WHERE username = ?").get(username);
  if (exists) {
    return json({ error: "用户名已被占用" }, 409);
  }

  const res = db
    .prepare("INSERT INTO users (username, display_name, password_hash) VALUES (?, ?, ?)")
    .run(username, displayName, hashPassword(password));
  const userId = insertId(res);
  db.prepare(
    "INSERT INTO widget_configs (user_id) VALUES (?)"
  ).run(userId);
  await createSession(userId);
  return json({ id: userId, username, displayName });
}
