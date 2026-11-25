import { application } from "../functions/app.ts";
import type { DbPort, DbQuery, PlatformIdentity, QueryResult, Row } from "../functions/shared/types.ts";

const DATA_FILE = new URL("./.data.json", import.meta.url);
const PORT = 8000;

const TABLES = [
  "users",
  "courses",
  "course_slots",
  "assignments",
  "exams",
  "focus_sessions",
  "tasks",
  "user_settings",
  "widget_configs",
];

const UNIQUE: Record<string, string[][]> = {
  users: [["id"], ["qoder_user_id"]],
  courses: [["id"], ["user_id", "name"]],
  course_slots: [["id"]],
  assignments: [["id"]],
  exams: [["id"]],
  focus_sessions: [["id"]],
  tasks: [["id"]],
  user_settings: [["user_id"]],
  widget_configs: [["user_id"]],
};

const FIXTURES = {
  A: { qoderUserId: "11111111-1111-4111-8111-111111111111", displayName: "账号 A" },
  B: { qoderUserId: "22222222-2222-4222-8222-222222222222", displayName: "账号 B" },
  anonymous: null,
  error: "invalid",
} as const;

const store: { fixture: keyof typeof FIXTURES; failSlotDelete: boolean; tables: Record<string, Row[]> } = {
  fixture: "A",
  failSlotDelete: false,
  tables: Object.fromEntries(TABLES.map((name) => [name, []])),
};

async function load(): Promise<void> {
  try {
    const saved = JSON.parse(await Deno.readTextFile(DATA_FILE)) as Partial<typeof store>;
    for (const name of TABLES) {
      const rows = saved.tables?.[name];
      store.tables[name] = Array.isArray(rows) ? rows : [];
    }
    if (saved.fixture && saved.fixture in FIXTURES) store.fixture = saved.fixture;
    store.failSlotDelete = saved.failSlotDelete === true;
  } catch {
    // 首次运行没有数据文件，空库开始与线上一致。
  }
}

let snapshot = "";
async function persist(): Promise<void> {
  const text = JSON.stringify(store);
  if (text === snapshot) return;
  snapshot = text;
  await Deno.writeTextFile(DATA_FILE, text);
}

function project(row: Row, columns: string | null): Row {
  if (!columns) return { ...row };
  return Object.fromEntries(columns.split(",").map((key) => [key.trim(), row[key.trim()]]));
}

function sorted(rows: Row[], order: [string, boolean][]): Row[] {
  return [...rows].sort((a, b) => {
    for (const [key, ascending] of order) {
      const left = a[key];
      const right = b[key];
      if (left === right) continue;
      if (left === null || left === undefined) return 1;
      if (right === null || right === undefined) return -1;
      return (left < right ? -1 : 1) * (ascending ? 1 : -1);
    }
    return 0;
  });
}

function createQuery(table: string): DbQuery {
  const rows = store.tables[table];
  const filters: [string, unknown][] = [];
  const order: [string, boolean][] = [];
  const uniqueKeys = UNIQUE[table] ?? [];
  let columns: string | null = null;
  let mode: "read" | "insert" | "update" | "delete" = "read";
  let values: Row | Row[] | null = null;
  let onConflict: string[] | null = null;
  let take = Number.POSITIVE_INFINITY;

  const matched = () => rows.filter((row) => filters.every(([key, value]) => row[key] === value));

  const query = {
    select: (value: string) => {
      columns = value;
      return query;
    },
    eq: (key: string, value: unknown) => {
      filters.push([key, value]);
      return query;
    },
    order: (key: string, options: { ascending?: boolean } = {}) => {
      order.push([key, options.ascending !== false]);
      return query;
    },
    limit: (value: number) => {
      take = value;
      return query;
    },
    insert: (value: Row | Row[]) => {
      mode = "insert";
      values = value;
      return query;
    },
    insertIfAbsent: (value: Row, options: { onConflict: string }) => {
      mode = "insert";
      values = value;
      onConflict = options.onConflict.split(",").map((key) => key.trim());
      return query;
    },
    update: (patch: Row) => {
      mode = "update";
      values = patch;
      return query;
    },
    delete: () => {
      mode = "delete";
      return query;
    },
    then: (
      fulfilled?: (result: QueryResult) => unknown,
      rejected?: (reason: unknown) => unknown
    ) =>
      Promise.resolve()
        .then(run)
        .then(fulfilled, rejected),
  };

  function duplicates(row: Row): boolean {
    const keySets: string[][] = onConflict ? [onConflict] : uniqueKeys;
    return keySets.some((parts) => {
      if (parts.some((column) => row[column] === undefined || row[column] === null)) return false;
      return rows.some((existing) => parts.every((column) => existing[column] === row[column]));
    });
  }

  function run(): QueryResult {
    if (mode === "insert") {
      const incoming = (Array.isArray(values) ? values : [values ?? {}]).map((row) => ({ ...row }));
      for (const row of incoming) {
        if (duplicates(row)) {
          if (onConflict) return { data: [], error: null };
          return { data: null, error: { code: "23505", status: 409 } };
        }
      }
      for (const row of incoming) {
        if (row.created_at === undefined) row.created_at = new Date().toISOString();
        if ((table === "widget_configs" || table === "user_settings") && row.updated_at === undefined) {
          row.updated_at = row.created_at;
        }
        rows.push(row);
      }
      return { data: incoming.map((row) => project(row, columns)), error: null };
    }

    if (mode === "update") {
      const targets = matched();
      targets.forEach((row) => Object.assign(row, values as Row));
      return { data: targets.map((row) => project(row, columns)), error: null };
    }

    if (mode === "delete") {
      if (table === "course_slots" && store.failSlotDelete) {
        store.failSlotDelete = false;
        return { data: null, error: { code: "injected_delete_failure", status: 503 } };
      }
      const targets = matched();
      for (const row of targets) rows.splice(rows.indexOf(row), 1);
      return { data: targets.map((row) => project(row, columns)), error: null };
    }

    const result = sorted(matched(), order).slice(0, take);
    return { data: result.map((row) => project(row, columns)), error: null };
  }

  return query as unknown as DbQuery;
}

