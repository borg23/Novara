// #35 探针：只做能力实测，不实现业务。部署到私有探针站，数据全部是合成数据。
// _qoder/backend.mjs 由平台在部署时注入；本地不存在，也不得创建。

type Row = Record<string, unknown>;
interface QueryError {
  code?: string;
  message?: string;
  status?: number;
}
interface QueryResult {
  data: Row[] | null;
  error?: QueryError | null;
}
type Query = any; // 查询客户端的方法面正是本探针要测的东西，不能先用类型假定
interface DbPort {
  from(table: string): Query;
}
interface BackendModule {
  createDatabaseClient(): DbPort;
}

const backendSpecifier = "./_qoder/backend.mjs";
const backend = (await import(backendSpecifier)) as BackendModule;
const db = backend.createDatabaseClient();

const PROBE_OWNER = "9b2f3c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d";
const COLS = "id,seq,status,due_date,started_at,duration_sec,assignment_id,title,grade";
const FULL_COLS =
  "id,owner_id,seq,status,due_date,started_at,duration_sec,assignment_id,title,grade,payload,created_at";
const NO_STORE = { "cache-control": "no-store" };

class Unsupported extends Error {
  constructor(message: string) {
    super(message);
    this.name = "Unsupported";
  }
}

function json(data: unknown, status = 200): Response {
  return Response.json(data, { status, headers: NO_STORE });
}

function routePath(pathname: string): string {
  const segments = pathname.split("/").filter(Boolean);
  if (segments[0] === "functions" && segments[1] === "v1") segments.splice(0, 2);
  segments.shift();
  return `/${segments.join("/")}`;
}

function todayInShanghai(): string {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  return formatter.format(new Date());
}

function shiftDate(date: string, days: number): string {
  const [year, month, day] = date.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day + days)).toISOString().slice(0, 10);
}

function isoAt(seq: number): string {
  return new Date(Date.UTC(2026, 0, 1) + seq * 3600_000).toISOString();
}

function probeId(seq: number): string {
  return `00000000-0000-4000-9000-${seq.toString(16).padStart(12, "0")}`;
}

function assignmentId(group: number): string {
  return `00000000-0000-4000-a000-${group.toString(16).padStart(12, "0")}`;
}

function seedRows(): Row[] {
  const today = todayInShanghai();
  const rows: Row[] = [];
  for (let seq = 0; seq < 200; seq += 1) {
    rows.push({
      id: probeId(seq),
      owner_id: PROBE_OWNER,
      seq,
      status: seq % 2 === 0 ? "todo" : "done",
      due_date: shiftDate(today, seq - 100),
      started_at: isoAt(seq),
      duration_sec: 60 + seq,
      assignment_id: assignmentId(seq % 10),
      title: seq % 3 === 0 ? `数学作业 ${seq}` : `英语作业 ${seq}`,
      grade: seq % 5 === 0 ? null : "A",
      payload: "x".repeat(512),
      created_at: "2026-01-01T00:00:00Z",
    });
  }
  return rows;
}

function sanitize(value: unknown): unknown {
  if (typeof value === "string") {
    return value
      .replace(/https?:\/\/[^\s"']+/g, "[url]")
      .replace(/(authorization|apikey|token|secret)\s*[:=]\s*[^\s,}]+/gi, "$1=[redacted]");
  }
  if (Array.isArray(value)) return value.map(sanitize);
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value)) {
      out[key] = /token|secret|password|authorization|apikey/i.test(key)
        ? "[redacted]"
        : sanitize(item);
    }
    return out;
  }
  return value;
}

function fn(query: Query, name: string): (...args: unknown[]) => Query {
  const value = query?.[name];
  if (typeof value !== "function") throw new Unsupported(`method ${name} is not available`);
  return value.bind(query) as (...args: unknown[]) => Query;
}

