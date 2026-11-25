import { getSessionUser } from "@/lib/auth";
import { json } from "@/lib/http";

export async function GET() {
  const user = await getSessionUser();
  if (!user) return json({ readOnly: true });
  return json({ id: String(user.id), displayName: user.displayName, readOnly: false });
}
