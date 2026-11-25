import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{ts,tsx}", "./web/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        paper: "#f5f2eb",
        ink: "#1f2937",
      },
    },
  },
  plugins: [],
};

export default config;
