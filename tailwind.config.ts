import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{ts,tsx}", "./web/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        paper: "rgb(var(--color-paper) / <alpha-value>)",
        surface: "rgb(var(--color-surface) / <alpha-value>)",
        "surface-soft": "rgb(var(--color-surface-soft) / <alpha-value>)",
        "surface-hover": "rgb(var(--color-surface-hover) / <alpha-value>)",
        ink: "rgb(var(--color-ink) / <alpha-value>)",
        strong: "rgb(var(--color-strong) / <alpha-value>)",
        muted: "rgb(var(--color-muted) / <alpha-value>)",
        faint: "rgb(var(--color-faint) / <alpha-value>)",
        line: "rgb(var(--color-line) / <alpha-value>)",
        "line-strong": "rgb(var(--color-line-strong) / <alpha-value>)",
        "line-soft": "rgb(var(--color-line-soft) / <alpha-value>)",
        accent: "rgb(var(--color-accent) / <alpha-value>)",
        "accent-strong": "rgb(var(--color-accent-strong) / <alpha-value>)",
        "accent-solid": "rgb(var(--color-accent-solid) / <alpha-value>)",
        "accent-solid-strong": "rgb(var(--color-accent-solid-strong) / <alpha-value>)",
        "accent-soft": "rgb(var(--color-accent-soft) / <alpha-value>)",
        danger: "rgb(var(--color-danger) / <alpha-value>)",
        "danger-solid": "rgb(var(--color-danger-solid) / <alpha-value>)",
        "danger-solid-strong": "rgb(var(--color-danger-solid-strong) / <alpha-value>)",
        overlay: "rgb(var(--color-overlay) / <alpha-value>)",
      },
    },
  },
  plugins: [],
};

export default config;