const db: DbPort = {
  from(table: string): DbQuery {
    if (!(table in store.tables)) throw new Error(`unknown_table:${table}`);
    return createQuery(table);
  },
};

const CONTROL_PAGE = `<!doctype html><html lang="zh-CN"><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><title>Novara 本地身份切换</title>
<style>body{font:16px/1.8 system-ui;max-width:640px;margin:48px auto;padding:20px;color:#1c1917}
button{font:inherit;padding:10px 14px;margin:6px;border:1px solid #d6d3d1;border-radius:8px;background:#fafaf9;cursor:pointer}
button.on{background:#4f46e5;color:#fff;border-color:#4f46e5}code{background:#f5f5f4;padding:2px 6px;border-radius:4px}</style>
<h1>Novara 本地身份切换</h1><p>只影响 <code>dev/.data.json</code> 里的本地数据，不连接云端。</p>
<div id="buttons"></div><p id="status" role="status"></p>
<script>
const NAMES={A:"账号 A",B:"账号 B",anonymous:"未登录（只读样例）",error:"身份上下文非法"};
async function paint(){
  const state=await (await fetch('/__local/state')).json();
  document.getElementById('buttons').innerHTML=Object.entries(NAMES).map(function(entry){
    return '<button data-f="'+entry[0]+'" class="'+(state.fixture===entry[0]?'on':'')+'">'+entry[1]+'</button>';
  }).join('');
  document.querySelectorAll('button').forEach(function(button){
    button.onclick=async function(){
      await fetch('/__local/identity',{method:'POST',headers:{'content-type':'application/json'},
        body:JSON.stringify({fixture:button.dataset.f})});
      paint();
    };
  });
  document.getElementById('status').textContent='当前身份：'+NAMES[state.fixture];
}
paint();
</script></html>`;

function json(value: unknown, status = 200): Response {
  return Response.json(value, { status, headers: { "cache-control": "no-store" } });
}

await load();

Deno.serve({ hostname: "127.0.0.1", port: PORT }, async (request: Request) => {
  const url = new URL(request.url);
  if (url.pathname === "/__local") {
    return new Response(CONTROL_PAGE, { headers: { "content-type": "text/html; charset=utf-8" } });
  }
  if (url.pathname === "/__local/state") {
    return json({ fixture: store.fixture, failSlotDelete: store.failSlotDelete });
  }
  if (url.pathname === "/__local/fail") {
    const body = (await request.json().catch(() => ({}))) as { on?: boolean };
    store.failSlotDelete = body.on === true;
    await persist();
    return json({ ok: true, failSlotDelete: store.failSlotDelete });
  }
  if (url.pathname === "/__local/identity") {
    const body = (await request.json().catch(() => ({}))) as { fixture?: string };
    if (typeof body.fixture !== "string" || !(body.fixture in FIXTURES)) {
      return json({ error: "unknown_fixture" }, 400);
    }
    store.fixture = body.fixture as keyof typeof FIXTURES;
    await persist();
    return json({ ok: true, fixture: store.fixture });
  }

  const identity = FIXTURES[store.fixture];
  if (identity === "invalid") {
    // 对应生产端 `auth.mjs` 抛出的 invalid_user_context，用于验证界面不提示重新登录。
    return json({ error: "身份上下文无效，请刷新页面重试" }, 403);
  }
  const handle = application({
    db,
    identity,
    now: () => new Date(),
    newId: () => crypto.randomUUID(),
  });
  const response = await handle(request);
  await persist();
  return response;
});