async function seed(): Promise<Row> {
  const del = await db.from("probe_rows").delete().eq("owner_id", PROBE_OWNER);
  if (del?.error) return { ok: false, error: sanitize(del.error) };

  const rows = seedRows();
  for (let index = 0; index < rows.length; index += 20) {
    const result = await db.from("probe_rows").insert(rows.slice(index, index + 20));
    if (result?.error) {
      return { ok: false, insertedBeforeError: index, error: sanitize(result.error) };
    }
  }

  const visible = await db
    .from("probe_rows")
    .select("id")
    .eq("owner_id", PROBE_OWNER)
    .limit(500);
  return {
    ok: !visible?.error,
    requested: rows.length,
    visible: visible?.data?.length ?? 0,
    error: visible?.error ? sanitize(visible.error) : null,
  };
}

function introspect(): Row {
  const base = db.from("probe_rows");
  const candidates = [
    "select",
    "eq",
    "neq",
    "gt",
    "gte",
    "lt",
    "lte",
    "is",
    "in",
    "like",
    "or",
    "and",
    "order",
    "limit",
    "range",
    "offset",
    "insert",
    "insertIfAbsent",
    "update",
    "delete",
    "count",
    "sum",
    "group",
    "rpc",
  ];
  const methodTypes: Record<string, string> = {};
  for (const name of candidates) methodTypes[name] = typeof base?.[name];

  let chained: Query = null;
  try {
    const selected = base?.select?.("id");
    chained = selected?.eq?.("owner_id", PROBE_OWNER) ?? selected;
  } catch {
    chained = null;
  }

  const own = (value: Query): string[] => {
    try {
      return value ? Object.keys(value) : [];
    } catch {
      return [];
    }
  };
  const proto = (value: Query): string[] => {
    try {
      return value ? Object.getOwnPropertyNames(Object.getPrototypeOf(value)) : [];
    } catch {
      return [];
    }
  };

  return {
    dbKeys: own(db),
    baseOwn: own(base),
    baseProto: proto(base),
    chainedOwn: own(chained),
    chainedProto: proto(chained),
    methodTypes,
  };
}

interface CaseDef {
  group: "predicates" | "projection" | "paging" | "app" | "aggregate";
  api: string;
  run: () => Query;
}

const TODAY = () => todayInShanghai();
const PAST = () => shiftDate(TODAY(), -10);

