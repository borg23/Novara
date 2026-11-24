"use client";

import { useCallback, useEffect, useRef, useState } from "react";

interface Course {
  id: number;
  name: string;
  teacher: string;
  credits: number;
  grade: string | null;
  status: string;
  semester: string;
  color: string;
}

interface GpaSummary {
  gpa: number | null;
  weighted: number;
  gradedCredits: number;
  earnedCredits: number;
  plannedCredits: number;
  targetCredits: number;
  completion: number | null;
}

interface ParsedRow {
  name: string;
  credits: number | null;
  grade: number | null;
  status: string;
  semester: string;
  error: string | null;
}

const STATUS_TEXT: Record<string, string> = { planned: "计划中", in_progress: "在读", completed: "已完成" };

export default function GpaView() {
  const [courses, setCourses] = useState<Course[]>([]);
  const [summary, setSummary] = useState<GpaSummary | null>(null);
  const [preview, setPreview] = useState<{ rows: ParsedRow[]; summary: GpaSummary; hasError: boolean } | null>(null);
  const [uploadMsg, setUploadMsg] = useState("");
  const [importing, setImporting] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const refresh = useCallback(async () => {
    const res = await fetch("/api/gpa");
    const d = await res.json();
    setSummary(d.summary);
    setCourses(d.courses);
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  async function upload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadMsg("");
    setPreview(null);
    const form = new FormData();
    form.append("file", file);
    const res = await fetch("/api/gpa/upload", { method: "POST", body: form });
    const d = await res.json();
    if (!res.ok) {
      setUploadMsg(d.error ?? "上传失败");
      return;
    }
    setPreview(d);
    if (e.target) e.target.value = "";
  }

  async function confirmImport() {
    if (!preview) return;
    setImporting(true);
    const res = await fetch("/api/gpa/upload", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ rows: preview.rows }),
    });
    const d = await res.json();
    setImporting(false);
    if (res.ok) {
      setUploadMsg(`导入完成：新增 ${d.created} 门，更新 ${d.updated} 门`);
      setPreview(null);
      refresh();
    } else {
      setUploadMsg(d.error ?? "导入失败");
    }
  }

  async function patchCourse(c: Course, patch: Partial<Course>) {
    await fetch(`/api/courses/${c.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    });
    refresh();
  }

  const pct =
    summary && summary.targetCredits > 0
      ? Math.min(100, Math.round((summary.earnedCredits / summary.targetCredits) * 100))
      : 0;

  return (
    <div>
      <h1 className="mb-1 text-2xl font-bold">GPA 计算器</h1>
      <p className="mb-4 text-sm text-stone-500">
        记录课程学分与成绩，自动按学分加权换算 4.0 绩点，并估算学分情况与课程完成度。
      </p>

      {summary && (
        <div className="mb-5 grid gap-3 sm:grid-cols-3">
          <div className="card p-4">
            <p className="text-xs text-stone-500">当前 GPA（4.0 制）</p>
            <p className="mt-1 text-4xl font-bold">{summary.gpa === null ? "—" : summary.gpa.toFixed(2)}</p>
            <p className="mt-1 text-xs text-stone-400">
              {summary.gradedCredits > 0 ? `已计入 ${summary.gradedCredits} 学分` : "暂无有效成绩"}
            </p>
          </div>
          <div className="card p-4">
            <p className="text-xs text-stone-500">已获学分 / 目标学分</p>
            <p className="mt-1 text-4xl font-bold">
              {summary.earnedCredits}
              <span className="text-xl font-normal text-stone-400"> / {summary.targetCredits}</span>
            </p>
            <div className="mt-2 h-2 overflow-hidden rounded-full bg-stone-200">
              <div className="h-full rounded-full bg-indigo-500 transition-all" style={{ width: `${pct}%` }} />
            </div>
            <p className="mt-1 text-xs text-stone-400">完成度 {pct}%</p>
          </div>
          <div className="card p-4">
            <p className="text-xs text-stone-500">课程完成度估算</p>
            <p className="mt-1 text-4xl font-bold">
              {summary.completion === null ? "—" : `${Math.round(summary.completion * 100)}%`}
            </p>
            <p className="mt-1 text-xs text-stone-400">
              计划中学分共 {summary.plannedCredits}，已完成 {summary.earnedCredits}
            </p>
          </div>
        </div>
      )}

      <div className="card mb-5 p-4">
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <p className="text-sm font-semibold">上传成绩单分析（CSV / JSON）</p>
          <input
            ref={fileRef}
            type="file"
            accept=".csv,.json"
            className="hidden"
            onChange={upload}
          />
          <button className="btn-ghost !py-1 text-xs" onClick={() => fileRef.current?.click()}>
            选择文件
          </button>
        </div>
        <p className="text-xs text-stone-500">
          CSV 表头支持：课程名 / 学分 / 成绩 / 状态 / 学期；JSON 为课程对象数组（name, credits, grade, status,
          semester）。成绩支持百分制或等级（A、优、良…）。上传后先预览分析，确认后才导入。
        </p>
        {uploadMsg && <p className="mt-2 text-sm text-indigo-700">{uploadMsg}</p>}

        {preview && (
          <div className="mt-3 border-t border-stone-100 pt-3">
            <p className="mb-2 text-sm">
              预览：共 {preview.rows.length} 条，预览 GPA{" "}
              <span className="font-bold">{preview.summary.gpa === null ? "—" : preview.summary.gpa.toFixed(2)}</span>
              {preview.hasError && <span className="ml-2 text-red-600">存在解析错误，错误行将被跳过</span>}
            </p>
            <div className="max-h-56 overflow-y-auto rounded-lg border border-stone-200">
              <table className="w-full text-xs">
                <thead className="sticky top-0 bg-stone-50">
                  <tr className="text-left text-stone-500">
                    <th className="px-2 py-1.5">课程名</th>
                    <th className="px-2 py-1.5">学分</th>
                    <th className="px-2 py-1.5">成绩</th>
                    <th className="px-2 py-1.5">状态</th>
                    <th className="px-2 py-1.5">学期</th>
                    <th className="px-2 py-1.5">问题</th>
                  </tr>
                </thead>
                <tbody>
                  {preview.rows.map((r, i) => (
                    <tr key={i} className="border-t border-stone-100">
                      <td className="px-2 py-1.5">{r.name}</td>
                      <td className="px-2 py-1.5">{r.credits}</td>
                      <td className="px-2 py-1.5">{r.grade === null ? "—" : r.grade}</td>
                      <td className="px-2 py-1.5">{STATUS_TEXT[r.status] ?? r.status}</td>
                      <td className="px-2 py-1.5">{r.semester}</td>
                      <td className="px-2 py-1.5 text-red-600">{r.error ?? ""}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <button className="btn-primary mt-3" onClick={confirmImport} disabled={importing}>
              {importing ? "导入中…" : "确认导入"}
            </button>
          </div>
        )}
      </div>

      <div className="card overflow-x-auto p-4">
        <p className="mb-3 text-sm font-semibold">课程成绩明细（可直接修改）</p>
        {courses.length === 0 ? (
          <p className="py-4 text-center text-sm text-stone-400">
            暂无课程，请先在「课程」页创建，或通过上方上传导入
          </p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-stone-500">
                <th className="py-2 pr-2">课程</th>
                <th className="py-2 pr-2">学分</th>
                <th className="py-2 pr-2">成绩</th>
                <th className="py-2 pr-2">状态</th>
                <th className="py-2 pr-2">学期</th>
              </tr>
            </thead>
            <tbody>
              {courses.map((c) => (
                <tr key={c.id} className="border-t border-stone-100">
                  <td className="py-1.5 pr-2 font-medium">{c.name}</td>
                  <td className="py-1.5 pr-2">
                    <input
                      type="number"
                      min={0}
                      step="0.5"
                      className="input !w-20 !py-1"
                      defaultValue={c.credits}
                      onBlur={(e) => {
                        const v = Number(e.target.value);
                        if (!Number.isNaN(v) && v !== c.credits) patchCourse(c, { credits: v });
                      }}
                    />
                  </td>
                  <td className="py-1.5 pr-2">
                    <input
                      className="input !w-24 !py-1"
                      placeholder="分数/等级"
                      defaultValue={c.grade ?? ""}
                      onBlur={(e) => {
                        const v = e.target.value.trim();
                        if (v !== (c.grade ?? "")) patchCourse(c, { grade: v || null });
                      }}
                    />
                  </td>
                  <td className="py-1.5 pr-2">
                    <select
                      className="input !w-28 !py-1"
                      defaultValue={c.status}
                      onChange={(e) => patchCourse(c, { status: e.target.value })}
                    >
                      <option value="planned">计划中</option>
                      <option value="in_progress">在读</option>
                      <option value="completed">已完成</option>
                    </select>
                  </td>
                  <td className="py-1.5 pr-2 text-stone-500">{c.semester || "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
