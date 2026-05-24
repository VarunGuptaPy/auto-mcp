"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useEffect, useRef } from "react";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import { useAuth } from "@/lib/auth-context";

/* ─── Cursor glow ───────────────────────────────────────────── */

function CursorGlow() {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    let raf = 0;
    let tx = -9999, ty = -9999;
    let cx = -9999, cy = -9999;

    const onMove = (e: MouseEvent) => { tx = e.clientX; ty = e.clientY; };
    window.addEventListener("mousemove", onMove, { passive: true });

    const tick = () => {
      cx += (tx - cx) * 0.12;
      cy += (ty - cy) * 0.12;
      el.style.transform = `translate(${cx.toFixed(1)}px, ${cy.toFixed(1)}px)`;
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);

    return () => {
      window.removeEventListener("mousemove", onMove);
      cancelAnimationFrame(raf);
    };
  }, []);

  return (
    <div
      ref={ref}
      aria-hidden
      className="pointer-events-none fixed top-0 left-0 z-[9999] will-change-transform"
      style={{
        width: 320,
        height: 320,
        marginLeft: -160,
        marginTop: -160,
        borderRadius: "50%",
        background:
          "radial-gradient(circle, rgba(56,189,248,0.22) 0%, rgba(56,189,248,0.10) 30%, rgba(99,102,241,0.06) 55%, transparent 72%)",
        filter: "blur(32px)",
      }}
    />
  );
}

/* ─── Scroll reveal ─────────────────────────────────────────── */

function useScrollReveal() {
  useEffect(() => {
    const els = document.querySelectorAll("[data-reveal]");
    const io = new IntersectionObserver(
      (entries) =>
        entries.forEach((e) => {
          if (e.isIntersecting) {
            e.target.classList.add("is-visible");
            io.unobserve(e.target);
          }
        }),
      { threshold: 0.1 }
    );
    els.forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, []);
}

/* ═══════════════════════════════════════════════════════════ */

export default function LandingPage() {
  useScrollReveal();

  return (
    <div className="flex flex-col min-h-screen">
      <CursorGlow />
      <Navbar />
      <main className="flex-1">
        <Hero />
        <DemoVideo />
        <CompatStrip />
        <HowItWorks />
        <CodePreview />
        <BentoFeatures />
        <Pricing />
        <CtaBanner />
      </main>
      <Footer />
    </div>
  );
}

/* ─── Hero ─────────────────────────────────────────────────── */

function Hero() {
  const { user } = useAuth();
  const router = useRouter();
  const [url, setUrl] = useState("");

  function go(e: React.FormEvent) {
    e.preventDefault();
    if (!url.trim()) return;
    const dest = user ? "/create" : "/auth?next=/create";
    router.push(`${dest}&url=${encodeURIComponent(url.trim())}`);
  }

  return (
    <section className="hero-bg relative overflow-x-hidden">
      <div aria-hidden className="absolute inset-0 dot-grid pointer-events-none" />

      {/* ── Two-column first fold ── */}
      <div className="relative z-10 min-h-[92vh] flex items-center">
        <div className="w-full max-w-7xl mx-auto px-6 sm:px-8 py-20 grid grid-cols-1 lg:grid-cols-2 gap-10 lg:gap-16 items-center">

          {/* Left column — center on mobile, left-aligned on desktop */}
          <div className="flex flex-col items-center lg:items-start text-center lg:text-left">
            <h1
              className="animate-fade-in-d1 font-black tracking-tight leading-[1.06] mb-5 text-text1"
              style={{ fontSize: "clamp(2rem, 3.6vw, 3.25rem)" }}
            >
              Turn any website into{" "}
              <span className="text-gradient-accent">an MCP server.</span>
            </h1>

            <p className="animate-fade-in-d2 text-base text-text2 leading-relaxed mb-8 max-w-md">
              Paste a URL. Gichku&apos;s browser agent maps every route, captures
              every endpoint, and ships a typed Python MCP server—without you
              writing a single line of code.
            </p>

            <form onSubmit={go} className="animate-fade-in-d2 flex flex-col sm:flex-row gap-3 mb-4 w-full max-w-sm mx-auto lg:mx-0">
              <input
                type="url"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="https://your-app.com"
                className="flex-1 bg-surface border border-border rounded-xl px-4 py-3 text-sm text-text1 placeholder-muted outline-none focus:border-accent/60 transition-colors shadow-sm"
              />
              <button
                type="submit"
                className="btn-primary px-5 py-3 rounded-xl text-sm font-semibold whitespace-nowrap"
              >
                Generate →
              </button>
            </form>

            <p className="animate-fade-in-d3 text-xs text-muted">
              Free to start · No credit card · 5 servers/month on free tier
            </p>
          </div>

          {/* Right column — shown below text on mobile, beside it on desktop */}
          <div className="animate-fade-in-d1 w-full lg:block">
            <HeroMockup />
          </div>
        </div>
      </div>
    </section>
  );
}

/* ─── Demo video ────────────────────────────────────────────── */

function DemoVideo() {
  const videoWrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = videoWrapRef.current;
    if (!el) return;
    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          el.classList.add("video-pop");
          io.disconnect();
        }
      },
      { threshold: 0.15 }
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  return (
    <section className="py-16 px-4 sm:px-8 lg:px-16">
      <div className="text-center mb-10">
        <p className="section-label">Live demo</p>
        <h2 className="mt-3 text-3xl sm:text-4xl font-extrabold text-text1 tracking-tight">
          Watch the agent work
        </h2>
        <p className="mt-2 text-sm text-text2 max-w-xs mx-auto">
          From URL to typed MCP server in under five minutes.
        </p>
      </div>

      <div
        ref={videoWrapRef}
        className="relative overflow-hidden border border-border mx-auto"
        style={{ borderRadius: "20px", maxWidth: "960px", transform: "scale(0.55)", transformOrigin: "top center" }}
      >
        <div className="flex items-center gap-2 px-4 py-3 border-b border-border bg-surface-2 shrink-0">
          <div className="flex gap-1.5">
            <div className="w-3 h-3 rounded-full bg-danger/50" />
            <div className="w-3 h-3 rounded-full bg-warn/50" />
            <div className="w-3 h-3 rounded-full bg-success/50" />
          </div>
          <div className="flex-1 flex justify-center">
            <div className="flex items-center gap-2 bg-bg border border-border rounded-md px-3 py-1 text-xs text-muted font-mono w-60">
              <LockIcon />
              gichku.com · live demo
            </div>
          </div>
        </div>
        <div className="relative w-full bg-bg" style={{ paddingBottom: "56.25%" }}>
          <iframe
            className="absolute inset-0 w-full h-full"
            src="https://www.youtube.com/embed/dQw4w9WgXcQ?rel=0&modestbranding=1&color=white"
            title="Gichku live demo"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            allowFullScreen
          />
        </div>
      </div>
    </section>
  );
}