const CASES: Record<string, CaseDef> = {
  eq_control: {
    group: "predicates",
    api: ".eq(owner_id).limit(5)",
    run: () => db.from("probe_rows").select(COLS).eq("owner_id", PROBE_OWNER).limit(5),
  },
  or_string: {
    group: "predicates",
    api: `.eq(owner_id).or("status.eq.todo,due_date.lt.${TODAY()}").limit(10)`,
    run: () =>
      fn(
        db.from("probe_rows").select(COLS).eq("owner_id", PROBE_OWNER),
        "or"
      )(`status.eq.todo,due_date.lt.${TODAY()}`).limit(10),
  },
  and_string: {
    group: "predicates",
    api: `.eq(owner_id).and("status.eq.todo,due_date.gte.${PAST()}").limit(10)`,
    run: () =>
      fn(
        db.from("probe_rows").select(COLS).eq("owner_id", PROBE_OWNER),
        "and"
      )(`status.eq.todo,due_date.gte.${PAST()}`).limit(10),
  },
  or_array: {
    group: "predicates",
    api: `.or([{column:"status",operator:"eq",value:"todo"}])`,
    run: () =>
      fn(
        db.from("probe_rows").select(COLS).eq("owner_id", PROBE_OWNER),
        "or"
      )([{ column: "status", operator: "eq", value: "todo" }]).limit(10),
  },
  in_two: {
    group: "predicates",
    api: '.in("id", [probeId(1), probeId(2)])',
    run: () =>
      fn(
        db.from("probe_rows").select(COLS).eq("owner_id", PROBE_OWNER),
        "in"
      )("id", [probeId(1), probeId(2)]).limit(10),
  },
  in_one: {
    group: "predicates",
    api: '.in("id", [probeId(1)])',
    run: () =>
      fn(
        db.from("probe_rows").select(COLS).eq("owner_id", PROBE_OWNER),
        "in"
      )("id", [probeId(1)]).limit(10),
  },
  in_empty: {
    group: "predicates",
    api: '.in("id", [])',
    run: () =>
      fn(
        db.from("probe_rows").select(COLS).eq("owner_id", PROBE_OWNER),
        "in"
      )("id", []).limit(10),
  },
  in_200: {
    group: "predicates",
    api: '.in("id", <200 uuids>)',
    run: () =>
      fn(
        db.from("probe_rows").select(COLS).eq("owner_id", PROBE_OWNER),
        "in"
      )(
        "id",
        Array.from({ length: 200 }, (_, index) => probeId(index))
      ).limit(500),
  },
  gt_due: {
    group: "predicates",
    api: '.gt("due_date", today-50)',
    run: () =>
      fn(
        db.from("probe_rows").select(COLS).eq("owner_id", PROBE_OWNER),
        "gt"
      )("due_date", shiftDate(TODAY(), -50)).limit(10),
  },
  gte_due: {
    group: "predicates",
    api: '.gte("due_date", today)',
    run: () =>
      fn(
        db.from("probe_rows").select(COLS).eq("owner_id", PROBE_OWNER),
        "gte"
      )("due_date", TODAY()).limit(10),
  },
  lt_due: {
    group: "predicates",
    api: '.lt("due_date", today)',
    run: () =>
      fn(
        db.from("probe_rows").select(COLS).eq("owner_id", PROBE_OWNER),
        "lt"
      )("due_date", TODAY()).limit(20),
  },
  lte_due: {
    group: "predicates",
    api: '.lte("due_date", today)',
    run: () =>
      fn(
        db.from("probe_rows").select(COLS).eq("owner_id", PROBE_OWNER),
        "lte"
      )("due_date", TODAY()).limit(20),
  },
  gt_started: {
    group: "predicates",
    api: '.gt("started_at", isoAt(150))',
    run: () =>
      fn(
        db.from("probe_rows").select(COLS).eq("owner_id", PROBE_OWNER),
        "gt"
      )("started_at", isoAt(150)).limit(10),
  },
  lt_started: {
    group: "predicates",
    api: '.lt("started_at", isoAt(150))',
    run: () =>
      fn(
        db.from("probe_rows").select(COLS).eq("owner_id", PROBE_OWNER),
        "lt"
      )("started_at", isoAt(150)).limit(10),
  },
  is_null_grade: {
    group: "predicates",
    api: '.is("grade", null)',
    run: () =>
      fn(
        db.from("probe_rows").select(COLS).eq("owner_id", PROBE_OWNER),
        "is"
      )("grade", null).limit(10),
  },
  neq_status: {
    group: "predicates",
    api: '.neq("status", "done")',
    run: () =>
      fn(
        db.from("probe_rows").select(COLS).eq("owner_id", PROBE_OWNER),
        "neq"
      )("status", "done").limit(10),
  },
  like_title: {
    group: "predicates",
    api: '.like("title", "%数学%")',
    run: () =>
      fn(
        db.from("probe_rows").select(COLS).eq("owner_id", PROBE_OWNER),
        "like"
      )("title", "%数学%").limit(10),
  },

  select_id: {
    group: "projection",
    api: '.select("id").limit(50)',
    run: () => db.from("probe_rows").select("id").eq("owner_id", PROBE_OWNER).limit(50),
  },
  select_all_explicit: {
    group: "projection",
    api: ".select(<all columns>).limit(50)",
    run: () => db.from("probe_rows").select(FULL_COLS).eq("owner_id", PROBE_OWNER).limit(50),
  },
  select_star: {
    group: "projection",
    api: '.select("*").limit(50)',
    run: () => db.from("probe_rows").select("*").eq("owner_id", PROBE_OWNER).limit(50),
  },

  no_limit: {
    group: "paging",
    api: ".eq(owner_id)（无 limit）",
    run: () => db.from("probe_rows").select("id,seq").eq("owner_id", PROBE_OWNER),
  },
  range_first: {
    group: "paging",
    api: '.order("seq",{ascending:true}).range(0,9)',
    run: () =>
      db
        .from("probe_rows")
        .select("id,seq")
        .eq("owner_id", PROBE_OWNER)
        .order("seq", { ascending: true })
        .range(0, 9),
  },
  range_second: {
    group: "paging",
    api: '.order("seq",{ascending:true}).range(10,19)',
    run: () =>
      db
        .from("probe_rows")
        .select("id,seq")
        .eq("owner_id", PROBE_OWNER)
        .order("seq", { ascending: true })
        .range(10, 19),
  },
  offset_limit: {
    group: "paging",
    api: '.order("seq",{ascending:true}).offset(10).limit(10)',
    run: () => {
      const query = db
        .from("probe_rows")
        .select("id,seq")
        .eq("owner_id", PROBE_OWNER)
        .order("seq", { ascending: true });
      return fn(fn(query, "offset")(10), "limit")(10);
    },
  },
  limit_offset: {
    group: "paging",
    api: '.order("seq",{ascending:true}).limit(10).offset(10)',
    run: () => {
      const query = db
        .from("probe_rows")
        .select("id,seq")
        .eq("owner_id", PROBE_OWNER)
        .order("seq", { ascending: true });
      return fn(fn(query, "limit")(10), "offset")(10);
    },
  },
  order_limit_asc: {
    group: "paging",
    api: '.order("seq",{ascending:true}).limit(5)',
    run: () =>
      db
        .from("probe_rows")
        .select("id,seq")
        .eq("owner_id", PROBE_OWNER)
        .order("seq", { ascending: true })
        .limit(5),
  },
  order_limit_desc: {
    group: "paging",
    api: '.order("seq",{ascending:false}).limit(5)',
    run: () =>
      db
        .from("probe_rows")
        .select("id,seq")
        .eq("owner_id", PROBE_OWNER)
        .order("seq", { ascending: false })
        .limit(5),
  },
  order_limit_nulls: {
    group: "paging",
    api: '.order("grade",{ascending:true}).limit(10)',
    run: () =>
      db
        .from("probe_rows")
        .select("id,seq,grade")
        .eq("owner_id", PROBE_OWNER)
        .order("grade", { ascending: true })
        .limit(10),
  },

  app_assignments_today: {
    group: "app",
    api: '.eq(owner_id).eq("status","todo").eq("due_date",today).limit(5000)',
    run: () =>
      db
        .from("probe_rows")
        .select(COLS)
        .eq("owner_id", PROBE_OWNER)
        .eq("status", "todo")
        .eq("due_date", TODAY())
        .limit(5000),
  },
  app_assignments_overdue: {
    group: "app",
    api: '.eq(owner_id).eq("status","todo").lt("due_date",today).limit(5000)',
    run: () =>
      fn(
        db
          .from("probe_rows")
          .select(COLS)
          .eq("owner_id", PROBE_OWNER)
          .eq("status", "todo"),
        "lt"
      )("due_date", TODAY()).limit(5000),
  },
  app_course_slots_in: {
    group: "app",
    api: '.in("assignment_id", <10 uuids>).limit(5000)',
    run: () =>
      fn(
        db.from("probe_rows").select("id,assignment_id").eq("owner_id", PROBE_OWNER),
        "in"
      )(
        "assignment_id",
        Array.from({ length: 10 }, (_, index) => assignmentId(index))
      ).limit(5000),
  },
  app_focus_range: {
    group: "app",
    api: '.eq(owner_id).order("started_at",{ascending:false}).range(0,199)',
    run: () =>
      db
        .from("probe_rows")
        .select("id,assignment_id,started_at,duration_sec")
        .eq("owner_id", PROBE_OWNER)
        .order("started_at", { ascending: false })
        .range(0, 199),
  },
  app_focus_scan: {
    group: "app",
    api: '.select("duration_sec").eq(owner_id).range(0,199)',
    run: () =>
      db
        .from("probe_rows")
        .select("duration_sec")
        .eq("owner_id", PROBE_OWNER)
        .range(0, 199),
  },
  app_focus_keyset: {
    group: "app",
    api: '.lt("started_at", isoAt(150)).order("started_at",{ascending:false}).limit(50)',
    run: () =>
      fn(
        db
          .from("probe_rows")
          .select("id,started_at,duration_sec")
          .eq("owner_id", PROBE_OWNER),
        "lt"
      )("started_at", isoAt(150)).order("started_at", { ascending: false }).limit(50),
  },

  count_rows: {
    group: "aggregate",
    api: ".count()",
    run: () => fn(db.from("probe_rows").select("id").eq("owner_id", PROBE_OWNER), "count")(),
  },
  sum_duration: {
    group: "aggregate",
    api: '.sum("duration_sec")',
    run: () => fn(db.from("probe_rows").select("duration_sec").eq("owner_id", PROBE_OWNER), "sum")("duration_sec"),
  },
  group_status: {
    group: "aggregate",
    api: '.group("status")',
    run: () => fn(db.from("probe_rows").select("status").eq("owner_id", PROBE_OWNER), "group")("status"),
  },
};

