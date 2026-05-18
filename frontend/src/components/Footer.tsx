import Link from "next/link";

export default function Footer() {
  return (
    <footer className="border-t border-border mt-auto">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-14">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-10 mb-12">
          {/* Brand */}
          <div className="col-span-2 md:col-span-1">
            <div className="flex items-center gap-2 mb-3">
              <span
                className="w-6 h-6 rounded-lg flex items-center justify-center text-[11px] font-black text-white"
                style={{ background: "#6366f1" }}
              >
                A
              </span>
              <p className="font-mono text-[15px] font-bold">
                <span className="text-text1">auto</span>
                <span className="text-muted">-mcp</span>
              </p>
            </div>
            <p className="text-sm text-text2 leading-relaxed max-w-[190px]">
              Turn any website into a production-ready AI tool.
            </p>
          </div>

          <div>
            <p className="text-[11px] font-bold uppercase tracking-widest text-muted mb-4">Product</p>
            <ul className="space-y-2.5">
              {[
                { href: "/#how-it-works", label: "How it works" },
                { href: "/pricing",       label: "Pricing" },
                { href: "/create",        label: "Create MCP" },
                { href: "/dashboard",     label: "Dashboard" },
              ].map((l) => (
                <li key={l.href}>
                  <Link href={l.href} className="text-sm text-text2 hover:text-text1 transition-colors">
                    {l.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <p className="text-[11px] font-bold uppercase tracking-widest text-muted mb-4">Resources</p>
            <ul className="space-y-2.5">
              {[
                { href: "https://modelcontextprotocol.io", label: "MCP Docs",   ext: true },
                { href: "https://www.anthropic.com",       label: "Anthropic",   ext: true },
                { href: "https://github.com/VarunGuptaPy/auto-mcp", label: "GitHub", ext: true },
              ].map((l) => (
                <li key={l.href}>
                  <a
                    href={l.href}
                    target={l.ext ? "_blank" : undefined}
                    rel={l.ext ? "noreferrer" : undefined}
                    className="text-sm text-text2 hover:text-text1 transition-colors"
                  >
                    {l.label}
                  </a>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <p className="text-[11px] font-bold uppercase tracking-widest text-muted mb-4">Legal</p>
            <ul className="space-y-2.5">
              {[
                { href: "/privacy", label: "Privacy" },
                { href: "/terms",   label: "Terms" },
              ].map((l) => (
                <li key={l.href}>
                  <Link href={l.href} className="text-sm text-text2 hover:text-text1 transition-colors">
                    {l.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </div>

        <div className="border-t border-border pt-6 flex flex-col sm:flex-row items-center justify-between gap-3">
          <p className="text-xs text-muted">
            © {new Date().getFullYear()} auto-mcp. Built with Claude + Playwright.
          </p>
          <div className="flex items-center gap-4">
            <a href="https://github.com/VarunGuptaPy/auto-mcp" target="_blank" rel="noreferrer"
              className="text-muted hover:text-text2 transition-colors" aria-label="GitHub">
              <GHIcon />
            </a>
            <a href="https://x.com" target="_blank" rel="noreferrer"
              className="text-muted hover:text-text2 transition-colors" aria-label="X / Twitter">
              <XIcon />
            </a>
          </div>
        </div>
      </div>
    </footer>
  );
}

function GHIcon() {
  return (
    <svg height="16" width="16" viewBox="0 0 16 16" fill="currentColor">
      <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z"/>
    </svg>
  );
}

function XIcon() {
  return (
    <svg height="14" width="14" viewBox="0 0 24 24" fill="currentColor">
      <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-4.714-6.231-5.401 6.231H2.746l7.73-8.835L1.254 2.25H8.08l4.253 5.622zm-1.161 17.52h1.833L7.084 4.126H5.117z"/>
    </svg>
  );
}