/* ─── Hero right-column mockup ──────────────────────────────── */

function HeroMockup() {
  // Natural size of the mockup before scaling
  const NATURAL_H = 380;
  const SCALE = 0.72;

  return (
    // Outer wrapper collapses layout footprint to the visual (scaled) size
    <div className="relative w-full" style={{ height: `${NATURAL_H * SCALE}px` }}>
      {/* Inner: rendered at full natural size, then scaled down from top-left */}
      <div
        className="absolute top-0 left-0 bg-surface border border-border rounded-2xl overflow-hidden shadow-2xl"
        style={{
          width: `${100 / SCALE}%`,
          transform: `scale(${SCALE})`,
          transformOrigin: "top left",
        }}
      >
        {/* Browser title bar */}
        <div className="flex items-center gap-2 px-3 py-2.5 border-b border-border bg-surface-2">
          <div className="flex gap-1.5">
            <div className="w-2.5 h-2.5 rounded-full bg-danger/50" />
            <div className="w-2.5 h-2.5 rounded-full bg-warn/50" />
            <div className="w-2.5 h-2.5 rounded-full bg-success/50" />
          </div>
          <div className="flex-1 flex justify-center">
            <div className="flex items-center gap-1.5 bg-bg border border-border rounded-md px-2.5 py-0.5 text-[11px] text-muted font-mono w-52">
              <LockIcon />
              gichku.com/jobs/f7a2c1
            </div>
          </div>
        </div>

        {/* Three-column app UI */}
        <div className="grid grid-cols-[160px_1fr_200px] text-xs" style={{ height: `${NATURAL_H}px` }}>

          {/* Timeline */}
          <div className="border-r border-border p-4 space-y-3">
            <p className="text-[9px] uppercase tracking-wider text-muted mb-3">Progress</p>
            {[
              { label: "Code analysis", done: true },
              { label: "Exploring",     done: true },
              { label: "Analyzing",     active: true },
              { label: "Generating",    done: false },
              { label: "Done",          done: false },
            ].map((s) => (
              <div key={s.label} className="flex items-center gap-2.5">
                <div className={`w-4 h-4 rounded-full flex items-center justify-center text-[8px] shrink-0 ${
                  s.done
                    ? "bg-success/20 border border-success/40 text-success"
                    : (s as { active?: boolean }).active
                    ? "bg-accent/20 border border-accent/40 text-accent animate-pulse"
                    : "bg-surface-2 border border-border text-muted"
                }`}>
                  {s.done ? "✓" : (s as { active?: boolean }).active ? "●" : "○"}
                </div>
                <span className={s.done ? "text-text2" : (s as { active?: boolean }).active ? "text-text1 font-medium" : "text-muted"}>
                  {s.label}
                </span>
              </div>
            ))}
            <div className="pt-3 border-t border-border">
              <p className="text-2xl font-mono font-bold text-text1">1:42</p>
              <p className="text-muted text-[9px]">elapsed</p>
            </div>
          </div>

          {/* Screenshot + reasoning */}
          <div className="border-r border-border p-3 flex flex-col gap-2.5">
            <div className="flex-1 bg-bg rounded-lg overflow-hidden relative border border-border">
              <div className="absolute inset-0 flex flex-col">
                <div className="h-6 bg-surface-2 border-b border-border flex items-center px-2 gap-1.5">
                  <div className="w-14 h-1.5 bg-border rounded" />
                  <div className="w-20 h-1.5 bg-border rounded" />
                </div>
                <div className="flex-1 p-2.5 space-y-2">
                  {[68, 42, 88, 54, 76].map((w, i) => (
                    <div key={i} className="h-1.5 rounded bg-surface-2" style={{ width: `${w}%` }} />
                  ))}
                </div>
              </div>
              <div className="absolute top-1.5 right-1.5 text-[9px] font-mono bg-surface border border-border rounded px-1.5 py-0.5 text-text2">
                step 18/24
              </div>
            </div>

            <div className="bg-surface-2 border border-border rounded-lg p-2.5">
              <p className="text-[9px] uppercase tracking-wider text-muted mb-1">Agent reasoning</p>
              <p className="text-[10px] text-text2 leading-relaxed line-clamp-2">
                Clicking &quot;View item&quot; → /items/42 → capturing GET&nbsp;/api/items/42 with auth header
              </p>
            </div>

            <div className="bg-surface-2 border border-border rounded-lg px-2.5 py-1.5 flex items-center justify-between">
              <span className="text-[9px] uppercase tracking-wider text-muted">Endpoints captured</span>
              <span className="text-accent font-mono font-bold">12</span>
            </div>
          </div>

          {/* Chat */}
          <div className="p-3 flex flex-col gap-2">
            <p className="text-[9px] uppercase tracking-wider text-muted mb-1">Agent chat</p>
            <AgentBubble text="Found a login wall at /dashboard. Should I authenticate?" />
            <UserBubble text="Yes — test@example.com / pass123" />
            <AgentBubble text="Done. Continuing exploration…" />
          </div>
        </div>
      </div>
    </div>
  );
}

function AgentBubble({ text }: { text: string }) {
  return (
    <div className="flex gap-1.5 items-start">
      <div className="w-4 h-4 rounded-full bg-accent/20 border border-accent/30 flex items-center justify-center text-[7px] text-accent shrink-0 mt-0.5">A</div>
      <div className="bg-surface border border-border rounded-xl rounded-tl-sm px-2 py-1.5 text-[10px] text-text2 leading-relaxed">
        {text}
      </div>
    </div>
  );
}

