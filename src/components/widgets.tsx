"use client";

import { apiFetch } from "@/lib/api";
import { AppLink, IfWritable, useIdentity } from "@/components/identity";
import { useEffect, useState } from "react";
import { CITIES } from "@/lib/weather";

export interface Slot {
  dayOfWeek: number;
  startTime: string;
  endTime: string;
  location: string;
}

export interface CourseRow {
  id: string;
  name: string;
  teacher: string;
  credits: number;
  grade: string | null;
  status: string;
  semester: string;
  color: string;
  slots: Slot[];
}

export interface AssignmentRow {
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

export interface TaskRow {
  id: string;
  title: string;
  dueDate: string | null;
  status: string;
}

export interface FocusData {
  records: { id: string; assignmentId: string | null; assignmentTitle: string | null; startedAt: string; durationSec: number; note: string }[];
  todayTotalSec: number;
  perAssignment: { assignmentId: string | null; title: string | null; totalSec: number }[];
}

export interface GpaSummaryData {
  gpa: number | null;
  earnedCredits: number;
  plannedCredits: number;
  targetCredits: number;
  completion: number | null;
}

export interface WidgetData {
  tasks: TaskRow[];
  assignments: AssignmentRow[];
  courses: CourseRow[];
  focus: FocusData;
  gpa: GpaSummaryData | null;
}

export type RefreshFn = () => Promise<void>;

export function todayStr(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function fmtDuration(sec: number): string {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  if (h > 0) return `${h} 小时 ${m} 分`;
  if (m > 0) return `${m} 分 ${s} 秒`;
  return `${s} 秒`;
}

/* ---------- 今日任务 ---------- */
function TodayTasks({ data, refresh }: { data: WidgetData; refresh: RefreshFn }) {
  const { readOnly } = useIdentity();
  const [title, setTitle] = useState("");
  const today = todayStr();
  const list = data.tasks.filter((t) => t.status === "todo" && (t.dueDate === null || t.dueDate <= today));
  async function add(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) return;
    await apiFetch("/tasks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: title.trim(), dueDate: today }),
    });
    setTitle("");
    refresh();
  }
  async function toggle(t: TaskRow) {
    await apiFetch(`/tasks/${t.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: t.status === "done" ? "todo" : "done" }),
    });
    refresh();
  }
  async function del(id: string) {
    await apiFetch(`/tasks/${id}`, { method: "DELETE" });
    refresh();
  }
  return (
    <div className="space-y-2">
      <IfWritable>
        <form onSubmit={add} className="flex gap-2">
          <input
            className="input"
            placeholder="添加今日任务…"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />
          <button type="submit" className="btn-primary shrink-0">
            添加
          </button>
        </form>
      </IfWritable>
      {list.length === 0 && <p className="text-sm text-stone-400">今天没有待办任务</p>}
      <ul className="space-y-1">
        {list.map((t) => (
          <li key={t.id} className="group flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={t.status === "done"}
              disabled={readOnly}
              onChange={() => toggle(t)}
              className="h-4 w-4 accent-indigo-600"
            />
            <span className="flex-1">{t.title}</span>
            {t.dueDate && t.dueDate < today && <span className="text-xs text-red-500">已逾期</span>}
            <IfWritable>
              <button onClick={() => del(t.id)} className="hidden text-stone-400 hover:text-red-600 group-hover:block">
                删除
              </button>
            </IfWritable>
          </li>
        ))}
      </ul>
    </div>
  );
}

/* ---------- 今日作业 ---------- */
function HomeworkWidget({ data, refresh }: { data: WidgetData; refresh: RefreshFn }) {
  const { readOnly } = useIdentity();
  const today = todayStr();
  const todayList = data.assignments.filter((a) => a.status === "todo" && a.dueDate === today);
  const upcoming = data.assignments.filter((a) => a.status === "todo" && a.dueDate && a.dueDate > today).length;
  async function toggle(a: AssignmentRow) {
    await apiFetch(`/assignments/${a.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: a.status === "done" ? "todo" : "done" }),
    });
    refresh();
  }
  return (
    <div className="space-y-2">
      {todayList.length === 0 && <p className="text-sm text-stone-400">今天没有到期的作业</p>}
      <ul className="space-y-1">
        {todayList.map((a) => (
          <li key={a.id} className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={a.status === "done"}
              disabled={readOnly}
              onChange={() => toggle(a)}
              className="h-4 w-4 accent-indigo-600"
            />
            <span className="flex-1">{a.title}</span>
            {a.courseName && (
              <span className="badge" style={{ backgroundColor: `${a.courseColor ?? "#6366f1"}22`, color: a.courseColor ?? "#6366f1" }}>
                {a.courseName}
              </span>
            )}
          </li>
        ))}
      </ul>
      <div className="flex items-center justify-between border-t border-stone-100 pt-2 text-xs text-stone-500">
        <span>未来 {upcoming} 项待完成作业</span>
        <AppLink href="/homework" className="font-medium text-indigo-600 hover:underline">
          前往作业管理
        </AppLink>
      </div>
    </div>
  );
}

