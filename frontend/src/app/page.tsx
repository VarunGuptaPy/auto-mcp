"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import { useAuth } from "@/lib/auth-context";

/* ═══════════════════════════════════════════════════════════ */

export default function LandingPage() {
  return (
    <div className="flex flex-col min-h-screen overflow-x-hidden">
      <Navbar />
      <main className="flex-1">
        <Hero />
        <CompatStrip />
        <ProductPreview />
        <HowItWorks />
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
    <section className="relative min-h-[92vh] flex flex-col items-center justify-center px-4 pt-10 pb-20 text-center overflow-hidden">
      {/* Layered background */}
      <div aria-hidden className="absolute inset-0 bg-hero-glow pointer-events-none" />
      <div
        aria-hidden
        className="absolute inset-0 pointer-events-none opacity-[0.35]"
        style={{
          backgroundImage:
            "linear-gradient(rgba(157,143,255,0.05) 1px,transparent 1px),linear-gradient(90deg,rgba(157,143,255,0.05) 1px,transparent 1px)",
          backgroundSize: "52px 52px",
        }}
      />
      {/* Radial spotlight */}
      <div
        aria-hidden
        className="absolute top-0 left-1/2 -translate-x-1/2 w-[700px] h-[400px] pointer-events-none"
        style={{
          background:
            "radial-gradient(ellipse at center, rgba(157,143,255,0.18) 0%, rgba(232,121,249,0.06) 50%, transparent 70%)",
          filter: "blur(40px)",
        }}
      />

      <div className="relative z-10 max-w-4xl mx-auto">
        {/* Eyebrow badge */}
        <div className="animate-fade-in inline-flex items-center gap-2.5 mb-7 px-3.5 py-1.5 rounded-full border border-accent/25 bg-accent/10 text-xs font-medium">
          <span className="inline-block w-1.5 h-1.5 rounded-full bg-accent animate-pulse" />
          <span className="text-accent">Powered by Claude + Playwright</span>
          <span className="text-muted">·</span>
          <span className="text-text2">MCP standard</span>
        </div>

        {/* Headline */}
        <h1 className="animate-fade-in-d1 text-[clamp(2.6rem,7vw,5.5rem)] font-extrabold tracking-tight leading-[1.04] mb-6">
          <span className="text-text1">Every website</span>
          <br />
          <span className="text-gradient-accent">is an API.</span>
          <br />
          <span className="text-text1">Now your AI knows it.</span>
        </h1>

        {/* Subheadline */}
        <p className="animate-fade-in-d2 text-[1.15rem] text-text2 leading-relaxed max-w-2xl mx-auto mb-10">
          Paste a URL. auto-mcp&apos;s browser agent maps every route, captures
          every endpoint, and ships a typed Python MCP server—without you writing
          a single line of code.
        </p>

        {/* URL input form */}
        <form
          onSubmit={go}
          className="animate-fade-in-d2 flex flex-col sm:flex-row gap-2.5 max-w-lg mx-auto mb-4"
        >
          <input
            type="url"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://api.example.com"
            className="flex-1 bg-surface border border-border rounded-xl px-4 py-3 text-sm text-text1 placeholder-muted outline-none focus:border-accent/60 transition-colors"
          />
          <button
            type="submit"
            className="px-6 py-3 rounded-xl font-semibold text-sm text-white whitespace-nowrap transition-all"
            style={{
              background: "linear-gradient(135deg, #9d8fff 0%, #c084fc 55%, #e879f9 100%)",
              boxShadow: "0 0 24px rgba(157,143,255,0.35)",
            }}
          >
            Generate MCP →
          </button>
        </form>

        <p className="animate-fade-in-d3 text-xs text-muted">
          Free to start · No credit card · 5 servers/month on free tier
        </p>
      </div>
    </section>
  );
}

/* ─── Compatibility strip ──────────────────────────────────── */