const GROUPS = ["all", "predicates", "projection", "paging", "app", "aggregate"];

interface CaseResult {
  name: string;
  api: string;
  httpStatus: number;
  ok: boolean;
  count: number;
  bodyBytes: number;
  durationMs: number;
  sample: unknown;
  error: unknown;
}

async function runCase(name: string): Promise<CaseResult> {
  const entry = CASES[name];
  if (!entry) {
    return {
      name,
      api: "",
      httpStatus: 404,
      ok: false,
      count: 0,
      bodyBytes: 0,
      durationMs: 0,
      sample: null,
      error: { name: "not_found", message: `unknown case: ${name}` },
    };
  }

  const started = performance.now();
  try {
    const result = (await entry.run()) as QueryResult | null | undefined;
    const data = Array.isArray(result?.data) ? result.data : [];
    const body = JSON.stringify(result?.data ?? null);
    const status = result?.error
      ? (result.error.status && result.error.status >= 400 && result.error.status <= 599
          ? result.error.status
          : 502)
      : 200;
    return {
      name,
      api: entry.api,
      httpStatus: status,
      ok: !result?.error,
      count: data.length,
      bodyBytes: new TextEncoder().encode(body).length,
      durationMs: Math.round(performance.now() - started),
      sample: sanitize(data.slice(0, 3)),
      error: result?.error ? sanitize(result.error) : null,
    };
  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error));
    const unsupported = error instanceof Unsupported || /is not a function/i.test(err.message);
    return {
      name,
      api: entry.api,
      httpStatus: unsupported ? 501 : 500,
      ok: false,
      count: 0,
      bodyBytes: 0,
      durationMs: Math.round(performance.now() - started),
      sample: null,
      error: sanitize({ name: err.name, message: err.message }),
    };
  }
}

