"use client";

import { apiFetch, apiList } from "@/lib/api";
import { useCallback, useEffect, useState } from "react";
import {
  WIDGETS,
  type WidgetData,
  type RefreshFn,
  type FocusData,
  type GpaSummaryData,
} from "@/components/widgets";
import { IfWritable, useIdentity } from "@/components/identity";

interface WidgetConfig {
  columns: number;
  style: string;
  order: string[];
}

const EMPTY_DATA: WidgetData = {
  tasks: [],
  assignments: [],
  courses: [],
  focus: { records: [], todayTotalSec: 0, perAssignment: [] },
  gpa: null,
};

export default function Panel() {
  const { account, features } = useIdentity();
  const [config, setConfig] = useState<WidgetConfig>({ columns: 2, style: "card", order: Object.keys(WIDGETS) });
  const [data, setData] = useState<WidgetData>(EMPTY_DATA);
  const [loading, setLoading] = useState(true);
  const [editMode, setEditMode] = useState(false);
  const [dragIdx, setDragIdx] = useState<number | null>(null);
  const [dragOverIdx, setDragOverIdx] = useState<number | null>(null);

  const shown = (name: string) =>
    (name !== "weather" || features.weather) &&
    (name !== "timer" || features.focus) &&
    (name !== "gpaSummary" || features.gpa);

  const refresh: RefreshFn = useCallback(async () => {
    const [assignments, tasks, courses, widgets, focus, gpa] = await Promise.all([
      apiList("/assignments", "assignments"),
      apiList("/tasks", "tasks"),
      apiList("/courses", "courses"),
      apiFetch("/widgets").then((r) => r.json()),
      features.focus ? apiFetch("/focus").then((r) => r.json()) : null,
      features.gpa ? apiFetch("/gpa").then((r) => r.json()) : null,
    ]);
    setData({
      tasks: tasks as WidgetData["tasks"],
      assignments: assignments as WidgetData["assignments"],
      courses: courses as WidgetData["courses"],
      focus: (focus ?? EMPTY_DATA.focus) as FocusData,
      gpa: gpa ? (gpa.summary as GpaSummaryData) : null,
    });
    setConfig((prev) => ({
      columns: widgets.columns ?? prev.columns,
      style: widgets.style ?? prev.style,
      order: Array.isArray(widgets.order) ? widgets.order.filter(shown) : prev.order,
    }));
  }, [features.focus, features.gpa, features.weather]);

  useEffect(() => {
    refresh().finally(() => setLoading(false));
  }, [refresh]);

  async function saveConfig(next: Partial<WidgetConfig>) {
    const merged = { ...config, ...next };
    setConfig(merged);
    await apiFetch("/widgets", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(merged),
    });
  }

  function moveWidget(from: number, to: number) {
    if (from === to) return;
    const order = [...config.order];
    const [w] = order.splice(from, 1);
    order.splice(to, 0, w);
    saveConfig({ order });
  }

  const hiddenWidgets = Object.keys(WIDGETS).filter((w) => shown(w) && !config.order.includes(w));

  if (loading) {
    return <p className="py-12 text-center text-sm text-stone-400">面板加载中…</p>;
  }

  const dateStr = new Date().toLocaleDateString("zh-CN", {
    year: "numeric",
    month: "long",
    day: "numeric",
    weekday: "long",
  });

  return (
    <div className="panel-capsule">
      <div className="mb-5">
        <h1 className="text-2xl font-bold">你好，{account?.displayName || "同学"}</h1>
        <p className="text-sm text-stone-500">{dateStr}</p>
      </div>
      <IfWritable>
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <button
            className={editMode ? "btn-primary" : "btn-ghost"}
            onClick={() => setEditMode(!editMode)}
          >
            {editMode ? "完成" : "自定义面板"}
          </button>
          {editMode && (
            <>
              <div className="flex items-center gap-1 text-sm">
                <span className="text-stone-500">列数</span>
                {[1, 2, 3].map((n) => (
                  <button
                    key={n}
                    className={config.columns === n ? "btn-primary !px-2.5" : "btn-ghost !px-2.5"}
                    onClick={() => saveConfig({ columns: n })}
                  >
                    {n}
                  </button>
                ))}
              </div>
              <div className="flex items-center gap-1 text-sm">
                <span className="text-stone-500">样式</span>
                <button
                  className={config.style === "card" ? "btn-primary !px-2.5" : "btn-ghost !px-2.5"}
                  onClick={() => saveConfig({ style: "card" })}
                >
                  卡片
                </button>
                <button
                  className={config.style === "flat" ? "btn-primary !px-2.5" : "btn-ghost !px-2.5"}
                  onClick={() => saveConfig({ style: "flat" })}
                >
                  扁平
                </button>
              </div>
            </>
          )}
        </div>
      </IfWritable>

      {editMode && hiddenWidgets.length > 0 && (
        <div className="card mb-4 p-3">
          <p className="mb-2 text-xs text-stone-500">点击添加组件：</p>
          <div className="flex flex-wrap gap-2">
            {hiddenWidgets.map((w) => (
              <button
                key={w}
                className="btn-ghost !py-1 text-xs"
                onClick={() => saveConfig({ order: [...config.order, w] })}
              >
                + {WIDGETS[w].title}
              </button>
            ))}
          </div>
        </div>
      )}

      <div
        className="grid gap-4"
        style={{ gridTemplateColumns: `repeat(${config.columns}, minmax(0, 1fr))` }}
      >
        {config.order.map((w, idx) => {
          const def = WIDGETS[w];
          if (!def) return null;
          const isCard = config.style === "card";
          const isDragging = editMode && dragIdx === idx;
          const isDropTarget = editMode && dragOverIdx === idx && dragIdx !== idx;
          return (
            <div
              key={w}
              draggable={editMode}
              onDragStart={() => setDragIdx(idx)}
              onDragOver={(e) => {
                if (editMode) {
                  e.preventDefault();
                  setDragOverIdx(idx);
                }
              }}
              onDrop={(e) => {
                e.preventDefault();
                if (dragIdx !== null) moveWidget(dragIdx, idx);
                setDragIdx(null);
                setDragOverIdx(null);
              }}
              onDragEnd={() => {
                setDragIdx(null);
                setDragOverIdx(null);
              }}
              className={`${
                isCard ? "card p-4" : "panel-flat"
              } ${isDragging ? "opacity-50 outline-2 outline-dashed outline-indigo-400 outline-offset-2" : ""} ${
                isDropTarget ? "bg-indigo-100/70 ring-2 ring-inset ring-indigo-500" : ""
              }`}
            >
              <div
                className={`mb-2 flex items-center justify-between ${
                  editMode ? "cursor-grab" : ""
                }`}
              >
                <h2 className="text-sm font-semibold text-stone-700">{def.title}</h2>
                {editMode && (
                  <div className="flex items-center gap-1">
                    <button
                      className="btn-ghost !px-1.5 !py-0.5 text-xs"
                      title="上移"
                      disabled={idx === 0}
                      onClick={() => moveWidget(idx, idx - 1)}
                    >
                      ↑
                    </button>
                    <button
                      className="btn-ghost !px-1.5 !py-0.5 text-xs"
                      title="下移"
                      disabled={idx === config.order.length - 1}
                      onClick={() => moveWidget(idx, idx + 1)}
                    >
                      ↓
                    </button>
                    <span className="text-xs text-stone-400" title="拖拽排序">
                      拖拽排序
                    </span>
                    <button
                      className="text-stone-400 hover:text-red-600"
                      title="移除组件"
                      onClick={() => saveConfig({ order: config.order.filter((x) => x !== w) })}
                    >
                      ×
                    </button>
                  </div>
                )}
              </div>
              {def.render(data, refresh)}
            </div>
          );
        })}
        {config.order.length === 0 && (
          <p className="col-span-full py-8 text-center text-sm text-stone-400">
            面板是空的，点击「自定义面板」添加组件
          </p>
        )}
      </div>
    </div>
  );
}
