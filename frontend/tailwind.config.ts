import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        bg:          "#08070e",
        surface:     "#0f0d1a",
        "surface-2": "#171525",
        border:      "#221f38",
        "border-b":  "#2e2952",
        muted:       "#4e4c6a",
        text1:       "#eeedf2",
        text2:       "#9896b0",
        accent:      "#9d8fff",
        "accent-h":  "#b8adff",
        pink:        "#e879f9",
        success:     "#34d399",
        warn:        "#fbbf24",
        danger:      "#f87171",
      },
      fontFamily: {
        sans: ["var(--font-inter)", "system-ui", "sans-serif"],
        mono: ["var(--font-jetbrains)", "monospace"],
      },
      backgroundImage: {
        "hero-glow":
          "radial-gradient(ellipse 90% 55% at 50% 0%, rgba(157,143,255,0.22) 0%, rgba(232,121,249,0.06) 45%, transparent 70%)",
        "grid-faint":
          "linear-gradient(rgba(157,143,255,0.04) 1px,transparent 1px),linear-gradient(90deg,rgba(157,143,255,0.04) 1px,transparent 1px)",
        "card-shine":
          "linear-gradient(135deg, rgba(255,255,255,0.04) 0%, transparent 60%)",
        "gradient-accent":
          "linear-gradient(135deg, #9d8fff 0%, #c084fc 50%, #e879f9 100%)",
      },
      keyframes: {
        spin:      { to: { transform: "rotate(360deg)" } },
        pulse:     { "0%,100%": { opacity: "1" }, "50%": { opacity: "0.4" } },
        marquee:   { "0%": { transform: "translateX(0%)" }, "100%": { transform: "translateX(-50%)" } },
        "fade-in": { from: { opacity: "0", transform: "translateY(12px)" }, to: { opacity: "1", transform: "translateY(0)" } },
        flicker:   { "0%,100%": { opacity: "1" }, "50%": { opacity: "0.6" } },
        "border-spin": { to: { "--angle": "360deg" } },
      },
      animation: {
        spin:      "spin 0.75s linear infinite",
        pulse:     "pulse 1.4s ease-in-out infinite",
        marquee:   "marquee 28s linear infinite",
        "fade-in": "fade-in 0.55s ease-out both",
        flicker:   "flicker 3s ease-in-out infinite",
      },
    },
  },
  plugins: [],
};

export default config;