function CompatStrip() {
  const tools = [
    "Claude Desktop", "Cursor", "GPT-4o", "Cline", "Continue.dev",
    "Windsurf", "Zed", "VS Code", "Claude Desktop", "Cursor", "GPT-4o",
    "Cline", "Continue.dev", "Windsurf", "Zed", "VS Code",
  ];

  return (
    <div className="relative border-y border-border py-4 overflow-hidden">
      <div className="absolute inset-y-0 left-0 w-20 z-10 pointer-events-none"
        style={{ background: "linear-gradient(90deg, #08070e, transparent)" }} />
      <div className="absolute inset-y-0 right-0 w-20 z-10 pointer-events-none"
        style={{ background: "linear-gradient(-90deg, #08070e, transparent)" }} />

      <p className="text-center text-[10px] uppercase tracking-[0.2em] text-muted mb-3">
        Works with every MCP-compatible client
      </p>

      <div className="flex animate-marquee whitespace-nowrap">
        {tools.map((t, i) => (
          <span key={i} className="inline-flex items-center gap-3 mx-6 text-sm text-text2 font-medium">
            <span className="w-1 h-1 rounded-full bg-border" />
            {t}
          </span>
        ))}
      </div>
    </div>
  );
}

/* ─── Product preview ──────────────────────────────────────── */

