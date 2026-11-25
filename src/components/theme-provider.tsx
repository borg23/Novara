"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { apiFetch } from "@/lib/api";
import { isTheme, type Theme } from "@/lib/theme";
import { useIdentity } from "@/components/identity";

export const THEME_STORAGE_KEY = "novara-theme";

interface ThemeState {
  theme: Theme;
  setTheme: (next: Theme) => void;
}

const ThemeContext = createContext<ThemeState>({ theme: "system", setTheme: () => {} });

function systemPrefersDark(): boolean {
  return window.matchMedia("(prefers-color-scheme: dark)").matches;
}

function applyTheme(theme: Theme): void {
  const dark = theme === "dark" || (theme === "system" && systemPrefersDark());
  document.documentElement.classList.toggle("dark", dark);
}

function storedTheme(): Theme {
  try {
    const cached = localStorage.getItem(THEME_STORAGE_KEY);
    return isTheme(cached) ? cached : "system";
  } catch {
    return "system";
  }
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const { ready, account } = useIdentity();
  const [theme, setThemeState] = useState<Theme>(storedTheme);
  const themeRef = useRef(theme);
  themeRef.current = theme;

  // 服务端值为准：登录态拉取后端偏好；访客清掉缓存并跟随系统。
  useEffect(() => {
    if (!ready) return;
    if (!account) {
      localStorage.removeItem(THEME_STORAGE_KEY);
      setThemeState("system");
      return;
    }
    let alive = true;
    apiFetch("/settings")
      .then(async (res) => {
        if (!alive || !res.ok) return;
        const data = (await res.json().catch(() => null)) as { theme?: unknown } | null;
        if (!data || !isTheme(data.theme)) return;
        localStorage.setItem(THEME_STORAGE_KEY, data.theme);
        setThemeState(data.theme);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [ready, account]);

  useEffect(() => {
    applyTheme(theme);
    if (theme !== "system") return;
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => applyTheme("system");
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, [theme]);

  const setTheme = useCallback(
    (next: Theme) => {
      const prev = themeRef.current;
      if (prev === next) return;
      applyTheme(next);
      localStorage.setItem(THEME_STORAGE_KEY, next);
      setThemeState(next);
      if (account) {
        apiFetch("/settings", { method: "PUT", body: JSON.stringify({ theme: next }) })
          .then((res) => {
            if (res.ok) return;
            applyTheme(prev);
            localStorage.setItem(THEME_STORAGE_KEY, prev);
            setThemeState(prev);
          })
          .catch(() => {
            applyTheme(prev);
            localStorage.setItem(THEME_STORAGE_KEY, prev);
            setThemeState(prev);
          });
      }
    },
    [account]
  );

  return <ThemeContext.Provider value={{ theme, setTheme }}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeState {
  return useContext(ThemeContext);
}