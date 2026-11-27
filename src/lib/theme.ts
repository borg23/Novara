import { THEMES, isTheme, type Theme } from "../../functions/shared/theme";

export { THEMES, isTheme };
export type { Theme };

export const NEXT_THEME: Record<Theme, Theme> = {
  light: "dark",
  dark: "system",
  system: "light",
};

export const THEME_LABELS: Record<Theme, string> = {
  light: "浅色",
  dark: "深色",
  system: "跟随系统",
};
