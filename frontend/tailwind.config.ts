import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        // ── Neutrals (zinc scale — no purple tint) ──────────────
        bg:          "#09090b",   // zinc-950
        surface:     "#111113",   // slightly lifted black
        "surface-2": "#18181b",   // zinc-900
        border:      "#27272a",   // zinc-800
        "border-sub":"#3f3f46",   // zinc-700
        muted:       "#71717a",   // zinc-500
        text1:       "#fafafa",   // zinc-50
        text2:       "#a1a1aa",   // zinc-400
        // ── Accent (indigo — professional, developer-facing) ─────
        accent:      "#6366f1",   // indigo-500
        "accent-h":  "#818cf8",   // indigo-400
        "accent-bg": "#1e1b4b",   // deep indigo tint for backgrounds
        // ── Semantic ─────────────────────────────────────────────
        success:     "#22c55e",
        warn:        "#eab308",
        danger:      "#ef4444",
      },
      fontFamily: {
        sans: ["var(--font-inter)", "system-ui", "sans-serif"],
        mono: ["var(--font-jetbrains)", "monospace"],
      },
      backgroundImage: {
        "dot-grid":
          "radial-gradient(circle, #27272a 1px, transparent 1px)",
        "hero-gradient":
          "radial-gradient(ellipse 80% 50% at 50% -10%, rgba(99,102,241,0.15) 0%, transparent 65%)",
        "card-shine":
          "linear-gradient(135deg, rgba(255,255,255,0.03) 0%, transparent 60%)",
      },
      keyframes: {
        spin:       { to: { transform: "rotate(360deg)" } },
        pulse:      { "0%,100%": { opacity: "1" }, "50%": { opacity: "0.4" } },
        marquee:    { "0%": { transform: "translateX(0%)" }, "100%": { transform: "translateX(-50%)" } },
        "fade-up":  { from: { opacity: "0", transform: "translateY(16px)" }, to: { opacity: "1", transform: "translateY(0)" } },
        "fade-in":  { from: { opacity: "0" }, to: { opacity: "1" } },
      },
      animation: {
        spin:      "spin 0.75s linear infinite",
        pulse:     "pulse 1.4s ease-in-out infinite",
        marquee:   "marquee 30s linear infinite",
        "fade-up": "fade-up 0.5s cubic-bezier(0.16,1,0.3,1) both",
        "fade-in": "fade-in 0.4s ease both",
      },
      boxShadow: {
        card:    "0 1px 3px 0 rgba(0,0,0,0.4), 0 1px 2px -1px rgba(0,0,0,0.4)",
        "card-hover": "0 4px 24px 0 rgba(0,0,0,0.5), 0 1px 3px 0 rgba(0,0,0,0.3)",
        "glow-sm": "0 0 0 1px rgba(99,102,241,0.3), 0 0 20px rgba(99,102,241,0.08)",
      },
    },
  },
  plugins: [],
};

export default config;