async function runGroup(group: string): Promise<Row> {
  const entries = Object.entries(CASES).filter(([, entry]) => group === "all" || entry.group === group);
  const results: CaseResult[] = [];
  for (const [name] of entries) results.push(await runCase(name));
  return {
    group,
    count: results.length,
    ok: results.every((result) => result.ok),
    results,
  };
}

function health(request: Request, url: URL): Row {
  return {
    ok: true,
    pathSeen: url.pathname,
    host: request.headers.get("host"),
    deno: Deno.version.deno,
    now: new Date().toISOString(),
  };
}

Deno.serve(async (request: Request) => {
  const url = new URL(request.url);
  const path = routePath(url.pathname);
  try {
    if (path === "/probe/health") return json(health(request, url));
    if (path === "/probe/introspect") return json(introspect());
    if (path === "/probe/seed") {
      if (request.method !== "POST") return json({ error: "method_not_allowed" }, 405);
      return json(await seed());
    }
    if (path === "/probe/all") {
      const group = url.searchParams.get("group") ?? "all";
      if (!GROUPS.includes(group)) {
        return json({ error: "unknown_group", group, available: GROUPS }, 400);
      }
      return json(await runGroup(group));
    }
    if (path === "/probe/case") {
      const name = url.searchParams.get("name") ?? "";
      const result = await runCase(name);
      return json(result, result.httpStatus);
    }
    return json({ error: "not_found", path }, 404);
  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error));
    return json({ error: sanitize({ name: err.name, message: err.message }) }, 500);
  }
});