function ProductPreview() {
  return (
    <section className="px-4 py-20">
      <div className="max-w-5xl mx-auto">
        <div className="relative">
          {/* Glow behind the mockup */}
          <div
            aria-hidden
            className="absolute inset-0 pointer-events-none"
            style={{
              background:
                "radial-gradient(ellipse 70% 50% at 50% 60%, rgba(157,143,255,0.12) 0%, transparent 70%)",
              filter: "blur(24px)",
            }}
          />

          {/* Browser chrome */}
          <div className="relative border-gradient rounded-2xl overflow-hidden" style={{ background: "#0f0d1a" }}>
            {/* Title bar */}
            <div className="flex items-center gap-2 px-4 py-3 border-b border-border bg-surface-2/60">
              <div className="flex gap-1.5">
                <div className="w-3 h-3 rounded-full bg-danger/50" />
                <div className="w-3 h-3 rounded-full bg-warn/50" />
                <div className="w-3 h-3 rounded-full bg-success/50" />
              </div>
              <div className="flex-1 flex justify-center">
                <div className="flex items-center gap-2 bg-surface border border-border rounded-md px-3 py-1 text-xs text-muted font-mono w-64">
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
                  { label: "Code analysis", done: true  },
                  { label: "Exploring",     done: true  },
                  { label: "Analyzing",     active: true },
                  { label: "Generating",    done: false },
                  { label: "Done",          done: false },
                ].map((s) => (
                  <div key={s.label} className="flex items-center gap-2.5">
                    <div className={`w-4 h-4 rounded-full flex items-center justify-center text-[9px] shrink-0 ${
                      s.done   ? "bg-success/20 border border-success/40 text-success" :
                      s.active ? "bg-accent/20 border border-accent/40 text-accent animate-pulse" :
                                 "bg-border border border-border text-muted"
                    }`}>
                      {s.done ? "✓" : s.active ? "●" : "○"}
                    </div>
                    <span className={s.done ? "text-text2" : s.active ? "text-text1" : "text-muted"}>
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
                {/* Fake screenshot */}
                <div className="flex-1 bg-black/60 rounded-lg overflow-hidden relative">
                  <div className="absolute inset-0 flex flex-col">
                    <div className="h-7 bg-[#1a1a2e] border-b border-border/50 flex items-center px-3 gap-2">
                      <div className="w-16 h-2 bg-surface-2 rounded" />
                      <div className="w-24 h-2 bg-surface-2 rounded" />
                    </div>
                    <div className="flex-1 p-3 space-y-2">
                      {[70, 45, 90, 55, 80].map((w, i) => (
                        <div key={i} className="h-2 rounded" style={{ width: `${w}%`, background: "#221f38" }} />
                      ))}
                    </div>
                  </div>
                  <div className="absolute top-2 right-2 text-[9px] font-mono bg-black/70 border border-border rounded px-1.5 py-0.5 text-text2">
                    step 18/24
                  </div>
                </div>

                {/* Reasoning box */}
                <div className="bg-surface-2/60 border border-border rounded-lg p-3">
                  <p className="text-[9px] uppercase tracking-wider text-muted mb-1.5">Agent reasoning</p>
                  <p className="text-[11px] text-text2 leading-relaxed line-clamp-2">
                    Clicking &quot;View item&quot; button → navigating to /items/42 → capturing GET /api/items/42 endpoint with auth header
                  </p>
                </div>

                {/* Endpoints */}
                <div className="bg-surface-2/60 border border-border rounded-lg px-3 py-2 flex items-center justify-between">
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
      </div>
    </section>
  );
}

function AgentBubble({ text }: { text: string }) {
  return (
    <div className="flex gap-2 items-start">
      <div className="w-5 h-5 rounded-full bg-accent/20 border border-accent/30 flex items-center justify-center text-[8px] text-accent shrink-0 mt-0.5">A</div>
      <div className="bg-surface border border-border rounded-xl rounded-tl-sm px-2.5 py-2 text-[10px] text-text2 leading-relaxed max-w-[200px]">{text}</div>
    </div>
  );
}

function UserBubble({ text }: { text: string }) {
  return (
    <div className="flex gap-2 items-start justify-end">
      <div className="bg-accent/15 border border-accent/20 rounded-xl rounded-tr-sm px-2.5 py-2 text-[10px] text-accent leading-relaxed max-w-[200px]">{text}</div>
    </div>
  );
}

/* ─── How it works ──────────────────────────────────────────── */

function HowItWorks() {
  return (
    <section id="how-it-works" className="py-24 px-4">
      <div className="max-w-5xl mx-auto">
        <Label>How it works</Label>
        <h2 className="mt-3 text-4xl sm:text-5xl font-extrabold text-text1 text-center leading-tight mb-4">
          Three steps.<br />
          <span className="text-gradient-accent">One MCP server.</span>
        </h2>
        <p className="text-text2 text-center max-w-xl mx-auto mb-16">
          No config files. No API docs to read. Just a URL.
        </p>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {[
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
          ].map((s, i) => (
            <div
              key={s.n}
              className="border-gradient shine p-6 rounded-2xl relative"
              style={{ animationDelay: `${i * 0.1}s` }}
            >
              <div className="flex items-center justify-between mb-5">
                <div className="w-9 h-9 rounded-xl flex items-center justify-center text-accent"
                  style={{ background: "rgba(157,143,255,0.12)", border: "1px solid rgba(157,143,255,0.2)" }}>
                  {s.icon}
                </div>
                <span className="font-mono text-4xl font-black text-border select-none">{s.n}</span>
              </div>
              <h3 className="text-base font-bold text-text1 mb-2">{s.title}</h3>
              <p className="text-sm text-text2 leading-relaxed mb-4">{s.body}</p>
              <span className="inline-flex items-center text-[11px] font-medium text-accent bg-accent/10 border border-accent/20 rounded-full px-2.5 py-1">
                {s.tag}
              </span>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ─── Bento features ────────────────────────────────────────── */

function BentoFeatures() {
  return (
    <section className="py-6 px-4">
      <div className="max-w-5xl mx-auto">
        <Label>Features</Label>
        <h2 className="mt-3 text-4xl sm:text-5xl font-extrabold text-text1 text-center mb-14">
          Built for depth,<br />
          <span className="text-gradient-accent">not just breadth.</span>
        </h2>

        {/* Bento grid — asymmetric */}
        <div className="grid grid-cols-1 md:grid-cols-5 grid-rows-[auto_auto] gap-4">

          {/* Large left — code analysis */}
          <div className="border-gradient shine rounded-2xl p-6 md:col-span-3">
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

          {/* Small right — privacy */}
          <div className="border-gradient shine rounded-2xl p-6 md:col-span-2">
            <BentoIcon><LockIcon /></BentoIcon>
            <h3 className="text-sm font-bold text-text1 mt-4 mb-2">Privacy-first</h3>
            <p className="text-sm text-text2 leading-relaxed">
              Source code is analyzed locally. Nothing leaves your machine.
              GitHub tokens are in-memory only—never written to disk, never logged.
            </p>
            <div className="mt-4 flex flex-col gap-1.5">
              {["Token never persisted", "ChromaDB runs locally", "No third-party data sharing"].map((t) => (
                <div key={t} className="flex items-center gap-2 text-xs text-text2">
                  <span className="w-4 h-4 rounded-full bg-success/15 border border-success/30 flex items-center justify-center text-success text-[9px] shrink-0">✓</span>
                  {t}
                </div>
              ))}
            </div>
          </div>

          {/* Bottom row */}
          <div className="border-gradient shine rounded-2xl p-6 md:col-span-2">
            <BentoIcon><ZapIcon /></BentoIcon>
            <h3 className="text-sm font-bold text-text1 mt-4 mb-2">Claude-ready output</h3>
            <p className="text-sm text-text2 leading-relaxed">
              Typed tool definitions, docstrings, and a ready-to-paste
              <code className="text-accent mx-1 text-[11px]">claude_desktop_config.json</code>
              block. Two config lines and you&apos;re live.
            </p>
          </div>

          <div className="border-gradient shine rounded-2xl p-6 md:col-span-2">
            <BentoIcon><ChatIcon /></BentoIcon>
            <h3 className="text-sm font-bold text-text1 mt-4 mb-2">Interactive agent</h3>
            <p className="text-sm text-text2 leading-relaxed">
              Hit a login wall? The agent pauses and asks. Want it to explore
              a page it missed? Tell it in the chat panel.
              You stay in control throughout.
            </p>
          </div>

          <div className="border-gradient shine rounded-2xl p-6 md:col-span-1 flex flex-col justify-between">
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
    <section id="pricing" className="py-24 px-4">
      <div className="max-w-4xl mx-auto">
        <Label>Pricing</Label>
        <h2 className="mt-3 text-4xl sm:text-5xl font-extrabold text-text1 text-center mb-3">
          Start free.<br />
          <span className="text-gradient-accent">Scale when you need to.</span>
        </h2>
        <p className="text-center text-text2 mb-14 max-w-sm mx-auto">
          No contracts. No hidden fees. Cancel anytime.
        </p>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          {/* Free */}
          <div className="card p-7">
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
                  <span className={`w-4 h-4 rounded-full flex items-center justify-center text-[10px] shrink-0 ${
                    ok ? "bg-success/15 border border-success/30 text-success" : "bg-border border border-border text-muted"
                  }`}>{ok ? "✓" : "–"}</span>
                  <span className={ok ? "text-text2" : "text-muted line-through"}>{String(label)}</span>
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
            className="relative rounded-2xl p-7"
            style={{
              background: "linear-gradient(145deg, rgba(157,143,255,0.12) 0%, rgba(232,121,249,0.06) 100%)",
              border: "1px solid rgba(157,143,255,0.3)",
              boxShadow: "0 0 0 1px rgba(157,143,255,0.1), 0 0 60px rgba(157,143,255,0.1)",
            }}
          >
            <div className="absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-1 rounded-full text-[11px] font-bold text-white whitespace-nowrap"
              style={{ background: "linear-gradient(135deg, #9d8fff 0%, #e879f9 100%)" }}>
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
                  <span className="w-4 h-4 rounded-full flex items-center justify-center text-[10px] bg-success/15 border border-success/30 text-success shrink-0">✓</span>
                  <span className="text-text2">{label}</span>
                </li>
              ))}
            </ul>
            <Link
              href="/pricing"
              className="block w-full text-center py-2.5 rounded-xl text-sm font-bold text-white transition-all"
              style={{
                background: "linear-gradient(135deg, #9d8fff 0%, #c084fc 55%, #e879f9 100%)",
                boxShadow: "0 0 20px rgba(157,143,255,0.3)",
              }}
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
    <section className="px-4 py-16">
      <div className="max-w-4xl mx-auto">
        <div
          className="relative rounded-3xl overflow-hidden p-12 text-center"
          style={{
            background:
              "linear-gradient(135deg, rgba(157,143,255,0.15) 0%, rgba(232,121,249,0.08) 100%)",
            border: "1px solid rgba(157,143,255,0.2)",
          }}
        >
          <div
            aria-hidden
            className="absolute inset-0 pointer-events-none"
            style={{
              background:
                "radial-gradient(ellipse 70% 80% at 50% 100%, rgba(157,143,255,0.12) 0%, transparent 70%)",
            }}
          />
          <div className="relative z-10">
            <h2 className="text-4xl sm:text-5xl font-extrabold mb-4">
              <span className="text-text1">Your first MCP server</span>
              <br />
              <span className="text-gradient-accent">is three minutes away.</span>
            </h2>
            <p className="text-text2 mb-8 max-w-lg mx-auto">
              No config. No API docs. Just a URL and a download.
            </p>
            <div className="flex flex-col sm:flex-row gap-3 justify-center">
              <Link
                href="/auth"
                className="px-8 py-3.5 rounded-xl font-bold text-white text-[15px] transition-all"
                style={{
                  background: "linear-gradient(135deg, #9d8fff 0%, #c084fc 55%, #e879f9 100%)",
                  boxShadow: "0 0 30px rgba(157,143,255,0.4)",
                }}
              >
                Start for free →
              </Link>
              <a
                href="https://github.com/VarunGuptaPy/auto-mcp"
                target="_blank"
                rel="noreferrer"
                className="px-8 py-3.5 rounded-xl font-bold text-text1 text-[15px] border border-border bg-surface hover:bg-surface-2 transition-colors flex items-center justify-center gap-2"
              >
                <GithubIcon /> Star on GitHub
              </a>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

/* ─── Shared helpers ────────────────────────────────────────── */

function Label({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-center text-[11px] font-bold uppercase tracking-[0.18em] text-accent mb-1">
      {children}
    </p>
  );
}

function BentoIcon({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="inline-flex w-9 h-9 rounded-xl items-center justify-center text-accent"
      style={{
        background: "rgba(157,143,255,0.1)",
        border: "1px solid rgba(157,143,255,0.2)",
      }}
    >
      {children}
    </div>
  );
}

function TermRow({ children, color }: { children: React.ReactNode; color: string }) {
  return <div className={`flex gap-2 ${color}`}><span className="opacity-0 select-none">$</span><span>{children}</span></div>;
}

/* ─── Icons ─────────────────────────────────────────────────── */

function StepLinkIcon() { return <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}><path strokeLinecap="round" strokeLinejoin="round" d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" /></svg>; }
function StepBotIcon()  { return <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}><path strokeLinecap="round" strokeLinejoin="round" d="M9.75 3.104v5.714a2.25 2.25 0 01-.659 1.591L5 14.5M9.75 3.104c-.251.023-.501.05-.75.082m.75-.082a24.301 24.301 0 014.5 0m0 0v5.714c0 .597.237 1.17.659 1.591L19.8 15m-6.3-11.896c.251.023.501.05.75.082M19.8 15l-1.57.393A9.065 9.065 0 0112 15a9.065 9.065 0 00-6.23-.607L5 14.5m14.8.5l-1.249 3.124M5 14.5L3.751 17.624m0 0A3 3 0 006.75 21h10.5a3 3 0 002.999-3.376l-.249-3" /></svg>; }
function StepDownIcon() { return <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}><path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" /></svg>; }
function CodeIcon()    { return <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}><path strokeLinecap="round" strokeLinejoin="round" d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" /></svg>; }
function LockIcon()    { return <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}><path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z" /></svg>; }
function ZapIcon()     { return <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}><path strokeLinecap="round" strokeLinejoin="round" d="M3.75 13.5l10.5-11.25L12 10.5h8.25L9.75 21.75 12 13.5H3.75z" /></svg>; }
function ChatIcon()    { return <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}><path strokeLinecap="round" strokeLinejoin="round" d="M20.25 8.511c.884.284 1.5 1.128 1.5 2.097v4.286c0 1.136-.847 2.1-1.98 2.193-.34.027-.68.052-1.02.072v3.091l-3-3c-1.354 0-2.694-.055-4.02-.163a2.115 2.115 0 01-.825-.242m9.345-8.334a2.126 2.126 0 00-.476-.095 48.64 48.64 0 00-8.048 0c-1.131.094-1.976 1.057-1.976 2.192v4.286c0 .837.46 1.58 1.155 1.951m9.345-8.334V6.637c0-1.621-1.152-3.026-2.76-3.235A48.455 48.455 0 0011.25 3c-2.115 0-4.198.137-6.24.402-1.608.209-2.76 1.614-2.76 3.235v6.226c0 1.621 1.152 3.026 2.76 3.235.577.075 1.157.14 1.74.194V21l4.155-4.155" /></svg>; }
function GlobeIcon()   { return <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}><path strokeLinecap="round" strokeLinejoin="round" d="M12 21a9.004 9.004 0 008.716-6.747M12 21a9.004 9.004 0 01-8.716-6.747M12 21c2.485 0 4.5-4.03 4.5-9S14.485 3 12 3m0 18c-2.485 0-4.5-4.03-4.5-9S9.515 3 12 3m0 0a8.997 8.997 0 017.843 4.582M12 3a8.997 8.997 0 00-7.843 4.582m15.686 0A11.953 11.953 0 0112 10.5c-2.998 0-5.74-1.1-7.843-2.918m15.686 0A8.959 8.959 0 0121 12c0 .778-.099 1.533-.284 2.253m0 0A17.919 17.919 0 0112 16.5c-3.162 0-6.133-.815-8.716-2.247m0 0A9.015 9.015 0 013 12c0-1.605.42-3.113 1.157-4.418" /></svg>; }
function GithubIcon()  { return <svg className="w-4 h-4" viewBox="0 0 16 16" fill="currentColor"><path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z" /></svg>; }
