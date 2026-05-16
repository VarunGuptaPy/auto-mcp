import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        bg:       "#0a0a0a",
        surface:  "#141414",
        border:   "#242424",
        muted:    "#555555",
        text1:    "#e8e8e8",
        text2:    "#999999",
        accent:   "#7c6af7",
        "accent-h": "#9b8dff",
        success:  "#22c55e",
        warn:     "#eab308",
        danger:   "#ef4444",
      },
      fontFamily: {
        sans: ["var(--font-inter)", "system-ui", "sans-serif"],
        mono: ["var(--font-jetbrains)", "monospace"],
      },
      keyframes: {
        spin:  { to: { transform: "rotate(360deg)" } },
        pulse: { "0%,100%": { opacity: "1" }, "50%": { opacity: "0.3" } },
      },
      animation: {
        spin:  "spin 0.7s linear infinite",
        pulse: "pulse 1.4s ease-in-out infinite",
      },
    },
  },
  plugins: [],
};

export default config;
