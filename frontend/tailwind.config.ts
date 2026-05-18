import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        bg:          "var(--bg)",
        surface:     "var(--surface)",
        "surface-2": "var(--surface-2)",
        border:      "var(--border)",
        "border-sub":"var(--border-sub)",
        muted:       "var(--muted)",
        text1:       "rgb(var(--text1-rgb) / <alpha-value>)",
        text2:       "rgb(var(--text2-rgb) / <alpha-value>)",
        accent:      "rgb(var(--accent-rgb) / <alpha-value>)",
        "accent-h":  "rgb(var(--accent-h-rgb) / <alpha-value>)",
        "accent-bg": "var(--accent-bg)",
        success:     "#22c55e",
        warn:        "#eab308",
        danger:      "#ef4444",
      },
      fontFamily: {
        sans: ["var(--font-inter)", "system-ui", "sans-serif"],
        mono: ["var(--font-jetbrains)", "monospace"],
      },
      keyframes: {
        spin:      { to: { transform: "rotate(360deg)" } },
        pulse:     { "0%,100%": { opacity: "1" }, "50%": { opacity: "0.4" } },
        marquee:   { "0%": { transform: "translateX(0%)" }, "100%": { transform: "translateX(-50%)" } },
        "fade-up": { from: { opacity: "0", transform: "translateY(16px)" }, to: { opacity: "1", transform: "translateY(0)" } },
        "fade-in": { from: { opacity: "0" }, to: { opacity: "1" } },
        float:     { "0%,100%": { transform: "translateY(0px)" }, "50%": { transform: "translateY(-6px)" } },
      },
      animation: {
        spin:      "spin 0.75s linear infinite",
        pulse:     "pulse 1.4s ease-in-out infinite",
        marquee:   "marquee 35s linear infinite",
        "fade-up": "fade-up 0.5s cubic-bezier(0.16,1,0.3,1) both",
        "fade-in": "fade-in 0.4s ease both",
        float:     "float 4s ease-in-out infinite",
      },
    },
  },
  plugins: [],
};

export default config;
