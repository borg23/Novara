"use client";

import { NEXT_THEME, THEME_LABELS } from "@/lib/theme";
import { useTheme } from "@/components/theme-provider";

export default function ThemeToggle() {
  const { theme, setTheme } = useTheme();

  return (
    <button
      onClick={() => setTheme(NEXT_THEME[theme])}
      className="btn-ghost !px-2.5 !py-1"
      title="切换主题：浅色 → 深色 → 跟随系统"
    >
      主题 · {THEME_LABELS[theme]}
    </button>
  );
}