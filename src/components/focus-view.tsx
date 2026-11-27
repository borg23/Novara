"use client";

import { apiFetch } from "@/lib/api";
import { useEffect, useState } from "react";

interface Record {
  id: string;
  assignmentId: string | null;
  assignmentTitle: string | null;
  startedAt: string;
  durationSec: number;
  note: string;
}

interface PerAssignment {
  assignmentId: string | null;
  title: string | null;
  totalSec: number;
}

interface FocusData {
  records: Record[];
  todayTotalSec: number;
  perAssignment: PerAssignment[];
}

function fmt(sec: number): string {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  if (h > 0) return `${h} 小时 ${m} 分`;
  if (m > 0) return `${m} 分 ${s} 秒`;
  return `${s} 秒`;
}

function fmtTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString("zh-CN", {
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function FocusView() {
  const [data, setData] = useState<FocusData | null>(null);

  useEffect(() => {
    apiFetch("/focus")
      .then(async (r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (d && Array.isArray(d.perAssignment) && Array.isArray(d.records)) setData(d);
      })
      .catch(() => {});
  }, []);

  if (!data) {
    return <p className="py-12 text-center text-sm text-stone-400">加载中…</p>;
  }

  const maxSec = Math.max(1, ...data.perAssignment.map((p) => p.totalSec));

  return (
    <div>
      <h1 className="mb-1 text-2xl font-bold">专注记录</h1>
      <p className="mb-4 text-sm text-stone-500">
        在面板首页使用「专注计时」组件，计时结束后会自动记录到这里。
      </p>

      <div className="mb-5 grid gap-3 sm:grid-cols-2">
        <div className="card p-4">
          <p className="text-xs text-stone-500">今日专注总时长</p>
          <p className="mt-1 text-4xl font-bold">{fmt(data.todayTotalSec)}</p>
        </div>
        <div className="card p-4">
          <p className="text-xs text-stone-500">累计专注</p>
          <p className="mt-1 text-4xl font-bold">
            {fmt(data.records.reduce((sum, r) => sum + r.durationSec, 0))}
          </p>
          <p className="mt-1 text-xs text-stone-400">共 {data.records.length} 次记录</p>
        </div>
      </div>

      {data.perAssignment.length > 0 && (
        <div className="card mb-5 p-4">
          <p className="mb-3 text-sm font-semibold">每项作业的专注时长</p>
          <div className="space-y-2">
            {data.perAssignment.map((p) => (
              <div key={p.assignmentId ?? "none"}>
                <div className="mb-0.5 flex justify-between text-xs">
                  <span className="font-medium">{p.title ?? "未绑定作业"}</span>
                  <span className="text-stone-500">{fmt(p.totalSec)}</span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-stone-200">
                  <div
                    className="h-full rounded-full bg-indigo-500"
                    style={{ width: `${Math.max(4, Math.round((p.totalSec / maxSec) * 100))}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="card overflow-x-auto p-4">
        <p className="mb-3 text-sm font-semibold">历史记录</p>
        {data.records.length === 0 ? (
          <p className="py-4 text-center text-sm text-stone-400">还没有专注记录</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-stone-500">
                <th className="py-2 pr-2">开始时间</th>
                <th className="py-2 pr-2">时长</th>
                <th className="py-2 pr-2">绑定作业</th>
                <th className="py-2 pr-2">备注</th>
              </tr>
            </thead>
            <tbody>
              {data.records.map((r) => (
                <tr key={r.id} className="border-t border-stone-100">
                  <td className="py-1.5 pr-2 text-stone-500">{fmtTime(r.startedAt)}</td>
                  <td className="py-1.5 pr-2 font-medium">{fmt(r.durationSec)}</td>
                  <td className="py-1.5 pr-2">{r.assignmentTitle ?? "未绑定"}</td>
                  <td className="py-1.5 pr-2 text-stone-500">{r.note || "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