function UserBubble({ text }: { text: string }) {
  return (
    <div className="flex justify-end">
      <div className="bg-accent/15 border border-accent/20 rounded-xl rounded-tr-sm px-2 py-1.5 text-[10px] text-accent leading-relaxed max-w-[85%]">
        {text}
      </div>
    </div>
  );
}

/* ─── Compat strip ──────────────────────────────────────────── */

// Simple Icons CDN: black SVG → dark:invert makes it white on dark bg
const SI = (slug: string) => `https://cdn.simpleicons.org/${slug}/000000`;

const COMPAT_TOOLS = [
  { name: "Claude Desktop", img: SI("anthropic") },
  { name: "Cursor",         img: SI("cursor") },
  { name: "VS Code",        img: SI("visualstudiocode") },
  { name: "GPT-4o",         img: SI("openai") },
  { name: "Zed",            img: SI("zedindustries") },
  { name: "Continue.dev",   svg: <ContinueIcon /> },
  { name: "Windsurf",       svg: <WindsurfIcon /> },
  { name: "Cline",          svg: <ClineIcon /> },
];

// Duplicate list for seamless infinite scroll
const MARQUEE_ITEMS = [...COMPAT_TOOLS, ...COMPAT_TOOLS];

function CompatStrip() {
  return (
    <div className="relative border-y border-border py-8 overflow-hidden">
      <div className="absolute inset-y-0 left-0 w-32 z-10 pointer-events-none marquee-fade-l" />
      <div className="absolute inset-y-0 right-0 w-32 z-10 pointer-events-none marquee-fade-r" />

      <p className="text-center text-xs uppercase tracking-[0.2em] text-muted mb-7">
        Works with every MCP-compatible client
      </p>

      <div className="flex animate-marquee whitespace-nowrap items-center">
        {MARQUEE_ITEMS.map((t, i) => (
          <span key={i} className="inline-flex items-center gap-3 mx-10 text-base text-text2 font-medium shrink-0">
            {t.img ? (
              <img
                src={t.img}
                alt={t.name}
                width={24}
                height={24}
                className="w-6 h-6 opacity-70 dark:invert dark:opacity-60 shrink-0"
              />
            ) : (
              <span className="w-6 h-6 shrink-0 flex items-center justify-center text-text2 opacity-70">
                {t.svg}
              </span>
            )}
            {t.name}
          </span>
        ))}
      </div>
    </div>
  );
}

/* Inline SVGs for tools not yet on Simple Icons */

function ContinueIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className="w-full h-full">
      <path d="M12 2C6.477 2 2 6.477 2 12s4.477 10 10 10 10-4.477 10-10S17.523 2 12 2zm-1.5 14.5V7.5l7 4.5-7 4.5z" />
    </svg>
  );
}

function WindsurfIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className="w-full h-full">
      <path d="M3 8.5c2.5-1.5 5-1.5 7.5 0S15 10 17.5 8.5 20 7 22 7v2c-2 0-3 .5-5 1.5S13.5 12 11 10.5 6 9 3 10.5V8.5zM3 13c2.5-1.5 5-1.5 7.5 0S15 14.5 17.5 13 20 11.5 22 11.5v2c-2 0-3 .5-5 1.5S13.5 16.5 11 15 6 13.5 3 15V13z"/>
    </svg>
  );
}

function ClineIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="w-full h-full">
      <polyline points="4 17 10 11 4 5" />
      <line x1="12" y1="19" x2="20" y2="19" />
    </svg>
  );
}

/* ─── How it works (sticky scroll) ─────────────────────────── */

const HOW_STEPS = [
  {
    n: "01",
    icon: <StepLinkIcon />,
    title: "Paste any URL",
    body: "SaaS app, internal tool, public website. If a browser can load it, Gichku can map it.",
    tag: "< 10 seconds",
  },
  {
    n: "02",
    icon: <StepBotIcon />,
    title: "The agent explores",
    body: "A Playwright browser visits every page, clicks every button, and captures every network request. It asks you for credentials if it hits a login wall.",
    tag: "2–10 minutes",
  },
  {
    n: "03",
    icon: <StepDownIcon />,
    title: "Download and ship",
    body: "You get a zip with server.py, typed tool definitions, and a claude_desktop_config.json snippet. Drop it in and your AI agent is live.",
    tag: "Instant",
  },
] as const;

