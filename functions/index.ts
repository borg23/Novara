import { application } from "./app.ts";
import { getUser } from "./auth.mjs";
import type { DbPort, PlatformIdentity } from "./shared/types.ts";

interface BackendModule {
  createDatabaseClient(): DbPort;
}

// 平台在部署时注入 `_qoder/backend.mjs`；该目录本地不存在、也不得创建或打包。
// 说明符走变量而非字面量，`deno check` 才不会把它当本地模块解析。
const backendSpecifier = "./_qoder/backend.mjs";
const backend = (await import(backendSpecifier)) as BackendModule;

const db = backend.createDatabaseClient();

const NO_STORE = { "cache-control": "private, no-store" };

Deno.serve(async (request: Request) => {
  let identity: PlatformIdentity | null;
  try {
    const user = getUser(request);
    identity = user ? { qoderUserId: user.user_id, displayName: user.name.trim() } : null;
  } catch {
    // 上下文格式非法是 403，界面不得据此提示「重新登录」（与 401 未登录区分）。
    return Response.json(
      { error: "身份上下文无效，请刷新页面重试" },
      { status: 403, headers: NO_STORE }
    );
  }
  const handle = application({
    db,
    identity,
    now: () => new Date(),
    newId: () => crypto.randomUUID(),
  });
  return handle(request);
});
