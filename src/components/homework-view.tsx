"use client";

import { apiFetch, apiList } from "@/lib/api";
import { IfWritable, useIdentity } from "@/components/identity";
import { useCallback, useEffect, useState } from "react";

interface Course {
  id: string;
  name: string;
  color: string;
}

interface Assignment {
  id: string;
  title: string;
  description: string;
  dueDate: string | null;
  status: string;
  priority: number;
  courseId: string | null;
  courseName: string | null;
  courseColor: string | null;
}

interface Exam {
  id: string;
  title: string;
  examDate: string | null;
  score: number | null;
  note: string;
  courseId: string | null;
  courseName: string | null;
}

type Tab = "assignments" | "exams" | "import";

const STATUS_TEXT: Record<string, string> = { todo: "待办", done: "已完成" };

export default function HomeworkView() {
  const { features } = useIdentity();
  const [tab, setTab] = useState<Tab>("assignments");
  const [courses, setCourses] = useState<Course[]>([]);
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [exams, setExams] = useState<Exam[]>([]);
  const [filter, setFilter] = useState("all");

  const refresh = useCallback(async () => {
    const [c, a, e] = await Promise.all([
      apiList<Course>("/courses", "courses"),
      apiList<Assignment>("/assignments", "assignments"),
      apiList<Exam>("/exams", "exams"),
    ]);
    setCourses(c);
    setAssignments(a);
    setExams(e);
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const today = new Date().toISOString().slice(0, 10);

  const tabs = (
    [
      ["assignments", "作业"],
      ["exams", "考试记录"],
      ["import", "批量导入"],
    ] as [Tab, string][]
  ).filter(([key]) => key !== "import" || features.batchImport);

  return (
    <div>
      <h1 className="mb-4 text-2xl font-bold">作业管理</h1>
      <div className="mb-4 flex gap-1 border-b border-stone-200 text-sm">
        {tabs.map(([key, label]) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={`-mb-px border-b-2 px-3 py-2 font-medium ${
              tab === key ? "border-indigo-600 text-indigo-600" : "border-transparent text-stone-500 hover:text-stone-700"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === "assignments" && (
        <AssignmentTab
          courses={courses}
          assignments={assignments}
          filter={filter}
          setFilter={setFilter}
          today={today}
          refresh={refresh}
        />
      )}
      {tab === "exams" && <ExamTab courses={courses} exams={exams} refresh={refresh} />}
      {tab === "import" && <ImportTab refresh={refresh} />}
    </div>
  );
}

/* ---------------- 作业 ---------------- */
function AssignmentTab({
  courses,
  assignments,
  filter,
  setFilter,
  today,
  refresh,
}: {
  courses: Course[];
  assignments: Assignment[];
  filter: string;
  setFilter: (f: string) => void;
  today: string;
  refresh: () => Promise<void>;
}) {
  const [editing, setEditing] = useState<Assignment | null>(null);
  const [showForm, setShowForm] = useState(false);
  const { readOnly } = useIdentity();

  const filtered = assignments.filter((a) => {
    if (filter === "todo") return a.status === "todo";
    if (filter === "done") return a.status === "done";
    if (filter === "overdue") return a.status === "todo" && a.dueDate && a.dueDate < today;
    return true;
  });

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex gap-1 text-sm">
          {(
            [
              ["all", "全部"],
              ["todo", "待办"],
              ["done", "已完成"],
              ["overdue", "已逾期"],
            ] as [string, string][]
          ).map(([key, label]) => (
            <button
              key={key}
              onClick={() => setFilter(key)}
              className={filter === key ? "btn-primary !py-1 text-xs" : "btn-ghost !py-1 text-xs"}
            >
              {label}
            </button>
          ))}
        </div>
        <IfWritable>
          <button className="btn-primary" onClick={() => { setEditing(null); setShowForm(!showForm); }}>
            {showForm ? "收起表单" : "新建作业"}
          </button>
        </IfWritable>
      </div>

      {showForm && (
        <AssignmentForm
          courses={courses}
          initial={editing}
          onDone={() => {
            setShowForm(false);
            setEditing(null);
            refresh();
          }}
        />
      )}

      {filtered.length === 0 && <p className="py-8 text-center text-sm text-stone-400">暂无作业</p>}
      <ul className="space-y-2">
        {filtered.map((a) => (
          <li key={a.id} className="card flex items-center gap-3 p-3">
            <input
              type="checkbox"
              checked={a.status === "done"}
              disabled={readOnly}
              onChange={async () => {
                await apiFetch(`/assignments/${a.id}`, {
                  method: "PATCH",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ status: a.status === "done" ? "todo" : "done" }),
                });
                refresh();
              }}
              className="h-4 w-4 shrink-0 accent-indigo-600"
            />
            <div className="min-w-0 flex-1">
              <p className={`truncate text-sm font-medium ${a.status === "done" ? "text-stone-400 line-through" : ""}`}>
                {a.title}
              </p>
              <p className="truncate text-xs text-stone-500">
                {a.courseName ? `${a.courseName} · ` : ""}
                {a.dueDate ? `截止 ${a.dueDate}` : "无截止日期"}
                {a.status === "todo" && a.dueDate && a.dueDate < today && (
                  <span className="ml-1 text-red-500">已逾期</span>
                )}
              </p>
            </div>
            <span className="badge bg-stone-100 text-stone-600">{STATUS_TEXT[a.status]}</span>
            <IfWritable>
              <button
                className="btn-ghost !px-2 !py-1 text-xs"
                onClick={() => {
                  setEditing(a);
                  setShowForm(true);
                }}
              >
                编辑
              </button>
              <button
                className="btn-ghost !px-2 !py-1 text-xs text-red-600"
                onClick={async () => {
                  if (!confirm("确定删除该作业？")) return;
                  await apiFetch(`/assignments/${a.id}`, { method: "DELETE" });
                  refresh();
                }}
              >
                删除
              </button>
            </IfWritable>
          </li>
        ))}
      </ul>
    </div>
  );
}

function AssignmentForm({
  courses,
  initial,
  onDone,
}: {
  courses: Course[];
  initial: Assignment | null;
  onDone: () => void;
}) {
  const [title, setTitle] = useState(initial?.title ?? "");
  const [description, setDescription] = useState(initial?.description ?? "");
  const [dueDate, setDueDate] = useState(initial?.dueDate ?? "");
  const [courseId, setCourseId] = useState<string>(initial?.courseId ? String(initial.courseId) : "");
  const [priority, setPriority] = useState(initial?.priority ?? 0);
  const [error, setError] = useState("");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    const body = {
      title,
      description,
      dueDate: dueDate || null,
      courseId: courseId === "" ? null : Number(courseId),
      priority,
    };
    const res = await apiFetch(initial ? `/assignments/${initial.id}` : "/assignments", {
      method: initial ? "PATCH" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const d = await res.json();
      setError(d.error ?? "保存失败");
      return;
    }
    onDone();
  }

  return (
    <form onSubmit={submit} className="card space-y-3 p-4">
      <p className="text-sm font-semibold">{initial ? "编辑作业" : "新建作业"}</p>
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label className="label">标题</label>
          <input className="input" value={title} onChange={(e) => setTitle(e.target.value)} required />
        </div>
        <div>
          <label className="label">绑定课程</label>
          <select className="input" value={courseId} onChange={(e) => setCourseId(e.target.value)}>
            <option value="">不绑定</option>
            {courses.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="label">截止日期</label>
          <input type="date" className="input" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
        </div>
        <div>
          <label className="label">优先级</label>
          <select className="input" value={priority} onChange={(e) => setPriority(Number(e.target.value))}>
            <option value={0}>普通</option>
            <option value={1}>较高</option>
            <option value={2}>紧急</option>
          </select>
        </div>
      </div>
      <div>
        <label className="label">备注</label>
        <input className="input" value={description} onChange={(e) => setDescription(e.target.value)} />
      </div>
      {error && <p className="text-sm text-red-600">{error}</p>}
      <button type="submit" className="btn-primary">
        保存
      </button>
    </form>
  );
}

/* ---------------- 考试记录 ---------------- */
function ExamTab({
  courses,
  exams,
  refresh,
}: {
  courses: Course[];
  exams: Exam[];
  refresh: () => Promise<void>;
}) {
  const [editing, setEditing] = useState<Exam | null>(null);
  const [showForm, setShowForm] = useState(false);

  return (
    <div className="space-y-4">
      <IfWritable>
        <button
          className="btn-primary"
          onClick={() => {
            setEditing(null);
            setShowForm(!showForm);
          }}
        >
          {showForm ? "收起表单" : "新建考试记录"}
        </button>
      </IfWritable>
      {showForm && (
        <ExamForm
          courses={courses}
          initial={editing}
          onDone={() => {
            setShowForm(false);
            setEditing(null);
            refresh();
          }}
        />
      )}
      {exams.length === 0 && <p className="py-8 text-center text-sm text-stone-400">暂无考试记录</p>}
      <ul className="space-y-2">
        {exams.map((x) => (
          <li key={x.id} className="card flex items-center gap-3 p-3">
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">{x.title}</p>
              <p className="truncate text-xs text-stone-500">
                {x.courseName ? `${x.courseName} · ` : ""}
                {x.examDate ? `考试日期 ${x.examDate}` : "日期未定"}
                {x.score !== null && ` · 成绩 ${x.score}`}
                {x.note ? ` · ${x.note}` : ""}
              </p>
            </div>
            <IfWritable>
              <button
                className="btn-ghost !px-2 !py-1 text-xs"
                onClick={() => {
                  setEditing(x);
                  setShowForm(true);
                }}
              >
                编辑
              </button>
              <button
                className="btn-ghost !px-2 !py-1 text-xs text-red-600"
                onClick={async () => {
                  if (!confirm("确定删除该考试记录？")) return;
                  await apiFetch(`/exams/${x.id}`, { method: "DELETE" });
                  refresh();
                }}
              >
                删除
              </button>
            </IfWritable>
          </li>
        ))}
      </ul>
    </div>
  );
}

function ExamForm({
  courses,
  initial,
  onDone,
}: {
  courses: Course[];
  initial: Exam | null;
  onDone: () => void;
}) {
  const [title, setTitle] = useState(initial?.title ?? "");
  const [examDate, setExamDate] = useState(initial?.examDate ?? "");
  const [score, setScore] = useState(initial?.score !== null ? String(initial?.score) : "");
  const [note, setNote] = useState(initial?.note ?? "");
  const [courseId, setCourseId] = useState<string>(initial?.courseId ? String(initial.courseId) : "");
  const [error, setError] = useState("");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    const res = await apiFetch(initial ? `/exams/${initial.id}` : "/exams", {
      method: initial ? "PATCH" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title,
        examDate: examDate || null,
        score: score === "" ? null : Number(score),
        note,
        courseId: courseId === "" ? null : Number(courseId),
      }),
    });
    if (!res.ok) {
      const d = await res.json();
      setError(d.error ?? "保存失败");
      return;
    }
    onDone();
  }

  return (
    <form onSubmit={submit} className="card space-y-3 p-4">
      <p className="text-sm font-semibold">{initial ? "编辑考试记录" : "新建考试记录"}</p>
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label className="label">考试名称</label>
          <input className="input" value={title} onChange={(e) => setTitle(e.target.value)} required />
        </div>
        <div>
          <label className="label">绑定课程</label>
          <select className="input" value={courseId} onChange={(e) => setCourseId(e.target.value)}>
            <option value="">不绑定</option>
            {courses.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="label">考试日期</label>
          <input type="date" className="input" value={examDate} onChange={(e) => setExamDate(e.target.value)} />
        </div>
        <div>
          <label className="label">成绩（0-100）</label>
          <input type="number" min={0} max={100} step="0.5" className="input" value={score} onChange={(e) => setScore(e.target.value)} />
        </div>
      </div>
      <div>
        <label className="label">备注</label>
        <input className="input" value={note} onChange={(e) => setNote(e.target.value)} />
      </div>
      {error && <p className="text-sm text-red-600">{error}</p>}
      <button type="submit" className="btn-primary">
        保存
      </button>
    </form>
  );
}

/* ---------------- 批量导入 ---------------- */
function ImportTab({ refresh }: { refresh: () => Promise<void> }) {
  const [text, setText] = useState("");
  const [result, setResult] = useState<{
    created: { id: string; title: string; courseName: string }[];
    failed: { line: string; error: string }[];
  } | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setResult(null);
    setLoading(true);
    try {
      const res = await apiFetch("/assignments/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
      });
      const d = await res.json();
      if (!res.ok) {
        setError(d.error ?? "导入失败");
        return;
      }
      setResult(d);
      setText("");
      refresh();
    } catch {
      setError("网络错误，请重试");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="card p-4">
        <p className="mb-2 text-sm font-semibold">文本批量导入作业</p>
        <p className="mb-3 text-xs text-stone-500">
          每行一条作业，用逗号、分号或 Tab 分隔：<span className="font-mono">课程名, 作业标题, 截止日期(可选)</span>
          。课程不存在时会自动创建。
        </p>
        <form onSubmit={submit} className="space-y-3">
          <textarea
            className="input min-h-32 font-mono text-xs"
            placeholder={"示例：\n高等数学, 第三章课后习题, 2026-11-30\n大学英语, 背诵 Unit 5 单词"}
            value={text}
            onChange={(e) => setText(e.target.value)}
            required
          />
          {error && <p className="text-sm text-red-600">{error}</p>}
          <button type="submit" disabled={loading} className="btn-primary">
            {loading ? "解析导入中…" : "解析并导入"}
          </button>
        </form>
      </div>
      {result && (
        <div className="card space-y-2 p-4 text-sm">
          <p className="font-medium">
            成功导入 {result.created.length} 条
            {result.failed.length > 0 && <span className="text-red-600">，失败 {result.failed.length} 条</span>}
          </p>
          <ul className="space-y-1 text-xs">
            {result.created.map((c) => (
              <li key={c.id} className="text-stone-600">
                ✓ {c.courseName && `[${c.courseName}] `}
                {c.title}
              </li>
            ))}
            {result.failed.map((f, i) => (
              <li key={i} className="text-red-600">
                ✗ {f.line || "(空行)"}：{f.error}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
