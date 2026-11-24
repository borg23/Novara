"use client";

import { useCallback, useEffect, useState } from "react";
import {
  WIDGETS,
  type WidgetData,
  type RefreshFn,
  type FocusData,
  type GpaSummaryData,
} from "@/components/widgets";

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
  const [config, setConfig] = useState<WidgetConfig>({ columns: 2, style: "card", order: Object.keys(WIDGETS) });
  const [data, setData] = useState<WidgetData>(EMPTY_DATA);
  const [loading, setLoading] = useState(true);
  const [editMode, setEditMode] = useState(false);
  const [dragIdx, setDragIdx] = useState<number | null>(null);
  const [dragOverIdx, setDragOverIdx] = useState<number | null>(null);

  const refresh: RefreshFn = useCallback(async () => {
    const [assignments, tasks, courses, focus, gpa, widgets] = await Promise.all([
      fetch("/api/assignments").then((r) => r.json()),
      fetch("/api/tasks").then((r) => r.json()),
      fetch("/api/courses").then((r) => r.json()),
      fetch("/api/focus").then((r) => r.json()),
      fetch("/api/gpa").then((r) => r.json()),
      fetch("/api/widgets").then((r) => r.json()),
    ]);
    setData({
      tasks: tasks as WidgetData["tasks"],
      assignments: assignments as WidgetData["assignments"],
      courses: courses as WidgetData["courses"],
      focus: (focus as { records: []; todayTotalSec: number; perAssignment: [] }) as FocusData,
      gpa: gpa.summary as GpaSummaryData,
    });
    setConfig((prev) => ({
      columns: widgets.columns ?? prev.columns,
      style: widgets.style ?? prev.style,
      order: widgets.order ?? prev.order,
    }));
  }, []);

  useEffect(() => {
    refresh().finally(() => setLoading(false));
  }, [refresh]);

  async function saveConfig(next: Partial<WidgetConfig>) {
    const merged = { ...config, ...next };
    setConfig(merged);
    await fetch("/api/widgets", {
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

  const hiddenWidgets = Object.keys(WIDGETS).filter((w) => !config.order.includes(w));

  if (loading) {
    return <p className="py-12 text-center text-sm text-stone-400">面板加载中…</p>;
  }

  return (
    <div>
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
              className={
                isCard
                  ? "card p-4"
                  : "border-b border-stone-200 pb-4"
              }
            >
              <div
                className={`mb-2 flex items-center justify-between ${
                  editMode ? "cursor-grab" : ""
                } ${dragOverIdx === idx && dragIdx !== idx ? "rounded-lg bg-indigo-50" : ""}`}
              >
                <h2 className="text-sm font-semibold text-stone-700">{def.title}</h2>
                {editMode && (
                  <div className="flex items-center gap-1">
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
