import Link from "next/link";

/* ─── Footer — always dark, high-contrast section ─────────────── */
export default function Footer() {
  const year = new Date().getFullYear();

  const allLinks = [
    { href: "/#how-it-works",                        label: "How it works" },
    { href: "/pricing",                               label: "Pricing" },
    { href: "/create",                                label: "Create MCP" },
    { href: "/dashboard",                             label: "Dashboard" },
    { href: "https://modelcontextprotocol.io",        label: "MCP Docs",   ext: true },
    { href: "https://www.anthropic.com",              label: "Anthropic",  ext: true },
    { href: "https://github.com/VarunGuptaPy/auto-mcp", label: "GitHub",   ext: true },
  ];

  return (
    <footer className="bg-[#08080f] relative overflow-hidden">
      {/* Accent top border */}
      <div className="h-px w-full bg-gradient-to-r from-transparent via-cyan-500/50 to-transparent" />

      {/* Subtle radial glow behind logo */}
      <div
        aria-hidden
        className="pointer-events-none absolute left-1/2 top-0 -translate-x-1/2 w-[600px] h-[300px]"
        style={{
          background:
            "radial-gradient(ellipse at 50% 0%, rgba(34,211,238,0.07) 0%, transparent 70%)",
        }}
      />

      <div className="relative max-w-5xl mx-auto px-6 pt-20 pb-12">

        {/* ── Brand block (centered) ────────────────────────── */}
        <div className="flex flex-col items-center text-center mb-14">
          <Link href="/" className="flex items-center gap-3 mb-5 group">
            <LogoMark size={44} />
            <span className="text-[1.75rem] font-bold tracking-tight text-white leading-none">
              auto<span className="text-cyan-400">-mcp</span>
            </span>
          </Link>

          <p className="text-zinc-400 text-base leading-relaxed max-w-sm">
            Paste a URL. Get a production-ready MCP server.<br />
            Powered by Claude&nbsp;+&nbsp;Playwright.
          </p>
        </div>

        {/* ── Nav links (single horizontal row) ────────────── */}
        <nav
          aria-label="Footer navigation"
          className="flex flex-wrap justify-center gap-x-8 gap-y-3 mb-14"
        >
          {allLinks.map((l) =>
            l.ext ? (
              <a
                key={l.href}
                href={l.href}
                target="_blank"
                rel="noreferrer"
                className="text-sm text-zinc-400 hover:text-white transition-colors"
              >
                {l.label} ↗
              </a>
            ) : (
              <Link
                key={l.href}
                href={l.href}
                className="text-sm text-zinc-400 hover:text-white transition-colors"
              >
                {l.label}
              </Link>
            )
          )}
        </nav>

        {/* ── Divider ───────────────────────────────────────── */}
        <div className="border-t border-zinc-800 pt-8 flex flex-col sm:flex-row items-center justify-between gap-4">
          <p className="text-xs text-zinc-500 order-2 sm:order-1">
            &copy; {year} auto-mcp &mdash; All rights reserved
          </p>

          <div className="flex items-center gap-3 order-1 sm:order-2">
            <a
              href="https://github.com/VarunGuptaPy/auto-mcp"
              target="_blank"
              rel="noreferrer"
              aria-label="GitHub"
              className="text-zinc-500 hover:text-white transition-colors"
            >
              <GHIcon />
            </a>
            <a
              href="https://x.com"
              target="_blank"
              rel="noreferrer"
              aria-label="X / Twitter"
              className="text-zinc-500 hover:text-white transition-colors"
            >
              <XIcon />
            </a>
          </div>
        </div>
      </div>
    </footer>
  );
}

/* ─── Logo mark (always bright cyan — footer is always dark) ──── */
function LogoMark({ size = 32 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none" aria-hidden>
      <defs>
        <linearGradient id="f-grad" x1="0" y1="0" x2="32" y2="32" gradientUnits="userSpaceOnUse">
          <stop stopColor="#22d3ee" />
          <stop offset="1" stopColor="#0891b2" />
        </linearGradient>
      </defs>
      <rect width="32" height="32" rx="9" fill="url(#f-grad)" />
      <path d="M13 11.5a4 4 0 0 0-4 4v1a4 4 0 0 0 4 4h1.5"
        stroke="white" strokeWidth="2.5" strokeLinecap="round" fill="none" />
      <path d="M19 20.5a4 4 0 0 0 4-4v-1a4 4 0 0 0-4-4h-1.5"
        stroke="white" strokeWidth="2.5" strokeLinecap="round" fill="none" />
      <path d="M13.5 16h5" stroke="white" strokeWidth="2.5" strokeLinecap="round" />
      <circle cx="16" cy="16" r="1.2" fill="white" />
    </svg>
  );
}

function GHIcon() {
  return (
    <svg height="18" width="18" viewBox="0 0 16 16" fill="currentColor" aria-hidden>
      <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z" />
    </svg>
  );
}

function XIcon() {
  return (
    <svg height="16" width="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-4.714-6.231-5.401 6.231H2.746l7.73-8.835L1.254 2.25H8.08l4.253 5.622zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
    </svg>
  );
}
