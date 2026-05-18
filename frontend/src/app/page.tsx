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
    const onMove = (e: MouseEvent) => {
      el.style.transform = `translate(${e.clientX}px, ${e.clientY}px)`;
    };
    window.addEventListener("mousemove", onMove, { passive: true });
    return () => window.removeEventListener("mousemove", onMove);
  }, []);

  return (
    <div
      ref={ref}
      aria-hidden
      className="pointer-events-none fixed top-0 left-0 z-[1] will-change-transform"
      style={{
        width: 600,
        height: 600,
        marginLeft: -300,
        marginTop: -300,
        borderRadius: "50%",
        background:
          "radial-gradient(circle, rgb(var(--accent-rgb) / 0.13) 0%, rgb(var(--accent-rgb) / 0.04) 40%, transparent 70%)",
        filter: "blur(48px)",
        transition: "transform 0.18s cubic-bezier(0.22,1,0.36,1)",
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
    <div className="flex flex-col min-h-screen overflow-x-clip">
      <CursorGlow />
      <Navbar />
      <main className="flex-1">
        <Hero />
        <CompatStrip />
        <Stats />
        <ProductPreview />
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
    <section className="hero-bg relative min-h-[90vh] flex flex-col items-center justify-center px-4 pt-10 pb-28 text-center overflow-hidden">
      {/* Dot grid */}
      <div aria-hidden className="absolute inset-0 dot-grid opacity-80 pointer-events-none" />

      <div className="relative z-10 max-w-3xl mx-auto">
        {/* Dodo-style pill badge — simple border, no colored bg */}
        <div className="animate-fade-in inline-flex items-center gap-2 mb-8 px-4 py-1.5 rounded-full border border-border bg-surface/80 text-sm text-text2 shadow-sm">
          <span className="font-medium text-text1">Powered by Claude + Playwright</span>
          <span className="text-muted">→</span>
        </div>

        {/* Headline — large, heavy, tight */}
        <h1
          className="animate-fade-in-d1 font-black tracking-tight leading-[1.05] mb-6 text-text1"
          style={{ fontSize: "clamp(2.8rem,7.5vw,5.5rem)" }}
        >
          Turn any website into<br />
          <span className="text-gradient-accent">an MCP server.</span>
        </h1>

        {/* Subheadline */}
        <p className="animate-fade-in-d2 text-lg text-text2 leading-relaxed max-w-xl mx-auto mb-10">
          Paste a URL. auto-mcp&apos;s browser agent maps every route, captures
          every endpoint, and ships a typed Python MCP server—without you writing
          a single line of code.
        </p>

        {/* CTA — two rows matching Dodo's large button style */}
        <div className="animate-fade-in-d2 flex flex-col sm:flex-row gap-3 justify-center mb-5">
          <form onSubmit={go} className="flex flex-col sm:flex-row gap-3">
            <input
              type="url"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://your-app.com"
              className="bg-surface border border-border rounded-xl px-5 py-3.5 text-sm text-text1 placeholder-muted outline-none focus:border-accent/60 transition-colors shadow-sm w-72"
            />
            <button
              type="submit"
              className="btn-primary px-7 py-3.5 rounded-xl text-[15px] font-semibold whitespace-nowrap"
            >
              Generate MCP →
            </button>
          </form>
          <a
            href="https://github.com/VarunGuptaPy/auto-mcp"
            target="_blank"
            rel="noreferrer"
            className="px-7 py-3.5 rounded-xl text-[15px] font-semibold text-text2 hover:text-text1 transition-colors whitespace-nowrap flex items-center justify-center gap-2"
          >
            <GithubIcon /> View on GitHub
          </a>
        </div>

        <p className="animate-fade-in-d3 text-sm text-muted">
          Free to start · No credit card · 5 servers/month on free tier
        </p>
      </div>
    </section>
  );
}

/* ─── Compat strip ──────────────────────────────────────────── */

function CompatStrip() {
  const tools = [
    "Claude Desktop",
    "Cursor",
    "GPT-4o",
    "Cline",
    "Continue.dev",
    "Windsurf",
    "Zed",
    "VS Code",
    "Claude Desktop",
    "Cursor",
    "GPT-4o",
    "Cline",
    "Continue.dev",
    "Windsurf",
    "Zed",
    "VS Code",
  ];

  return (
    <div className="relative border-y border-border py-5 overflow-hidden">
      {/* Fade masks via CSS classes — no inline styles */}
      <div className="absolute inset-y-0 left-0 w-24 z-10 pointer-events-none marquee-fade-l" />
      <div className="absolute inset-y-0 right-0 w-24 z-10 pointer-events-none marquee-fade-r" />

      <p className="text-center text-[10px] uppercase tracking-[0.2em] text-muted mb-4">
        Works with every MCP-compatible client
      </p>

      <div className="flex animate-marquee whitespace-nowrap">
        {tools.map((t, i) => (
          <span
            key={i}
            className="inline-flex items-center gap-3 mx-7 text-sm text-text2 font-medium"
          >
            <span className="w-1 h-1 rounded-full bg-border" />
            {t}
          </span>
        ))}
      </div>
    </div>
  );
}

/* ─── Stats ─────────────────────────────────────────────────── */

function Stats() {
  const items = [
    { value: "< 5 min", label: "Average generation time" },
    { value: "100%", label: "Typed Python output" },
    { value: "Free", label: "To start, no card needed" },
  ];

  return (
    <section className="py-16 px-4 border-b border-border">
      <div className="max-w-4xl mx-auto grid grid-cols-1 sm:grid-cols-3 gap-10 text-center">
        {items.map((item, i) => (
          <div
            key={item.label}
            data-reveal
            data-delay={String(i + 1) as "1" | "2" | "3"}
            className="flex flex-col items-center gap-2"
          >
            <span
              className="font-black text-text1 leading-none"
              style={{ fontSize: "clamp(2.2rem,5vw,3.5rem)" }}
            >
              {item.value}
            </span>
            <span className="text-sm text-text2">{item.label}</span>
          </div>
        ))}
      </div>
    </section>
  );
}

/* ─── Product preview ──────────────────────────────────────── */

function ProductPreview() {
  return (
    <section className="px-4 py-24">
      <div className="max-w-5xl mx-auto" data-reveal>
        <div className="mb-10 text-center">
          <p className="section-label mb-3">Live demo</p>
          <h2 className="text-4xl sm:text-5xl font-extrabold text-text1 leading-tight">
            Watch the agent work
          </h2>
        </div>

        {/* Browser chrome */}
        <div className="relative bg-surface border border-border rounded-2xl overflow-hidden shadow-2xl">
          {/* Title bar */}
          <div className="flex items-center gap-2 px-4 py-3 border-b border-border bg-surface-2">
            <div className="flex gap-1.5">
              <div className="w-3 h-3 rounded-full bg-danger/50" />
              <div className="w-3 h-3 rounded-full bg-warn/50" />
              <div className="w-3 h-3 rounded-full bg-success/50" />
            </div>
            <div className="flex-1 flex justify-center">
              <div className="flex items-center gap-2 bg-bg border border-border rounded-md px-3 py-1 text-xs text-muted font-mono w-64">
                <LockIcon />
                auto-mcp.dev/jobs/f7a2c1
              </div>
            </div>
          </div>

          {/* Fake app UI */}
          <div className="grid grid-cols-[180px_1fr_280px] h-[380px] text-xs">
            {/* Left: timeline */}
            <div className="border-r border-border p-4 space-y-3">
              <p className="text-[10px] uppercase tracking-wider text-muted mb-4">Progress</p>
              {[
                { label: "Code analysis", done: true },
                { label: "Exploring",     done: true },
                { label: "Analyzing",     active: true },
                { label: "Generating",    done: false },
                { label: "Done",          done: false },
              ].map((s) => (
                <div key={s.label} className="flex items-center gap-2.5">
                  <div
                    className={`w-4 h-4 rounded-full flex items-center justify-center text-[9px] shrink-0 ${
                      s.done
                        ? "bg-success/20 border border-success/40 text-success"
                        : s.active
                        ? "bg-accent/20 border border-accent/40 text-accent animate-pulse"
                        : "bg-surface-2 border border-border text-muted"
                    }`}
                  >
                    {s.done ? "✓" : s.active ? "●" : "○"}
                  </div>
                  <span
                    className={
                      s.done ? "text-text2" : s.active ? "text-text1" : "text-muted"
                    }
                  >
                    {s.label}
                  </span>
                </div>
              ))}

              <div className="pt-4 border-t border-border">
                <p className="text-2xl font-mono font-bold text-text1">1:42</p>
                <p className="text-muted text-[10px]">elapsed</p>
              </div>
            </div>

            {/* Center: screenshot area */}
            <div className="border-r border-border p-4 flex flex-col gap-3">
              <div className="flex-1 bg-bg rounded-lg overflow-hidden relative border border-border">
                <div className="absolute inset-0 flex flex-col">
                  <div className="h-7 bg-surface-2 border-b border-border flex items-center px-3 gap-2">
                    <div className="w-16 h-2 bg-border rounded" />
                    <div className="w-24 h-2 bg-border rounded" />
                  </div>
                  <div className="flex-1 p-3 space-y-2">
                    {[70, 45, 90, 55, 80].map((w, i) => (
                      <div key={i} className="h-2 rounded bg-surface-2" style={{ width: `${w}%` }} />
                    ))}
                  </div>
                </div>
                <div className="absolute top-2 right-2 text-[9px] font-mono bg-surface border border-border rounded px-1.5 py-0.5 text-text2">
                  step 18/24
                </div>
              </div>

              <div className="bg-surface-2 border border-border rounded-lg p-3">
                <p className="text-[9px] uppercase tracking-wider text-muted mb-1.5">Agent reasoning</p>
                <p className="text-[11px] text-text2 leading-relaxed line-clamp-2">
                  Clicking &quot;View item&quot; button → navigating to /items/42 → capturing GET /api/items/42 endpoint with auth header
                </p>
              </div>

              <div className="bg-surface-2 border border-border rounded-lg px-3 py-2 flex items-center justify-between">
                <span className="text-[10px] uppercase tracking-wider text-muted">Endpoints captured</span>
                <span className="text-accent font-mono font-bold text-sm">12</span>
              </div>
            </div>

            {/* Right: chat panel */}
            <div className="p-4 flex flex-col gap-2.5">
              <p className="text-[10px] uppercase tracking-wider text-muted mb-1">Agent chat</p>
              <AgentBubble text="I've explored 18 pages. Found a login wall at /dashboard. Do you want me to authenticate?" />
              <UserBubble text="Yes, use test@example.com / password123" />
              <AgentBubble text="Got it. Authenticated successfully. Continuing exploration…" />
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function AgentBubble({ text }: { text: string }) {
  return (
    <div className="flex gap-2 items-start">
      <div className="w-5 h-5 rounded-full bg-accent/20 border border-accent/30 flex items-center justify-center text-[8px] text-accent shrink-0 mt-0.5">
        A
      </div>
      <div className="bg-surface border border-border rounded-xl rounded-tl-sm px-2.5 py-2 text-[10px] text-text2 leading-relaxed max-w-[200px]">
        {text}
      </div>
    </div>
  );
}

function UserBubble({ text }: { text: string }) {
  return (
    <div className="flex gap-2 items-start justify-end">
      <div className="bg-accent/15 border border-accent/20 rounded-xl rounded-tr-sm px-2.5 py-2 text-[10px] text-accent leading-relaxed max-w-[200px]">
        {text}
      </div>
    </div>
  );
}

/* ─── How it works (sticky scroll) ─────────────────────────── */

const HOW_STEPS = [
  {
    n: "01",
    icon: <StepLinkIcon />,
    title: "Paste any URL",
    body: "SaaS app, internal tool, public website. If a browser can load it, auto-mcp can map it. Optionally attach a GitHub repo for deeper coverage.",
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
  const url = "https://github.com";
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
            github.com/api/…
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
    { color: "text-muted",   text: "# auto-mcp generated · server.py" },
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
            auto-mcp doesn&apos;t generate boilerplate—it generates a real,
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
                  <span className="text-muted"># auto-mcp generated · github.com/api</span>
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
                  <span className="text-success">&quot;GitHub API&quot;</span>
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
              Connect a GitHub repo and auto-mcp reads your source code.
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
              GitHub tokens are in-memory only—never written to disk, never logged.
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
                SaaS, dashboards, REST, GraphQL, SPAs—if a browser loads it, auto-mcp maps it.
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
            <p className="text-sm text-text2 mb-8">Everything you need to try auto-mcp.</p>
            <ul className="space-y-3 mb-8">
              {[
                ["5 MCP servers / month", true],
                ["Up to 50 steps per job", true],
                ["Browser exploration", true],
                ["Download as .zip", true],
                ["GitHub code analysis", false],
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
              <span className="text-5xl font-black text-text1">$19</span>
              <span className="text-text2 text-sm mb-2">/month</span>
            </div>
            <p className="text-sm text-text2 mb-8">For developers who ship.</p>
            <ul className="space-y-3 mb-8">
              {[
                "Unlimited MCP servers",
                "Unlimited steps",
                "Browser exploration",
                "Download as .zip",
                "GitHub code analysis",
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
          <a href="mailto:hello@auto-mcp.dev" className="text-accent hover:text-accent-h">
            hello@auto-mcp.dev
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
                  className="inline-flex items-center px-7 py-3.5 rounded-xl text-[15px] font-semibold bg-zinc-900 text-white dark:bg-white dark:text-zinc-900 hover:opacity-85 transition-opacity"
                >
                  Get started free →
                </Link>
                <a
                  href="https://github.com/VarunGuptaPy/auto-mcp"
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-2 px-7 py-3.5 rounded-xl text-[15px] font-semibold text-text2 hover:text-text1 transition-colors"
                >
                  <GithubIcon /> Star on GitHub
                </a>
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
                  <div className="text-muted"># auto-mcp generated · github.com/api</div>
                  <div className="text-muted">from mcp import FastMCP</div>
                  <div className="h-2" />
                  <div className="text-accent">mcp = FastMCP(&quot;GitHub API&quot;)</div>
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

function GithubIcon() {
  return (
    <svg className="w-4 h-4" viewBox="0 0 16 16" fill="currentColor">
      <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z" />
    </svg>
  );
}