function HowItWorks() {
  const [active, setActive] = useState(0);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const onScroll = () => {
      const { top, height } = el.getBoundingClientRect();
      const vh = window.innerHeight;
      const scrolled = Math.max(0, -top);
      const max = height - vh;
      const progress = max > 0 ? Math.min(1, scrolled / max) : 0;
      setActive(Math.min(2, Math.floor(progress * 3)));
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    onScroll();
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const step = HOW_STEPS[active];

  return (
    <section id="how-it-works" className="section-grid relative">
      {/* Static header */}
      <div className="text-center pt-24 pb-12 px-4">
        <p className="section-label mb-3">How it works</p>
        <h2 className="text-4xl sm:text-5xl font-extrabold text-text1 leading-tight mb-4">
          Three steps.<br />
          <span className="text-gradient-accent">One MCP server.</span>
        </h2>
        <p className="text-text2 max-w-xl mx-auto">
          No config files. No API docs to read. Just a URL.
        </p>
      </div>

      {/* Sticky scroll driver — 3× tall so each step gets one viewport of scroll */}
      <div ref={wrapRef} style={{ height: "300vh" }}>
        <div className="sticky top-16 h-[calc(100vh-4rem)] flex items-center px-4 sm:px-6">
          {/* Outer slide frame */}
          <div className="max-w-6xl mx-auto w-full rounded-2xl border border-border bg-surface shadow-sm overflow-hidden grid grid-cols-1 lg:grid-cols-2" style={{ minHeight: "min(520px, calc(100vh - 10rem))" }}>

            {/* ── Left: step info ── */}
            <div className="relative p-10 lg:p-12 flex flex-col justify-between border-b lg:border-b-0 lg:border-r border-border">
              {/* Step dots + counter */}
              <div className="flex items-center justify-between mb-8">
                <div className="flex gap-2">
                  {HOW_STEPS.map((_, i) => (
                    <div
                      key={i}
                      className={`h-1 rounded-full transition-all duration-500 ${
                        i === active
                          ? "w-8 bg-accent"
                          : i < active
                          ? "w-4 bg-accent/40"
                          : "w-4 bg-border"
                      }`}
                    />
                  ))}
                </div>
                <span className="text-xs text-muted font-mono">{active + 1} / {HOW_STEPS.length}</span>
              </div>

              {/* Step content — animates on change */}
              <div key={active} className="animate-fade-in flex-1">
                <span className="font-mono font-black text-[4.5rem] leading-none text-border select-none block mb-4">
                  {step.n}
                </span>
                <div className="w-10 h-10 rounded-xl flex items-center justify-center text-accent bg-accent/10 border border-accent/20 mb-5">
                  {step.icon}
                </div>
                <h3 className="text-2xl sm:text-3xl font-extrabold text-text1 mb-3 tracking-tight">
                  {step.title}
                </h3>
                <p className="text-text2 leading-relaxed mb-6 max-w-sm">
                  {step.body}
                </p>
              </div>

              {/* Bottom: time tag + scroll hint */}
              <div className="flex items-center justify-between pt-6 border-t border-border mt-6">
                <span className="inline-flex items-center text-sm font-semibold text-accent bg-accent/10 border border-accent/20 rounded-full px-4 py-1.5">
                  {step.tag}
                </span>
                <span className="text-xs text-muted">scroll to advance →</span>
              </div>
            </div>

            {/* ── Right: animation panel ── */}
            <div key={`anim-${active}`} className="animate-fade-in hidden lg:flex items-center justify-center p-10 bg-surface-2">
              {active === 0 && <StepAnim1 />}
              {active === 1 && <StepAnim2 />}
              {active === 2 && <StepAnim3 />}
            </div>

          </div>
        </div>
      </div>
    </section>
  );
}

/* ── Step animations ── */

function StepAnim1() {
  const [chars, setChars] = useState(0);
  const url = "https://my-app.com";
  useEffect(() => {
    setChars(0);
    const t = setInterval(() => setChars((c) => (c < url.length ? c + 1 : c)), 65);
    return () => clearInterval(t);
  }, []);
  const done = chars === url.length;

  return (
    <div className="card p-8 max-w-sm mx-auto space-y-5">
      <p className="text-xs font-semibold uppercase tracking-widest text-muted mb-2">Enter any URL</p>
      {/* URL bar */}
      <div className="flex items-center gap-2 bg-bg border border-border rounded-xl px-4 py-3 font-mono text-sm">
        <svg className="w-3.5 h-3.5 text-muted shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"/></svg>
        <span className="text-text1">{url.slice(0, chars)}</span>
        <span className={`w-0.5 h-4 bg-accent ml-0.5 ${done ? "animate-pulse" : ""}`} />
      </div>
      {/* Button */}
      <div
        className={`w-full btn-primary py-3 rounded-xl text-sm font-semibold text-center transition-all duration-700 ${done ? "opacity-100 scale-100" : "opacity-0 scale-95"}`}
      >
        Generate MCP →
      </div>
      {/* Trust line */}
      <p className={`text-center text-xs text-muted transition-opacity duration-500 ${done ? "opacity-100" : "opacity-0"}`}>
        Free to start · No credit card
      </p>
    </div>
  );
}

function StepAnim2() {
  const logs = [
    { icon: "✓", color: "text-success", text: "GET /repos  captured", delay: 200 },
    { icon: "✓", color: "text-success", text: "POST /issues  captured", delay: 700 },
    { icon: "✓", color: "text-success", text: "GET /pulls  captured", delay: 1200 },
    { icon: "⟳", color: "text-accent animate-spin", text: "Exploring /settings…", delay: 1700 },
    { icon: "✓", color: "text-success", text: "PATCH /user  captured", delay: 2400 },
  ];
  const [visible, setVisible] = useState<number[]>([]);
  useEffect(() => {
    setVisible([]);
    logs.forEach((l, i) => {
      const t = setTimeout(() => setVisible((v) => [...v, i]), l.delay);
      return () => clearTimeout(t);
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="card overflow-hidden max-w-sm mx-auto">
      {/* Browser bar */}
      <div className="flex items-center gap-2 px-4 py-2.5 border-b border-border bg-surface-2">
        <div className="flex gap-1.5">
          <div className="w-2.5 h-2.5 rounded-full bg-danger/60" />
          <div className="w-2.5 h-2.5 rounded-full bg-warn/60" />
          <div className="w-2.5 h-2.5 rounded-full bg-success/60" />
        </div>
        <div className="flex-1 flex justify-center">
          <div className="bg-bg border border-border rounded-md px-3 py-0.5 text-[11px] font-mono text-muted">
            my-app.com/api/…
          </div>
        </div>
      </div>

      {/* Log lines */}
      <div className="px-5 py-4 space-y-2.5 font-mono text-[11px] min-h-[200px]">
        {logs.map((l, i) => (
          <div
            key={i}
            className={`flex items-center gap-2 transition-all duration-300 ${
              visible.includes(i) ? "opacity-100 translate-y-0" : "opacity-0 translate-y-2"
            }`}
          >
            <span className={`shrink-0 w-4 ${l.color}`}>{l.icon}</span>
            <span className="text-text2">{l.text}</span>
          </div>
        ))}
      </div>

      {/* Counter */}
      <div className="border-t border-border px-5 py-3 flex justify-between items-center bg-surface-2">
        <span className="text-xs text-muted">Endpoints captured</span>
        <span className="font-mono font-bold text-accent text-sm">{visible.length * 3}</span>
      </div>
    </div>
  );
}

function StepAnim3() {
  const lines = [
    { color: "text-muted",   text: "# Gichku generated · server.py" },
    { color: "text-accent",  text: "from mcp import FastMCP" },
    { color: "text-text2",   text: "" },
    { color: "text-accent",  text: "@mcp.tool()" },
    { color: "text-text1",   text: "async def list_repos(org: str):" },
    { color: "text-muted",   text: '  """List org repositories."""' },
    { color: "text-text2",   text: "  return await api.get(...)" },
    { color: "text-text2",   text: "" },
    { color: "text-accent",  text: "@mcp.tool()" },
    { color: "text-text1",   text: "async def create_issue(...):" },
    { color: "text-muted",   text: '  """Open a new issue."""' },
    { color: "text-text2",   text: "  return await api.post(...)" },
  ];
  const [visible, setVisible] = useState(0);
  useEffect(() => {
    setVisible(0);
    const t = setInterval(() => setVisible((v) => (v < lines.length ? v + 1 : v)), 120);
    return () => clearInterval(t);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const done = visible >= lines.length;

  return (
    <div className="card overflow-hidden max-w-sm mx-auto">
      {/* Terminal bar */}
      <div className="flex items-center gap-2 px-4 py-2.5 border-b border-border bg-surface-2">
        <div className="flex gap-1.5">
          <div className="w-2.5 h-2.5 rounded-full bg-danger/60" />
          <div className="w-2.5 h-2.5 rounded-full bg-warn/60" />
          <div className="w-2.5 h-2.5 rounded-full bg-success/60" />
        </div>
        <span className="flex-1 text-center text-[11px] font-mono text-muted">server.py</span>
      </div>

      {/* Code */}
      <div className="px-4 py-3 font-mono text-[11px] leading-relaxed bg-bg min-h-[180px]">
        {lines.slice(0, visible).map((l, i) => (
          <div key={i} className={`${l.color}`}>{l.text || " "}</div>
        ))}
      </div>

      {/* Download badge */}
      <div className={`border-t border-border px-4 py-3 bg-surface-2 transition-all duration-500 ${done ? "opacity-100" : "opacity-0"}`}>
        <div className="flex items-center justify-between">
          <div className="space-y-1">
            <div className="flex items-center gap-1.5 text-[10px] text-success">
              <span>✓</span> 14 tools · claude_desktop_config.json
            </div>
          </div>
          <div className="flex items-center gap-1.5 text-[11px] font-semibold text-white bg-success/80 rounded-lg px-3 py-1.5">
            ↓ Download .zip
          </div>
        </div>
      </div>
    </div>
  );
}

/* ─── Code preview ──────────────────────────────────────────── */

function CodePreview() {
  return (
    <section className="py-24 px-4 border-t border-border">
      <div className="max-w-5xl mx-auto grid grid-cols-1 md:grid-cols-2 gap-14 items-center">
        {/* Left: description */}
        <div data-reveal>
          <p className="section-label mb-4">Output</p>
          <h2 className="text-4xl sm:text-5xl font-extrabold text-text1 leading-tight mb-5">
            Production-ready Python{" "}
            <span className="text-gradient-accent">in seconds.</span>
          </h2>
          <p className="text-text2 leading-relaxed mb-8">
            Gichku doesn&apos;t generate boilerplate—it generates a real,
            typed MCP server with docstrings, auth, and a working config snippet.
          </p>
          <ul className="space-y-3">
            {[
              "Full type annotations",
              "Auto-generated docstrings",
              "Auth handled automatically",
              "claude_desktop_config.json included",
            ].map((item) => (
              <li key={item} className="flex items-center gap-3 text-sm text-text2">
                <span className="w-5 h-5 rounded-full bg-success/15 border border-success/30 flex items-center justify-center text-success text-[10px] shrink-0">
                  ✓
                </span>
                {item}
              </li>
            ))}
          </ul>
        </div>

        {/* Right: terminal card */}
        <div data-reveal data-delay="1">
          <div className="card-elevated rounded-2xl overflow-hidden">
            {/* Terminal chrome */}
            <div className="flex items-center gap-2 px-4 py-3 border-b border-border bg-surface-2">
              <div className="flex gap-1.5">
                <div className="w-3 h-3 rounded-full bg-danger/60" />
                <div className="w-3 h-3 rounded-full bg-warn/60" />
                <div className="w-3 h-3 rounded-full bg-success/60" />
              </div>
              <span className="text-xs text-muted font-mono ml-2">server.py</span>
            </div>

            {/* Code block */}
            <div className="p-5 font-mono text-[11.5px] leading-relaxed overflow-x-auto bg-bg">
              <pre className="whitespace-pre">
                <CodeLine>
                  <span className="text-muted"># Gichku generated · server.py</span>
                </CodeLine>
                <CodeLine>
                  <span className="text-accent">from</span>
                  <span className="text-text2"> mcp </span>
                  <span className="text-accent">import</span>
                  <span className="text-text2"> FastMCP</span>
                </CodeLine>
                <CodeLine>{""}</CodeLine>
                <CodeLine>
                  <span className="text-text2">mcp = FastMCP(</span>
                  <span className="text-success">&quot;My API&quot;</span>
                  <span className="text-text2">)</span>
                </CodeLine>
                <CodeLine>{""}</CodeLine>
                <CodeLine>
                  <span className="text-accent">@mcp</span>
                  <span className="text-text2">.tool()</span>
                </CodeLine>
                <CodeLine>
                  <span className="text-accent">async def</span>
                  <span className="text-text2"> list_repos(org: str, page: </span>
                  <span className="text-accent">int</span>
                  <span className="text-text2"> = 1) -&gt; list[dict]:</span>
                </CodeLine>
                <CodeLine>
                  <span className="text-text2">    </span>
                  <span className="text-muted">&quot;&quot;&quot;List repositories for an organization.&quot;&quot;&quot;</span>
                </CodeLine>
                <CodeLine>
                  <span className="text-text2">    </span>
                  <span className="text-accent">return await</span>
                  <span className="text-text2"> api.get(</span>
                  <span className="text-success">f&quot;/orgs/&#123;org&#125;/repos&quot;</span>
                  <span className="text-text2">, page=page)</span>
                </CodeLine>
                <CodeLine>{""}</CodeLine>
                <CodeLine>
                  <span className="text-accent">@mcp</span>
                  <span className="text-text2">.tool()</span>
                </CodeLine>
                <CodeLine>
                  <span className="text-accent">async def</span>
                  <span className="text-text2"> get_issue(owner: str, repo: str, number: </span>
                  <span className="text-accent">int</span>
                  <span className="text-text2">) -&gt; dict:</span>
                </CodeLine>
                <CodeLine>
                  <span className="text-text2">    </span>
                  <span className="text-muted">&quot;&quot;&quot;Get a specific issue by number.&quot;&quot;&quot;</span>
                </CodeLine>
                <CodeLine>
                  <span className="text-text2">    </span>
                  <span className="text-accent">return await</span>
                  <span className="text-text2"> api.get(</span>
                  <span className="text-success">f&quot;/repos/&#123;owner&#125;/&#123;repo&#125;/issues/&#123;number&#125;&quot;</span>
                  <span className="text-text2">)</span>
                </CodeLine>
                <CodeLine>{""}</CodeLine>
                <CodeLine>
                  <span className="text-accent">@mcp</span>
                  <span className="text-text2">.tool()</span>
                </CodeLine>
                <CodeLine>
                  <span className="text-accent">async def</span>
                  <span className="text-text2"> create_issue(owner: str, repo: str,</span>
                </CodeLine>
                <CodeLine>
                  <span className="text-text2">               title: str, body: str = </span>
                  <span className="text-success">&quot;&quot;</span>
                  <span className="text-text2">) -&gt; dict:</span>
                </CodeLine>
                <CodeLine>
                  <span className="text-text2">    </span>
                  <span className="text-muted">&quot;&quot;&quot;Create a new issue in a repository.&quot;&quot;&quot;</span>
                </CodeLine>
                <CodeLine>
                  <span className="text-text2">    </span>
                  <span className="text-accent">return await</span>
                  <span className="text-text2"> api.post(</span>
                  <span className="text-success">f&quot;/repos/&#123;owner&#125;/&#123;repo&#125;/issues&quot;</span>
                  <span className="text-text2">,</span>
                </CodeLine>
                <CodeLine>
                  <span className="text-text2">                          json=&#123;</span>
                  <span className="text-success">&quot;title&quot;</span>
                  <span className="text-text2">: title, </span>
                  <span className="text-success">&quot;body&quot;</span>
                  <span className="text-text2">: body&#125;)</span>
                </CodeLine>
              </pre>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function CodeLine({ children }: { children: React.ReactNode }) {
  return <div className="min-h-[1.5em]">{children}</div>;
}

/* ─── Bento features ────────────────────────────────────────── */

function BentoFeatures() {
  return (
    <section className="section-grid py-16 px-4 border-t border-border relative">
      <div className="max-w-5xl mx-auto">
        <div data-reveal className="text-center mb-14">
          <p className="section-label mb-3">Features</p>
          <h2 className="text-4xl sm:text-5xl font-extrabold text-text1">
            Built for depth,<br />
            <span className="text-gradient-accent">not just breadth.</span>
          </h2>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
          {/* Code-aware analysis — col-span-3 */}
          <div data-reveal data-delay="1" className="card shine p-6 rounded-2xl md:col-span-3">
            <div className="flex items-center gap-3 mb-4">
              <BentoIcon><CodeIcon /></BentoIcon>
              <div>
                <p className="text-sm font-bold text-text1">Code-aware analysis</p>
                <p className="text-xs text-muted">Pro feature</p>
              </div>
            </div>
            <p className="text-sm text-text2 leading-relaxed mb-5">
              Connect a repo and Gichku reads your source code.
              It finds routes the browser never visits, detects required env
              vars, and builds a richer MCP server than any scraper can.
            </p>
            <div className="bg-bg rounded-xl border border-border p-3 font-mono text-[11px] space-y-1">
              <TermRow color="text-muted">$ indexing 73 source files…</TermRow>
              <TermRow color="text-accent">✓ 12 API routes extracted (FastAPI)</TermRow>
              <TermRow color="text-accent">✓ 4 env vars detected (DB_URL, REDIS_…)</TermRow>
              <TermRow color="text-text2">→ merging with browser trace…</TermRow>
              <TermRow color="text-success">✓ 21 features — 9 more than browser alone</TermRow>
            </div>
          </div>

          {/* Privacy-first — col-span-2 */}
          <div data-reveal data-delay="2" className="card shine p-6 rounded-2xl md:col-span-2">
            <BentoIcon><LockIcon /></BentoIcon>
            <h3 className="text-sm font-bold text-text1 mt-4 mb-2">Privacy-first</h3>
            <p className="text-sm text-text2 leading-relaxed">
              Source code is analyzed locally. Nothing leaves your machine.
              API tokens are in-memory only—never written to disk, never logged.
            </p>
            <div className="mt-4 flex flex-col gap-1.5">
              {["Token never persisted", "ChromaDB runs locally", "No third-party data sharing"].map((t) => (
                <div key={t} className="flex items-center gap-2 text-xs text-text2">
                  <span className="w-4 h-4 rounded-full bg-success/15 border border-success/30 flex items-center justify-center text-success text-[9px] shrink-0">
                    ✓
                  </span>
                  {t}
                </div>
              ))}
            </div>
          </div>

          {/* Claude-ready output — col-span-2 */}
          <div data-reveal data-delay="1" className="card shine p-6 rounded-2xl md:col-span-2">
            <BentoIcon><ZapIcon /></BentoIcon>
            <h3 className="text-sm font-bold text-text1 mt-4 mb-2">Claude-ready output</h3>
            <p className="text-sm text-text2 leading-relaxed">
              Typed tool definitions, docstrings, and a ready-to-paste
              <code className="text-accent mx-1 text-[11px]">claude_desktop_config.json</code>
              block. Two config lines and you&apos;re live.
            </p>
          </div>

          {/* Interactive agent — col-span-2 */}
          <div data-reveal data-delay="2" className="card shine p-6 rounded-2xl md:col-span-2">
            <BentoIcon><ChatIcon /></BentoIcon>
            <h3 className="text-sm font-bold text-text1 mt-4 mb-2">Interactive agent</h3>
            <p className="text-sm text-text2 leading-relaxed">
              Hit a login wall? The agent pauses and asks. Want it to explore
              a page it missed? Tell it in the chat panel.
              You stay in control throughout.
            </p>
          </div>

          {/* Any site — col-span-1 */}
          <div
            data-reveal
            data-delay="3"
            className="card shine p-6 rounded-2xl md:col-span-1 flex flex-col justify-between"
          >
            <div>
              <BentoIcon><GlobeIcon /></BentoIcon>
              <h3 className="text-sm font-bold text-text1 mt-4 mb-2">Any site</h3>
              <p className="text-xs text-text2 leading-relaxed">
                SaaS, dashboards, REST, GraphQL, SPAs—if a browser loads it, Gichku maps it.
              </p>
            </div>
            <div className="mt-5 text-3xl font-black text-gradient-accent">∞</div>
          </div>
        </div>
      </div>
    </section>
  );
}

/* ─── Pricing ───────────────────────────────────────────────── */

function Pricing() {
  return (
    <section id="pricing" className="py-24 px-4 border-t border-border">
      <div className="max-w-4xl mx-auto">
        <div data-reveal className="text-center mb-14">
          <p className="section-label mb-3">Pricing</p>
          <h2 className="text-4xl sm:text-5xl font-extrabold text-text1 mb-3">
            Start free.<br />
            <span className="text-gradient-accent">Scale when you need to.</span>
          </h2>
          <p className="text-text2 max-w-sm mx-auto">
            No contracts. No hidden fees. Cancel anytime.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          {/* Free */}
          <div data-reveal data-delay="1" className="card p-7 rounded-2xl">
            <p className="text-xs font-semibold uppercase tracking-widest text-muted mb-5">Free</p>
            <div className="flex items-end gap-1.5 mb-1">
              <span className="text-5xl font-black text-text1">$0</span>
            </div>
            <p className="text-sm text-text2 mb-8">Everything you need to try Gichku.</p>
            <ul className="space-y-3 mb-8">
              {[
                ["5 MCP servers / month", true],
                ["Up to 50 steps per job", true],
                ["Browser exploration", true],
                ["Download as .zip", true],
                ["Priority queue", false],
              ].map(([label, ok]) => (
                <li key={String(label)} className="flex items-center gap-3 text-sm">
                  <span
                    className={`w-4 h-4 rounded-full flex items-center justify-center text-[10px] shrink-0 ${
                      ok
                        ? "bg-success/15 border border-success/30 text-success"
                        : "bg-surface-2 border border-border text-muted"
                    }`}
                  >
                    {ok ? "✓" : "–"}
                  </span>
                  <span className={ok ? "text-text2" : "text-muted line-through"}>
                    {String(label)}
                  </span>
                </li>
              ))}
            </ul>
            <Link
              href="/auth"
              className="block w-full text-center py-2.5 rounded-xl text-sm font-semibold bg-surface-2 hover:bg-border border border-border text-text1 transition-colors"
            >
              Get started free
            </Link>
          </div>

          {/* Pro */}
          <div
            data-reveal
            data-delay="2"
            className="card-elevated relative p-7 rounded-2xl border border-accent/30"
          >
            <div className="absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-1 rounded-full text-[11px] font-bold text-bg whitespace-nowrap bg-accent">
              Most popular
            </div>

            <p className="text-xs font-semibold uppercase tracking-widest text-accent mb-5">Pro</p>
            <div className="flex items-end gap-1.5 mb-1">
              <span className="text-5xl font-black text-text1">$4.99</span>
              <span className="text-text2 text-sm mb-2">/month</span>
            </div>
            <p className="text-sm text-text2 mb-8">For developers who ship.</p>
            <ul className="space-y-3 mb-8">
              {[
                "Unlimited MCP servers",
                "Unlimited steps",
                "Browser exploration",
                "Download as .zip",
                "Priority queue",
                "Email support",
              ].map((label) => (
                <li key={label} className="flex items-center gap-3 text-sm">
                  <span className="w-4 h-4 rounded-full flex items-center justify-center text-[10px] bg-success/15 border border-success/30 text-success shrink-0">
                    ✓
                  </span>
                  <span className="text-text2">{label}</span>
                </li>
              ))}
            </ul>
            <Link
              href="/pricing"
              className="btn-primary block w-full text-center py-2.5 rounded-xl text-sm"
            >
              Upgrade to Pro →
            </Link>
          </div>
        </div>

        <p className="text-center text-xs text-muted mt-8">
          14-day money-back guarantee · Questions?{" "}
          <a href="mailto:hello@gichku.com" className="text-accent hover:text-accent-h">
            hello@gichku.com
          </a>
        </p>
      </div>
    </section>
  );
}

/* ─── CTA banner ────────────────────────────────────────────── */

function CtaBanner() {
  return (
    <section className="px-4 sm:px-6 py-16">
      <div className="max-w-6xl mx-auto" data-reveal>
        <div className="relative rounded-2xl overflow-hidden border border-accent/25 cta-grid">
          <div className="grid grid-cols-1 lg:grid-cols-[1fr_auto] items-center">

            {/* Left: text content */}
            <div className="px-10 sm:px-14 py-14 sm:py-16 max-w-xl">
              <h2 className="text-4xl sm:text-[2.75rem] font-black text-text1 leading-[1.08] mb-5 tracking-tight">
                Your first MCP server<br />is three minutes away.
              </h2>
              <p className="text-text2 text-lg leading-relaxed mb-9">
                No config. No API docs. Paste a URL, let the agent explore,
                and download a production-ready Python server.
              </p>
              <div className="flex flex-wrap gap-3">
                <Link
                  href="/auth"
                  className="inline-flex items-center px-7 py-3.5 rounded-xl text-[15px] font-semibold bg-accent text-white hover:bg-accent-h transition-colors"
                >
                  Get started free →
                </Link>
              </div>
            </div>

            {/* Right: floating product mockup */}
            <div className="hidden lg:flex items-end justify-end self-stretch overflow-hidden relative min-w-[400px]">
              {/* Shadow backdrop */}
              <div
                aria-hidden
                className="absolute inset-0 pointer-events-none"
                style={{
                  background:
                    "radial-gradient(ellipse 80% 80% at 100% 100%, rgb(var(--accent-rgb) / 0.10) 0%, transparent 65%)",
                }}
              />

              {/* Floating card — slightly tilted, partially cropped at edges */}
              <div
                className="relative mr-8 mb-8 w-[340px] rounded-xl overflow-hidden shadow-2xl border border-border bg-surface"
                style={{ transform: "rotate(2deg) translateY(12px)" }}
              >
                {/* Terminal title bar */}
                <div className="flex items-center gap-2 px-4 py-2.5 border-b border-border bg-surface-2">
                  <div className="flex gap-1.5">
                    <div className="w-2.5 h-2.5 rounded-full bg-danger/60" />
                    <div className="w-2.5 h-2.5 rounded-full bg-warn/60" />
                    <div className="w-2.5 h-2.5 rounded-full bg-success/60" />
                  </div>
                  <span className="flex-1 text-center text-[11px] text-muted font-mono">
                    server.py — Generated
                  </span>
                </div>

                {/* Code content */}
                <div className="p-4 font-mono text-[11px] leading-[1.65] bg-bg space-y-0.5">
                  <div className="text-muted"># Gichku generated · server.py</div>
                  <div className="text-muted">from mcp import FastMCP</div>
                  <div className="h-2" />
                  <div className="text-accent">mcp = FastMCP(&quot;My API&quot;)</div>
                  <div className="h-2" />
                  <div><span className="text-accent">@mcp.tool()</span></div>
                  <div><span className="text-accent">async def</span> <span className="text-text1">list_repos</span><span className="text-text2">(org: str) -&gt; list:</span></div>
                  <div className="text-muted pl-4">&quot;&quot;&quot;List repos for an org.&quot;&quot;&quot;</div>
                  <div className="text-text2 pl-4">return await api.get(f&quot;/orgs/&quot;)</div>
                  <div className="h-2" />
                  <div><span className="text-accent">@mcp.tool()</span></div>
                  <div><span className="text-accent">async def</span> <span className="text-text1">get_issue</span><span className="text-text2">(repo, n: int):</span></div>
                  <div className="text-muted pl-4">&quot;&quot;&quot;Get issue by number.&quot;&quot;&quot;</div>
                  <div className="text-text2 pl-4">return await api.get(f&quot;/issues/&quot;)</div>
                  <div className="h-2" />
                  <div className="text-muted">...</div>
                </div>

                {/* Footer bar */}
                <div className="flex items-center justify-between px-4 py-2.5 border-t border-border bg-surface-2">
                  <div className="flex items-center gap-1.5 text-[10px] text-success">
                    <span className="w-3.5 h-3.5 rounded-full bg-success/15 border border-success/30 flex items-center justify-center text-[8px]">✓</span>
                    14 tools generated
                  </div>
                  <div className="flex items-center gap-1.5 text-[10px] text-success">
                    <span className="w-3.5 h-3.5 rounded-full bg-success/15 border border-success/30 flex items-center justify-center text-[8px]">✓</span>
                    claude_desktop_config.json
                  </div>
                </div>
              </div>
            </div>

          </div>
        </div>
      </div>
    </section>
  );
}

/* ─── Shared helpers ────────────────────────────────────────── */

function BentoIcon({ children }: { children: React.ReactNode }) {
  return (
    <div className="inline-flex w-9 h-9 rounded-xl items-center justify-center text-accent bg-accent/10 border border-accent/20">
      {children}
    </div>
  );
}

function TermRow({ children, color }: { children: React.ReactNode; color: string }) {
  return (
    <div className={`flex gap-2 ${color}`}>
      <span className="opacity-0 select-none">$</span>
      <span>{children}</span>
    </div>
  );
}

/* ─── Icons ─────────────────────────────────────────────────── */

function StepLinkIcon() {
  return (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
    </svg>
  );
}

function StepBotIcon() {
  return (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M9.75 3.104v5.714a2.25 2.25 0 01-.659 1.591L5 14.5M9.75 3.104c-.251.023-.501.05-.75.082m.75-.082a24.301 24.301 0 014.5 0m0 0v5.714c0 .597.237 1.17.659 1.591L19.8 15m-6.3-11.896c.251.023.501.05.75.082M19.8 15l-1.57.393A9.065 9.065 0 0112 15a9.065 9.065 0 00-6.23-.607L5 14.5m14.8.5l-1.249 3.124M5 14.5L3.751 17.624m0 0A3 3 0 006.75 21h10.5a3 3 0 002.999-3.376l-.249-3" />
    </svg>
  );
}

function StepDownIcon() {
  return (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" />
    </svg>
  );
}

function CodeIcon() {
  return (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" />
    </svg>
  );
}

function LockIcon() {
  return (
    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z" />
    </svg>
  );
}

function ZapIcon() {
  return (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 13.5l10.5-11.25L12 10.5h8.25L9.75 21.75 12 13.5H3.75z" />
    </svg>
  );
}

function ChatIcon() {
  return (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M20.25 8.511c.884.284 1.5 1.128 1.5 2.097v4.286c0 1.136-.847 2.1-1.98 2.193-.34.027-.68.052-1.02.072v3.091l-3-3c-1.354 0-2.694-.055-4.02-.163a2.115 2.115 0 01-.825-.242m9.345-8.334a2.126 2.126 0 00-.476-.095 48.64 48.64 0 00-8.048 0c-1.131.094-1.976 1.057-1.976 2.192v4.286c0 .837.46 1.58 1.155 1.951m9.345-8.334V6.637c0-1.621-1.152-3.026-2.76-3.235A48.455 48.455 0 0011.25 3c-2.115 0-4.198.137-6.24.402-1.608.209-2.76 1.614-2.76 3.235v6.226c0 1.621 1.152 3.026 2.76 3.235.577.075 1.157.14 1.74.194V21l4.155-4.155" />
    </svg>
  );
}

function GlobeIcon() {
  return (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 21a9.004 9.004 0 008.716-6.747M12 21a9.004 9.004 0 01-8.716-6.747M12 21c2.485 0 4.5-4.03 4.5-9S14.485 3 12 3m0 18c-2.485 0-4.5-4.03-4.5-9S9.515 3 12 3m0 0a8.997 8.997 0 017.843 4.582M12 3a8.997 8.997 0 00-7.843 4.582m15.686 0A11.953 11.953 0 0112 10.5c-2.998 0-5.74-1.1-7.843-2.918m15.686 0A8.959 8.959 0 0121 12c0 .778-.099 1.533-.284 2.253m0 0A17.919 17.919 0 0112 16.5c-3.162 0-6.133-.815-8.716-2.247m0 0A9.015 9.015 0 013 12c0-1.605.42-3.113 1.157-4.418" />
    </svg>
  );
}

