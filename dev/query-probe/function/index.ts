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
const OTHER_OWNER = "1c2d3e4f-5a6b-4c7d-8e9f-0a1b2c3d4e5f";
const PROBE_ROWS = 1200;
const SENTINEL_ROWS = 5;
const COLS =
  "id,owner_id,seq,status,due_date,due_date_opt,started_at,duration_sec,assignment_id,title,grade";
const FULL_COLS =
  "id,owner_id,seq,status,due_date,due_date_opt,started_at,duration_sec,assignment_id,title,grade,payload,created_at";
const NO_STORE = { "cache-control": "no-store" };

class Unsupported extends Error {
  constructor(message: string) {
    super(message);
    this.name = "Unsupported";
  }
}

class Invalid extends Error {
  constructor(message: string) {
    super(message);
    this.name = "Invalid";
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

const SHANGHAI_DATE = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Asia/Shanghai",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

function todayInShanghai(): string {
  return SHANGHAI_DATE.format(new Date());
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

function sentinelId(index: number): string {
  return `00000000-0000-4000-b000-${(index + 1).toString(16).padStart(12, "0")}`;
}

function assignmentId(group: number): string {
  return `00000000-0000-4000-a000-${group.toString(16).padStart(12, "0")}`;
}

function assignmentIds(): string[] {
  return Array.from({ length: 10 }, (_, index) => assignmentId(index));
}

function seedRows(): Row[] {
  const today = todayInShanghai();
  const rows: Row[] = [];
  for (let seq = 0; seq < PROBE_ROWS; seq += 1) {
    rows.push({
      id: probeId(seq),
      owner_id: PROBE_OWNER,
      seq,
      status: seq % 2 === 0 ? "todo" : "done",
      due_date: shiftDate(today, seq - Math.floor(PROBE_ROWS / 2)),
      due_date_opt: seq % 7 === 0 ? null : shiftDate(today, (seq % 30) - 15),
      started_at: isoAt(seq),
      duration_sec: 60 + seq,
      assignment_id: assignmentId(seq % 10),
      title: seq % 3 === 0 ? `数学作业 ${seq}` : `英语作业 ${seq}`,
      grade: seq % 5 === 0 ? null : "A",
      payload: "x".repeat(512),
      created_at: "2026-01-01T00:00:00Z",
    });
  }
  for (let index = 0; index < SENTINEL_ROWS; index += 1) {
    rows.push({
      id: sentinelId(index),
      owner_id: OTHER_OWNER,
      seq: 5000 + index,
      status: "todo",
      due_date: shiftDate(today, -1),
      due_date_opt: shiftDate(today, -1),
      started_at: isoAt(5000 + index),
      duration_sec: 1,
      assignment_id: null,
      title: `外部同学哨兵 ${index}`,
      grade: null,
      payload: "sentinel",
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
  for (const owner of [PROBE_OWNER, OTHER_OWNER]) {
    const deleted = await db.from("probe_rows").delete().eq("owner_id", owner);
    if (deleted?.error) {
      return { ok: false, stage: "delete", owner, error: sanitize(deleted.error) };
    }
  }

  const rows = seedRows();
  for (let index = 0; index < rows.length; index += 50) {
    const result = await db.from("probe_rows").insert(rows.slice(index, index + 50));
    if (result?.error) {
      return { ok: false, stage: "insert", insertedBeforeError: index, error: sanitize(result.error) };
    }
  }

  const probeVisible = await db
    .from("probe_rows")
    .select("id,owner_id")
    .eq("owner_id", PROBE_OWNER)
    .limit(2000);
  const sentinelVisible = await db
    .from("probe_rows")
    .select("id,owner_id")
    .eq("owner_id", OTHER_OWNER)
    .limit(100);

  return {
    ok: !probeVisible?.error && !sentinelVisible?.error,
    requested: rows.length,
    probeVisible: probeVisible?.data?.length ?? 0,
    sentinelVisible: sentinelVisible?.data?.length ?? 0,
    error: probeVisible?.error
      ? sanitize(probeVisible.error)
      : sentinelVisible?.error
        ? sanitize(sentinelVisible.error)
        : null,
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

interface CheckResult {
  ok: boolean;
  reason: string;
}
type Checker = (rows: Row[]) => CheckResult;

function verdict(ok: boolean, reason: string): CheckResult {
  return { ok, reason };
}

const allOwner: Checker = (rows) => {
  const bad = rows.filter((row) => row.owner_id !== PROBE_OWNER);
  return verdict(bad.length === 0, bad.length === 0 ? "all rows belong to probe owner" : `${bad.length} rows from another owner`);
};

function countEq(expected: number): Checker {
  return (rows) => verdict(rows.length === expected, `expected ${expected} rows, got ${rows.length}`);
}

function seqEq(expected: number[]): Checker {
  return (rows) => {
    const actual = rows.map((row) => Number(row.seq));
    const ok = actual.length === expected.length && actual.every((value, index) => value === expected[index]);
    return verdict(ok, ok ? `seq ${expected.join(",")}` : `expected seq ${expected.join(",")}, got ${actual.join(",")}`);
  };
}

function allRows(predicate: (row: Row) => boolean, reason: string): Checker {
  return (rows) => {
    const bad = rows.filter((row) => !predicate(row));
    return verdict(bad.length === 0, bad.length === 0 ? reason : `${bad.length} rows failed: ${reason}`);
  };
}

function combine(...checkers: Checker[]): Checker {
  return (rows) => {
    for (const checker of checkers) {
      const result = checker(rows);
      if (!result.ok) return result;
    }
    return verdict(true, "all checks passed");
  };
}

function orderDesc(column: string): Checker {
  return (rows) => {
    const values = rows.map((row) => String(row[column] ?? ""));
    const ok = values.every((value, index) => index === 0 || values[index - 1] >= value);
    return verdict(ok, ok ? `${column} descending` : `${column} is not descending`);
  };
}

function allDue(column: string, compare: (value: string) => boolean, label: string): Checker {
  return allRows(
    (row) => row[column] !== null && row[column] !== undefined && compare(String(row[column])),
    label
  );
}

interface CaseDef {
  group: "predicates" | "projection" | "paging" | "app" | "aggregate";
  api: string;
  run: () => Query;
  check?: Checker;
}

function scope(columns = COLS): Query {
  return db.from("probe_rows").select(columns).eq("owner_id", PROBE_OWNER);
}

const CASES: Record<string, CaseDef> = {
  eq_control: {
    group: "predicates",
    api: ".eq(owner_id).limit(5)",
    run: () => scope().limit(5),
    check: combine(countEq(5), allOwner),
  },
  or_string: {
    group: "predicates",
    api: '.or("status.eq.todo,due_date.lt.<today>").limit(1000)',
    run: () => {
      const today = todayInShanghai();
      return fn(scope(), "or")(`status.eq.todo,due_date.lt.${today}`).limit(1000);
    },
    check: combine(
      countEq(900),
      allOwner,
      allRows(
        (row) => String(row.status) === "todo" || String(row.due_date) < todayInShanghai(),
        "row satisfies status=todo OR due_date<today"
      )
    ),
  },
  or_multiarg: {
    group: "predicates",
    api: '.or("status.eq.todo", "due_date.lt.<today>").limit(1000)',
    run: () => {
      const today = todayInShanghai();
      return fn(scope(), "or")("status.eq.todo", `due_date.lt.${today}`).limit(1000);
    },
    check: combine(
      countEq(900),
      allOwner,
      allRows(
        (row) => String(row.status) === "todo" || String(row.due_date) < todayInShanghai(),
        "row satisfies status=todo OR due_date<today"
      )
    ),
  },
  or_array: {
    group: "predicates",
    api: '.or([{column:"status",operator:"eq",value:"todo"}]).limit(1000)',
    run: () =>
      fn(scope(), "or")([{ column: "status", operator: "eq", value: "todo" }]).limit(1000),
    check: combine(countEq(600), allOwner, allRows((row) => String(row.status) === "todo", "status=todo")),
  },
  or_array_op: {
    group: "predicates",
    api: '.or([{column:"status",op:"eq",value:"todo"}]).limit(1000)',
    run: () => fn(scope(), "or")([{ column: "status", op: "eq", value: "todo" }]).limit(1000),
    check: combine(countEq(600), allOwner, allRows((row) => String(row.status) === "todo", "status=todo")),
  },
  or_array_field: {
    group: "predicates",
    api: '.or([{field:"status",operator:"eq",value:"todo"}]).limit(1000)',
    run: () =>
      fn(scope(), "or")([{ field: "status", operator: "eq", value: "todo" }]).limit(1000),
    check: combine(countEq(600), allOwner, allRows((row) => String(row.status) === "todo", "status=todo")),
  },
  and_string: {
    group: "predicates",
    api: '.and("status.eq.todo,due_date.gte.<today-10>").limit(1000)',
    run: () => {
      const past = shiftDate(todayInShanghai(), -10);
      return fn(scope(), "and")(`status.eq.todo,due_date.gte.${past}`).limit(1000);
    },
    check: combine(
      countEq(305),
      allOwner,
      allRows(
        (row) => String(row.status) === "todo" && String(row.due_date) >= shiftDate(todayInShanghai(), -10),
        "status=todo AND due_date>=today-10"
      )
    ),
  },
  and_multiarg: {
    group: "predicates",
    api: '.and("status.eq.todo", "due_date.gte.<today-10>").limit(1000)',
    run: () => {
      const past = shiftDate(todayInShanghai(), -10);
      return fn(scope(), "and")("status.eq.todo", `due_date.gte.${past}`).limit(1000);
    },
    check: combine(
      countEq(305),
      allOwner,
      allRows(
        (row) => String(row.status) === "todo" && String(row.due_date) >= shiftDate(todayInShanghai(), -10),
        "status=todo AND due_date>=today-10"
      )
    ),
  },
  in_two: {
    group: "predicates",
    api: '.in("id", [probeId(1), probeId(2)])',
    run: () => fn(scope(), "in")("id", [probeId(1), probeId(2)]).limit(10),
    check: combine(countEq(2), allOwner),
  },
  in_one: {
    group: "predicates",
    api: '.in("id", [probeId(1)])',
    run: () => fn(scope(), "in")("id", [probeId(1)]).limit(10),
    check: combine(countEq(1), allOwner),
  },
  in_empty: {
    group: "predicates",
    api: '.in("id", [])',
    run: () => fn(scope(), "in")("id", []).limit(10),
    check: combine(countEq(0), allOwner),
  },
  in_200: {
    group: "predicates",
    api: '.in("id", <200 uuids>)',
    run: () =>
      fn(scope(), "in")(
        "id",
        Array.from({ length: 200 }, (_, index) => probeId(index))
      ).limit(500),
    check: combine(countEq(200), allOwner),
  },
  gt_due: {
    group: "predicates",
    api: '.gt("due_date", today-50)',
    run: () => fn(scope(), "gt")("due_date", shiftDate(todayInShanghai(), -50)).limit(10),
    check: combine(
      countEq(10),
      allOwner,
      allDue("due_date", (value) => value > shiftDate(todayInShanghai(), -50), "due_date>today-50")
    ),
  },
  gte_due: {
    group: "predicates",
    api: '.gte("due_date", today)',
    run: () => fn(scope(), "gte")("due_date", todayInShanghai()).limit(10),
    check: combine(
      countEq(10),
      allOwner,
      allDue("due_date", (value) => value >= todayInShanghai(), "due_date>=today")
    ),
  },
  lt_due: {
    group: "predicates",
    api: '.lt("due_date", today)',
    run: () => fn(scope(), "lt")("due_date", todayInShanghai()).limit(20),
    check: combine(
      countEq(20),
      allOwner,
      allDue("due_date", (value) => value < todayInShanghai(), "due_date<today")
    ),
  },
  lte_due: {
    group: "predicates",
    api: '.lte("due_date", today)',
    run: () => fn(scope(), "lte")("due_date", todayInShanghai()).limit(20),
    check: combine(
      countEq(20),
      allOwner,
      allDue("due_date", (value) => value <= todayInShanghai(), "due_date<=today")
    ),
  },
  gt_started: {
    group: "predicates",
    api: '.gt("started_at", isoAt(150))',
    run: () => fn(scope(), "gt")("started_at", isoAt(150)).limit(10),
    check: combine(
      countEq(10),
      allOwner,
      allRows((row) => String(row.started_at) > isoAt(150), "started_at>isoAt(150)")
    ),
  },
  lt_started: {
    group: "predicates",
    api: '.lt("started_at", isoAt(150))',
    run: () => fn(scope(), "lt")("started_at", isoAt(150)).limit(10),
    check: combine(
      countEq(10),
      allOwner,
      allRows((row) => String(row.started_at) < isoAt(150), "started_at<isoAt(150)")
    ),
  },
  lt_due_opt: {
    group: "predicates",
    api: '.lt("due_date_opt", today)',
    run: () => fn(scope(), "lt")("due_date_opt", todayInShanghai()).limit(20),
    check: combine(
      countEq(20),
      allOwner,
      allDue("due_date_opt", (value) => value < todayInShanghai(), "due_date_opt<today (null excluded)")
    ),
  },
  gte_due_opt: {
    group: "predicates",
    api: '.gte("due_date_opt", today)',
    run: () => fn(scope(), "gte")("due_date_opt", todayInShanghai()).limit(20),
    check: combine(
      countEq(20),
      allOwner,
      allDue("due_date_opt", (value) => value >= todayInShanghai(), "due_date_opt>=today (null excluded)")
    ),
  },
  eq_due_opt: {
    group: "predicates",
    api: '.eq("due_date_opt", today)',
    run: () => scope().eq("due_date_opt", todayInShanghai()).limit(20),
    check: combine(
      countEq(20),
      allOwner,
      allDue("due_date_opt", (value) => value === todayInShanghai(), "due_date_opt=today")
    ),
  },
  neq_due_opt: {
    group: "predicates",
    api: '.neq("due_date_opt", today)',
    run: () => fn(scope(), "neq")("due_date_opt", todayInShanghai()).limit(20),
    check: combine(
      countEq(20),
      allOwner,
      allDue("due_date_opt", (value) => value !== todayInShanghai(), "due_date_opt!=today (null excluded)")
    ),
  },
  is_due_opt_null: {
    group: "predicates",
    api: '.is("due_date_opt", null)',
    run: () => fn(scope(), "is")("due_date_opt", null).limit(20),
    check: combine(
      countEq(20),
      allOwner,
      allRows((row) => row.due_date_opt === null, "due_date_opt IS NULL")
    ),
  },
  is_null_grade: {
    group: "predicates",
    api: '.is("grade", null)',
    run: () => fn(scope(), "is")("grade", null).limit(10),
    check: combine(countEq(10), allOwner, allRows((row) => row.grade === null, "grade IS NULL")),
  },
  neq_status: {
    group: "predicates",
    api: '.neq("status", "done")',
    run: () => fn(scope(), "neq")("status", "done").limit(10),
    check: combine(
      countEq(10),
      allOwner,
      allRows((row) => String(row.status) !== "done", "status!=done")
    ),
  },
  like_title: {
    group: "predicates",
    api: '.like("title", "%数学%")',
    run: () => fn(scope(), "like")("title", "%数学%").limit(10),
    check: combine(
      countEq(10),
      allOwner,
      allRows((row) => String(row.title).includes("数学"), "title LIKE %数学%")
    ),
  },

  select_id: {
    group: "projection",
    api: '.select("id").limit(50)',
    run: () => db.from("probe_rows").select("id").eq("owner_id", PROBE_OWNER).limit(50),
    check: countEq(50),
  },
  select_all_explicit: {
    group: "projection",
    api: ".select(<all columns>).limit(50)",
    run: () => scope(FULL_COLS).limit(50),
    check: combine(countEq(50), allOwner),
  },
  select_star: {
    group: "projection",
    api: '.select("*").limit(50)',
    run: () => db.from("probe_rows").select("*").eq("owner_id", PROBE_OWNER).limit(50),
    check: combine(countEq(50), allOwner),
  },

  no_limit: {
    group: "paging",
    api: ".eq(owner_id)（无 limit；期望 1200 行）",
    run: () => scope("id,owner_id,seq"),
    check: combine(
      countEq(PROBE_ROWS),
      allOwner
    ),
  },
  range_first: {
    group: "paging",
    api: '.order("seq",{ascending:true}).range(0,9)',
    run: () => scope("id,owner_id,seq").order("seq", { ascending: true }).range(0, 9),
    check: combine(countEq(10), allOwner, seqEq([0, 1, 2, 3, 4, 5, 6, 7, 8, 9])),
  },
  range_second: {
    group: "paging",
    api: '.order("seq",{ascending:true}).range(10,19)',
    run: () => scope("id,owner_id,seq").order("seq", { ascending: true }).range(10, 19),
    check: combine(
      countEq(10),
      allOwner,
      seqEq([10, 11, 12, 13, 14, 15, 16, 17, 18, 19])
    ),
  },
  offset_limit: {
    group: "paging",
    api: '.order("seq",{ascending:true}).offset(10).limit(10)',
    run: () => {
      const query = scope("id,owner_id,seq").order("seq", { ascending: true });
      return fn(fn(query, "offset")(10), "limit")(10);
    },
    check: combine(
      countEq(10),
      allOwner,
      seqEq([10, 11, 12, 13, 14, 15, 16, 17, 18, 19])
    ),
  },
  limit_offset: {
    group: "paging",
    api: '.order("seq",{ascending:true}).limit(10).offset(10)',
    run: () => {
      const query = scope("id,owner_id,seq").order("seq", { ascending: true });
      return fn(fn(query, "limit")(10), "offset")(10);
    },
    check: combine(
      countEq(10),
      allOwner,
      seqEq([10, 11, 12, 13, 14, 15, 16, 17, 18, 19])
    ),
  },
  order_limit_asc: {
    group: "paging",
    api: '.order("seq",{ascending:true}).limit(5)',
    run: () => scope("id,owner_id,seq").order("seq", { ascending: true }).limit(5),
    check: combine(countEq(5), allOwner, seqEq([0, 1, 2, 3, 4])),
  },
  order_limit_desc: {
    group: "paging",
    api: '.order("seq",{ascending:false}).limit(5)',
    run: () => scope("id,owner_id,seq").order("seq", { ascending: false }).limit(5),
    check: combine(countEq(5), allOwner, seqEq([1199, 1198, 1197, 1196, 1195])),
  },
  order_limit_nulls: {
    group: "paging",
    api: '.order("grade",{ascending:true}).limit(10)',
    run: () => scope("id,owner_id,seq,grade").order("grade", { ascending: true }).limit(10),
    check: combine(countEq(10), allOwner),
  },

  app_assignments_today: {
    group: "app",
    api: '.eq(owner_id).eq("status","todo").eq("due_date",today).limit(5000)',
    run: () => scope().eq("status", "todo").eq("due_date", todayInShanghai()).limit(5000),
    check: combine(
      countEq(1),
      allOwner,
      allRows(
        (row) => String(row.status) === "todo" && String(row.due_date) === todayInShanghai(),
        "status=todo AND due_date=today"
      )
    ),
  },
  app_assignments_overdue: {
    group: "app",
    api: '.eq(owner_id).eq("status","todo").lt("due_date",today).limit(5000)',
    run: () => {
      const query = scope().eq("status", "todo");
      return fn(query, "lt")("due_date", todayInShanghai()).limit(5000);
    },
    check: combine(
      countEq(300),
      allOwner,
      allRows(
        (row) => String(row.status) === "todo" && String(row.due_date) < todayInShanghai(),
        "status=todo AND due_date<today"
      )
    ),
  },
  app_course_slots_in: {
    group: "app",
    api: '.in("assignment_id", <10 uuids>).limit(5000)',
    run: () => {
      const query = db.from("probe_rows").select("id,owner_id,assignment_id").eq("owner_id", PROBE_OWNER);
      return fn(query, "in")("assignment_id", assignmentIds()).limit(5000);
    },
    check: (() => {
      const ids = new Set(assignmentIds());
      return combine(
        countEq(PROBE_ROWS),
        allOwner,
        allRows((row) => ids.has(String(row.assignment_id)), "assignment_id in probe set")
      );
    })(),
  },
  app_focus_range: {
    group: "app",
    api: '.eq(owner_id).order("started_at",{ascending:false}).range(0,199)',
    run: () =>
      scope("id,owner_id,started_at,duration_sec")
        .order("started_at", { ascending: false })
        .range(0, 199),
    check: combine(countEq(200), allOwner, orderDesc("started_at")),
  },
  app_focus_scan: {
    group: "app",
    api: '.select("duration_sec").eq(owner_id).range(0,199)',
    run: () => scope("owner_id,duration_sec").range(0, 199),
    check: combine(countEq(200), allOwner),
  },
  app_focus_keyset: {
    group: "app",
    api: '.lt("started_at", isoAt(900)).order("started_at",{ascending:false}).limit(50)',
    run: () =>
      fn(scope("id,owner_id,started_at,duration_sec"), "lt")("started_at", isoAt(900))
        .order("started_at", { ascending: false })
        .limit(50),
    check: combine(
      countEq(50),
      allOwner,
      allRows((row) => String(row.started_at) < isoAt(900), "started_at<isoAt(900)"),
      orderDesc("started_at")
    ),
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
  queryOk: boolean;
  checkOk: boolean;
  ok: boolean;
  count: number;
  bodyBytes: number;
  durationMs: number;
  sample: unknown;
  error: unknown;
  check: CheckResult | null;
}

async function runCase(name: string): Promise<CaseResult> {
  const entry = CASES[name];
  if (!entry) {
    return {
      name,
      api: "",
      httpStatus: 404,
      queryOk: false,
      checkOk: false,
      ok: false,
      count: 0,
      bodyBytes: 0,
      durationMs: 0,
      sample: null,
      error: { name: "not_found", message: `unknown case: ${name}` },
      check: null,
    };
  }

  const started = performance.now();
  try {
    const result = (await entry.run()) as QueryResult | null | undefined;
    if (!result || typeof result !== "object" || (!("data" in result) && !("error" in result))) {
      throw new Invalid("query did not return {data,error}");
    }
    const data = Array.isArray(result.data) ? result.data : [];
    const body = JSON.stringify(result.data ?? null);
    const status = result.error
      ? (result.error.status && result.error.status >= 400 && result.error.status <= 599
          ? result.error.status
          : 502)
      : 200;
    const checkResult = entry.check ? entry.check(data) : null;
    const queryOk = !result.error;
    const checkOk = checkResult?.ok ?? true;
    return {
      name,
      api: entry.api,
      httpStatus: status,
      queryOk,
      checkOk,
      ok: queryOk && checkOk,
      count: data.length,
      bodyBytes: new TextEncoder().encode(body).length,
      durationMs: Math.round(performance.now() - started),
      sample: sanitize(data.slice(0, 3)),
      error: result.error ? sanitize(result.error) : null,
      check: checkResult,
    };
  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error));
    const unsupported = error instanceof Unsupported || /is not a function|not a function/i.test(err.message);
    const invalid = error instanceof Invalid || /invalid|unknown|not supported|unsupported/i.test(err.message);
    return {
      name,
      api: entry.api,
      httpStatus: unsupported ? 501 : invalid ? 400 : 500,
      queryOk: false,
      checkOk: false,
      ok: false,
      count: 0,
      bodyBytes: 0,
      durationMs: Math.round(performance.now() - started),
      sample: null,
      error: sanitize({ name: err.name, message: err.message }),
      check: null,
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
    queryOk: results.every((result) => result.queryOk),
    checkOk: results.every((result) => result.checkOk),
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

function methodNotAllowed(allow: string): Response {
  return json({ error: "method_not_allowed", allow }, 405);
}

Deno.serve(async (request: Request) => {
  const url = new URL(request.url);
  const path = routePath(url.pathname);
  try {
    if (path === "/probe/health") {
      if (request.method !== "GET") return methodNotAllowed("GET");
      return json(health(request, url));
    }
    if (path === "/probe/introspect") {
      if (request.method !== "GET") return methodNotAllowed("GET");
      return json(introspect());
    }
    if (path === "/probe/seed") {
      if (request.method !== "POST") return methodNotAllowed("POST");
      return json(await seed());
    }
    if (path === "/probe/all") {
      if (request.method !== "GET") return methodNotAllowed("GET");
      const group = url.searchParams.get("group") ?? "all";
      if (!GROUPS.includes(group)) {
        return json({ error: "unknown_group", group, available: GROUPS }, 400);
      }
      return json(await runGroup(group));
    }
    if (path === "/probe/case") {
      if (request.method !== "GET") return methodNotAllowed("GET");
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