/* ---------- 日历 ---------- */
function CalendarWidget({ data }: { data: WidgetData }) {
  const now = new Date();
  const [ym, setYm] = useState({ y: now.getFullYear(), m: now.getMonth() });
  const [selected, setSelected] = useState<string | null>(null);
  const dueMap = new Map<string, number>();
  for (const a of data.assignments) {
    if (a.dueDate) dueMap.set(a.dueDate, (dueMap.get(a.dueDate) ?? 0) + 1);
  }
  const firstDow = (new Date(ym.y, ym.m, 1).getDay() + 6) % 7; // 周一起始
  const daysInMonth = new Date(ym.y, ym.m + 1, 0).getDate();
  const cells: (number | null)[] = [];
  for (let i = 0; i < firstDow; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);
  const pad = (n: number) => String(n).padStart(2, "0");
  const today = todayStr();
  const selectedList = selected
    ? data.assignments.filter((a) => a.dueDate === selected)
    : [];
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between text-sm">
        <button className="btn-ghost !px-2 !py-0.5" onClick={() => setYm(ym.m === 0 ? { y: ym.y - 1, m: 11 } : { y: ym.y, m: ym.m - 1 })}>
          ‹
        </button>
        <span className="font-medium">
          {ym.y} 年 {ym.m + 1} 月
        </span>
        <button className="btn-ghost !px-2 !py-0.5" onClick={() => setYm(ym.m === 11 ? { y: ym.y + 1, m: 0 } : { y: ym.y, m: ym.m + 1 })}>
          ›
        </button>
      </div>
      <div className="grid grid-cols-7 gap-0.5 text-center text-xs">
        {["一", "二", "三", "四", "五", "六", "日"].map((w) => (
          <div key={w} className="py-1 font-medium text-stone-400">
            {w}
          </div>
        ))}
        {cells.map((d, i) => {
          if (d === null) return <div key={`e${i}`} />;
          const ds = `${ym.y}-${pad(ym.m + 1)}-${pad(d)}`;
          const count = dueMap.get(ds) ?? 0;
          return (
            <button
              key={ds}
              onClick={() => setSelected(selected === ds ? null : ds)}
              className={`relative rounded-md py-1 transition-colors hover:bg-indigo-50 ${
                ds === today ? "bg-indigo-600 text-white hover:bg-indigo-600" : ds === selected ? "bg-indigo-100" : ""
              }`}
            >
              {d}
              {count > 0 && (
                <span
                  className={`absolute bottom-0.5 left-1/2 h-1 w-1 -translate-x-1/2 rounded-full ${
                    ds === today ? "bg-white" : "bg-indigo-500"
                  }`}
                />
              )}
            </button>
          );
        })}
      </div>
      {selected && (
        <div className="border-t border-stone-100 pt-1 text-xs">
          {selectedList.length === 0 ? (
            <p className="text-stone-400">该日无作业截止</p>
          ) : (
            <ul className="space-y-0.5">
              {selectedList.map((a) => (
                <li key={a.id} className="truncate">
                  · {a.title}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

/* ---------- 课程表 ---------- */
function ScheduleWidget({ data }: { data: WidgetData }) {
  const jsDay = new Date().getDay();
  const dow = jsDay === 0 ? 7 : jsDay;
  const slots = data.courses
    .flatMap((c) =>
      (c.slots ?? []).filter((s) => s.dayOfWeek === dow).map((s) => ({ ...s, course: c }))
    )
    .sort((a, b) => a.startTime.localeCompare(b.startTime));
  const weekNames = ["周一", "周二", "周三", "周四", "周五", "周六", "周日"];
  return (
    <div className="space-y-2">
      <p className="text-xs text-stone-500">{weekNames[dow - 1]} · {slots.length} 节课</p>
      {slots.length === 0 && <p className="text-sm text-stone-400">今天没有课</p>}
      <ul className="space-y-1.5">
        {slots.map((s, i) => (
          <li key={i} className="flex items-center gap-2 text-sm">
            <span
              className="h-8 w-1 shrink-0 rounded-full"
              style={{ backgroundColor: s.course.color }}
            />
            <div className="min-w-0 flex-1">
              <p className="truncate font-medium">{s.course.name}</p>
              <p className="text-xs text-stone-500">
                {s.startTime} - {s.endTime}
                {s.location ? ` · ${s.location}` : ""}
              </p>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

/* ---------- 天气 ---------- */
interface WeatherPayload {
  provider: string;
  city: string;
  error?: string;
  current?: { temp: number | null; text: string; wind?: number | string };
  daily?: { date: string; max: number | string; min: number | string; text: string }[];
}

function WeatherWidget() {
  const [cityId, setCityId] = useState("beijing");
  const [weather, setWeather] = useState<WeatherPayload | null>(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    let alive = true;
    setLoading(true);
    apiFetch(`/weather?city=${cityId}`)
      .then((r) => r.json())
      .then((d) => {
        if (alive) setWeather(d);
      })
      .catch(() => {
        if (alive) setWeather({ provider: "", city: "", error: "天气服务不可用" });
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [cityId]);
  return (
    <div className="space-y-2">
      <select className="input" value={cityId} onChange={(e) => setCityId(e.target.value)}>
        {CITIES.map((c) => (
          <option key={c.id} value={c.id}>
            {c.name}
          </option>
        ))}
      </select>
      {loading && <p className="text-sm text-stone-400">加载中…</p>}
      {weather?.error && <p className="text-sm text-red-500">{weather.error}</p>}
      {weather?.current && (
        <>
          <div className="flex items-baseline gap-2">
            <span className="text-3xl font-bold">{weather.current.temp}°</span>
            <span className="text-sm text-stone-600">{weather.current.text}</span>
            {weather.current.wind !== undefined && weather.current.wind !== "" && (
              <span className="text-xs text-stone-400">风 {weather.current.wind} 级</span>
            )}
          </div>
          <div className="grid grid-cols-3 gap-1 text-center text-xs">
            {(weather.daily ?? []).slice(0, 3).map((d) => (
              <div key={d.date} className="rounded-lg bg-stone-50 py-1.5">
                <p className="text-stone-500">{d.date.slice(5).replace("-", "/")}</p>
                <p className="font-medium">{d.text}</p>
                <p className="text-stone-500">
                  {d.max}° / {d.min}°
                </p>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

/* ---------- 计时器 ---------- */
function TimerWidget({ data, refresh }: { data: WidgetData; refresh: RefreshFn }) {
  const [assignmentId, setAssignmentId] = useState<string>("");
  const [note, setNote] = useState("");
  const [running, setRunning] = useState(false);
  const [seconds, setSeconds] = useState(0);

  useEffect(() => {
    if (!running) return;
    const t = setInterval(() => setSeconds((s) => s + 1), 1000);
    return () => clearInterval(t);
  }, [running]);

  async function stop() {
    setRunning(false);
    const sec = seconds;
    setSeconds(0);
    if (sec < 1) return;
    const res = await apiFetch("/focus", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        assignmentId: assignmentId === "" ? null : assignmentId,
        startedAt: new Date(Date.now() - sec * 1000).toISOString(),
        durationSec: sec,
        note: note.trim(),
      }),
    });
    if (res.ok) {
      setNote("");
      refresh();
    }
  }

  const clock = (() => {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;
    const pad = (n: number) => String(n).padStart(2, "0");
    return h > 0 ? `${pad(h)}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
  })();

  return (
    <div className="space-y-2">
      <div className="text-center">
        <p className="font-mono text-4xl font-bold tabular-nums">{clock}</p>
        <p className="mt-1 text-xs text-stone-500">今日已专注 {fmtDuration(data.focus.todayTotalSec)}</p>
      </div>
      <select
        className="input"
        value={assignmentId}
        onChange={(e) => setAssignmentId(e.target.value)}
        disabled={running}
      >
        <option value="">不绑定作业</option>
        {data.assignments
          .filter((a) => a.status === "todo")
          .map((a) => (
            <option key={a.id} value={a.id}>
              {a.title}
            </option>
          ))}
      </select>
      <input
        className="input"
        placeholder="备注（可选）"
        value={note}
        onChange={(e) => setNote(e.target.value)}
      />
      <div className="flex gap-2">
        {!running ? (
          <button className="btn-primary flex-1" onClick={() => setRunning(true)}>
            {seconds > 0 ? "继续" : "开始"}
          </button>
        ) : (
          <button className="btn-ghost flex-1" onClick={() => setRunning(false)}>
            暂停
          </button>
        )}
        <button className="btn-danger" onClick={stop} disabled={seconds < 1}>
          结束并记录
        </button>
        {!running && seconds > 0 && (
          <button className="btn-ghost" onClick={() => setSeconds(0)}>
            清零
          </button>
        )}
      </div>
    </div>
  );
}

/* ---------- GPA 摘要 ---------- */
function GpaWidget({ data }: { data: WidgetData }) {
  const g = data.gpa;
  if (!g) return <p className="text-sm text-stone-400">暂无课程数据</p>;
  const pct = g.targetCredits > 0 ? Math.min(100, Math.round((g.earnedCredits / g.targetCredits) * 100)) : 0;
  return (
    <div className="space-y-2">
      <div className="flex items-baseline gap-2">
        <span className="text-3xl font-bold">{g.gpa === null ? "—" : g.gpa.toFixed(2)}</span>
        <span className="text-xs text-stone-500">当前 GPA（4.0）</span>
      </div>
      <div>
        <div className="mb-1 flex justify-between text-xs text-stone-500">
          <span>
            已获学分 {g.earnedCredits} / 目标 {g.targetCredits}
          </span>
          <span>{pct}%</span>
        </div>
        <div className="h-2 overflow-hidden rounded-full bg-stone-200">
          <div className="h-full rounded-full bg-indigo-500 transition-all" style={{ width: `${pct}%` }} />
        </div>
      </div>
      <p className="text-xs text-stone-500">计划中学分共 {g.plannedCredits}</p>
      <AppLink href="/gpa" className="text-xs font-medium text-indigo-600 hover:underline">
        前往 GPA 计算器
      </AppLink>
    </div>
  );
}

export interface WidgetDef {
  title: string;
  render: (data: WidgetData, refresh: RefreshFn) => React.ReactNode;
}

export const WIDGETS: Record<string, WidgetDef> = {
  todayTasks: { title: "今日任务", render: (d, r) => <TodayTasks data={d} refresh={r} /> },
  homework: { title: "今日作业", render: (d, r) => <HomeworkWidget data={d} refresh={r} /> },
  calendar: { title: "日历", render: (d) => <CalendarWidget data={d} /> },
  schedule: { title: "课程表", render: (d) => <ScheduleWidget data={d} /> },
  weather: { title: "天气", render: () => <WeatherWidget /> },
  timer: { title: "专注计时", render: (d, r) => <TimerWidget data={d} refresh={r} /> },
  gpaSummary: { title: "GPA 概览", render: (d) => <GpaWidget data={d} /> },
};
