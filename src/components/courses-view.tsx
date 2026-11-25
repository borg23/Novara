"use client";

import { apiFetch, apiList } from "@/lib/api";
import { IfWritable } from "@/components/identity";
import { useCallback, useEffect, useState } from "react";

interface Course {
  id: string;
  name: string;
  teacher: string;
  credits: number;
  grade: string | null;
  status: string;
  semester: string;
  color: string;
  slots: { id: string; dayOfWeek: number; startTime: string; endTime: string; location: string; weeks: string }[];
}

interface SlotInput {
  dayOfWeek: number;
  startTime: string;
  endTime: string;
  location: string;
  weeks: string;
}

const COLORS = ["#6366f1", "#0ea5e9", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6", "#ec4899", "#14b8a6"];
const STATUS_TEXT: Record<string, string> = { planned: "计划中", in_progress: "在读", completed: "已完成" };
const WEEK_NAMES = ["周一", "周二", "周三", "周四", "周五", "周六", "周日"];

export default function CoursesView() {
  const [courses, setCourses] = useState<Course[]>([]);
  const [editing, setEditing] = useState<Course | null>(null);
  const [slotEditor, setSlotEditor] = useState<Course | null>(null);
  const [showForm, setShowForm] = useState(false);

  const refresh = useCallback(async () => {
    setCourses(await apiList<Course>("/courses", "courses"));
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  async function del(id: string) {
    if (!confirm("确定删除该课程？其课表与关联作业的课程绑定将一并解除。")) return;
    await apiFetch(`/courses/${id}`, { method: "DELETE" });
    refresh();
  }

  return (
    <div>
      <h1 className="mb-4 text-2xl font-bold">课程与课表</h1>
      <div className="mb-4">
        <IfWritable>
          <button
            className="btn-primary"
            onClick={() => {
              setEditing(null);
              setShowForm(!showForm);
            }}
          >
            {showForm ? "收起表单" : "新建课程"}
          </button>
        </IfWritable>
      </div>

      {showForm && (
        <CourseForm
          initial={editing}
          onDone={() => {
            setShowForm(false);
            setEditing(null);
            refresh();
          }}
        />
      )}

      {courses.length === 0 && <p className="py-8 text-center text-sm text-stone-400">暂无课程，先新建一门课程吧</p>}
      <div className="grid gap-3 sm:grid-cols-2">
        {courses.map((c) => (
          <div key={c.id} className="card p-4">
            <div className="mb-2 flex items-center gap-2">
              <span className="h-3 w-3 shrink-0 rounded-full" style={{ backgroundColor: c.color }} />
              <p className="flex-1 truncate font-semibold">{c.name}</p>
              <span className="badge bg-stone-100 text-stone-600">{STATUS_TEXT[c.status]}</span>
            </div>
            <p className="mb-2 text-xs text-stone-500">
              {c.teacher ? `${c.teacher} · ` : ""}
              {c.credits} 学分
              {c.grade ? ` · 成绩 ${c.grade}` : ""}
              {c.semester ? ` · ${c.semester}` : ""}
            </p>
            {c.slots.length > 0 && (
              <ul className="mb-3 space-y-0.5 text-xs text-stone-500">
                {c.slots
                  .slice()
                  .sort((a, b) => a.dayOfWeek - b.dayOfWeek || a.startTime.localeCompare(b.startTime))
                  .map((s) => (
                    <li key={s.id}>
                      {WEEK_NAMES[s.dayOfWeek - 1]} {s.startTime}-{s.endTime}
                      {s.location ? ` @${s.location}` : ""}
                      {s.weeks !== "all" ? ` （第${s.weeks}周）` : ""}
                    </li>
                  ))}
              </ul>
            )}
            <IfWritable>
              <div className="flex gap-2">
                <button
                  className="btn-ghost !px-2 !py-1 text-xs"
                  onClick={() => {
                    setEditing(c);
                    setShowForm(true);
                  }}
                >
                  编辑
                </button>
                <button
                  className="btn-ghost !px-2 !py-1 text-xs"
                  onClick={() => setSlotEditor(c)}
                >
                  课表设置
                </button>
                <button className="btn-ghost !px-2 !py-1 text-xs text-red-600" onClick={() => del(c.id)}>
                  删除
                </button>
              </div>
            </IfWritable>
          </div>
        ))}
      </div>

      {slotEditor && (
        <SlotEditor
          course={slotEditor}
          onClose={() => setSlotEditor(null)}
          onDone={() => {
            setSlotEditor(null);
            refresh();
          }}
        />
      )}
    </div>
  );
}

function CourseForm({ initial, onDone }: { initial: Course | null; onDone: () => void }) {
  const [name, setName] = useState(initial?.name ?? "");
  const [teacher, setTeacher] = useState(initial?.teacher ?? "");
  const [credits, setCredits] = useState(initial ? String(initial.credits) : "");
  const [grade, setGrade] = useState(initial?.grade ?? "");
  const [status, setStatus] = useState(initial?.status ?? "in_progress");
  const [semester, setSemester] = useState(initial?.semester ?? "");
  const [color, setColor] = useState(initial?.color ?? COLORS[0]);
  const [error, setError] = useState("");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    const res = await apiFetch(initial ? `/courses/${initial.id}` : "/courses", {
      method: initial ? "PATCH" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name,
        teacher,
        credits: Number(credits) || 0,
        grade: grade.trim() || null,
        status,
        semester,
        color,
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
    <form onSubmit={submit} className="card mb-4 space-y-3 p-4">
      <p className="text-sm font-semibold">{initial ? "编辑课程" : "新建课程"}</p>
      <div className="grid gap-3 sm:grid-cols-3">
        <div>
          <label className="label">课程名</label>
          <input className="input" value={name} onChange={(e) => setName(e.target.value)} required />
        </div>
        <div>
          <label className="label">任课老师</label>
          <input className="input" value={teacher} onChange={(e) => setTeacher(e.target.value)} />
        </div>
        <div>
          <label className="label">学分</label>
          <input type="number" min={0} step="0.5" className="input" value={credits} onChange={(e) => setCredits(e.target.value)} />
        </div>
        <div>
          <label className="label">成绩（分数或等级）</label>
          <input className="input" placeholder="如 92 / A / 优" value={grade} onChange={(e) => setGrade(e.target.value)} />
        </div>
        <div>
          <label className="label">状态</label>
          <select className="input" value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="planned">计划中</option>
            <option value="in_progress">在读</option>
            <option value="completed">已完成</option>
          </select>
        </div>
        <div>
          <label className="label">学期</label>
          <input className="input" placeholder="如 2026 秋" value={semester} onChange={(e) => setSemester(e.target.value)} />
        </div>
      </div>
      <div>
        <label className="label">颜色</label>
        <div className="flex gap-2">
          {COLORS.map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => setColor(c)}
              className={`h-6 w-6 rounded-full ${color === c ? "ring-2 ring-offset-2 ring-stone-400" : ""}`}
              style={{ backgroundColor: c }}
            />
          ))}
        </div>
      </div>
      {error && <p className="text-sm text-red-600">{error}</p>}
      <button type="submit" className="btn-primary">
        保存
      </button>
    </form>
  );
}

function SlotEditor({ course, onClose, onDone }: { course: Course; onClose: () => void; onDone: () => void }) {
  const [slots, setSlots] = useState<SlotInput[]>(
    course.slots.length > 0
      ? course.slots.map((s) => ({
          dayOfWeek: s.dayOfWeek,
          startTime: s.startTime,
          endTime: s.endTime,
          location: s.location,
          weeks: s.weeks,
        }))
      : [{ dayOfWeek: 1, startTime: "08:00", endTime: "09:40", location: "", weeks: "all" }]
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  function update(i: number, patch: Partial<SlotInput>) {
    setSlots(slots.map((s, idx) => (idx === i ? { ...s, ...patch } : s)));
  }

  async function save() {
    setSaving(true);
    setError("");
    const res = await apiFetch(`/courses/${course.id}/slots`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ slots }),
    });
    if (!res.ok) {
      const d = await res.json();
      setError(d.error ?? "保存失败");
      setSaving(false);
      return;
    }
    onDone();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="card max-h-[85vh] w-full max-w-lg overflow-y-auto p-5" onClick={(e) => e.stopPropagation()}>
        <h2 className="mb-3 text-lg font-bold">课表设置 · {course.name}</h2>
        <div className="space-y-3">
          {slots.map((s, i) => (
            <div key={i} className="grid grid-cols-6 items-end gap-2 text-xs">
              <div className="col-span-2">
                <label className="label">星期</label>
                <select
                  className="input"
                  value={s.dayOfWeek}
                  onChange={(e) => update(i, { dayOfWeek: Number(e.target.value) })}
                >
                  {WEEK_NAMES.map((w, idx) => (
                    <option key={w} value={idx + 1}>
                      {w}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="label">开始</label>
                <input type="time" className="input" value={s.startTime} onChange={(e) => update(i, { startTime: e.target.value })} />
              </div>
              <div>
                <label className="label">结束</label>
                <input type="time" className="input" value={s.endTime} onChange={(e) => update(i, { endTime: e.target.value })} />
              </div>
              <div>
                <label className="label">地点</label>
                <input className="input" value={s.location} onChange={(e) => update(i, { location: e.target.value })} />
              </div>
              <div className="flex items-end">
                <button
                  type="button"
                  className="btn-ghost !py-1 text-red-600"
                  onClick={() => setSlots(slots.filter((_, idx) => idx !== i))}
                  disabled={slots.length === 1}
                >
                  移除
                </button>
              </div>
            </div>
          ))}
        </div>
        <div className="mt-3 flex gap-2">
          <button
            className="btn-ghost"
            onClick={() =>
              setSlots([...slots, { dayOfWeek: 1, startTime: "08:00", endTime: "09:40", location: "", weeks: "all" }])
            }
          >
            添加时间段
          </button>
          <button className="btn-primary" onClick={save} disabled={saving}>
            {saving ? "保存中…" : "保存课表"}
          </button>
        </div>
        {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
      </div>
    </div>
  );
}
