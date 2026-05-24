import Link from "next/link";

/* ─── Navigation data ──────────────────────────────────────────────── */
const NAV = {
  product: [
    { href: "/#how-it-works", label: "How it works" },
    { href: "/pricing",       label: "Pricing" },
    { href: "/create",        label: "Create MCP" },
    { href: "/dashboard",     label: "Dashboard" },
  ],
  resources: [
    { href: "https://modelcontextprotocol.io", label: "MCP Docs",  ext: true },
    { href: "https://www.anthropic.com",        label: "Anthropic", ext: true },
  ],
  legal: [
    { href: "/privacy", label: "Privacy Policy" },
    { href: "/terms",   label: "Terms of Service" },
  ],
} as const;

/* ─── Link helpers ─────────────────────────────────────────────────── */
const linkCls =
  "group inline-flex items-center gap-1.5 text-sm text-text2 hover:text-text1 transition-colors duration-150";

function ExternalArrow() {
  return (
    <svg
      width="10" height="10" viewBox="0 0 10 10" fill="none"
      className="opacity-0 group-hover:opacity-60 transition-opacity duration-150 -translate-y-px"
      aria-hidden="true"
    >
      <path
        d="M1.5 8.5 8.5 1.5M8.5 1.5H3.5M8.5 1.5V6.5"
        stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"
      />
    </svg>
  );
}

/* ─── Column header ────────────────────────────────────────────────── */
function ColHead({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-[10.5px] font-bold uppercase tracking-[0.14em] text-muted mb-5">
      {children}
    </p>
  );
}

/* ─── Social icons ─────────────────────────────────────────────────── */
function FooterLogoMark() {
  return <img src="/logo.png" alt="" width={28} height={28} className="rounded-sm" />;
}

function GHIcon() {
  return (
    <svg height="18" width="18" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
      <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z" />
    </svg>
  );
}

function XIcon() {
  return (
    <svg height="16" width="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-4.714-6.231-5.401 6.231H2.746l7.73-8.835L1.254 2.25H8.08l4.253 5.622zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
    </svg>
  );
}

function SocialLink({
  href,
  label,
  children,
}: {
  href: string;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      aria-label={label}
      className="flex items-center justify-center w-8 h-8 rounded-lg border border-border text-muted hover:text-text1 hover:border-border-sub hover:bg-surface-2 transition-all duration-150"
    >
      {children}
    </a>
  );
}

/* ─── Footer component ─────────────────────────────────────────────── */
export default function Footer() {
  const year = new Date().getFullYear();

  return (
    <footer className="border-t border-border bg-bg mt-auto">
      {/* Subtle top accent line */}
      <div className="h-px w-full bg-gradient-to-r from-transparent via-accent/20 to-transparent" />

      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 pt-16 pb-10">
        {/* ── 4-column grid ─────────────────────────────────── */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-10 lg:gap-12 mb-14">

          {/* Brand column — spans full width on mobile */}
          <div className="col-span-2 md:col-span-1 flex flex-col gap-5">
            {/* Logo */}
            <Link href="/" className="flex items-center gap-2.5 w-fit group" aria-label="Gichku home">
              <FooterLogoMark />
              <span className="font-semibold text-[15px] tracking-tight text-text1 group-hover:opacity-80 transition-opacity">
                Gichku
              </span>
            </Link>

            {/* Tagline */}
            <p className="text-sm text-text2 leading-relaxed max-w-[200px]">
              Turn any website into a production-ready AI tool in seconds.
            </p>

            {/* Social icons */}
            <div className="flex items-center gap-2 mt-1">
              <SocialLink href="https://x.com" label="X / Twitter">
                <XIcon />
              </SocialLink>
            </div>
          </div>

          {/* Product column */}
          <div>
            <ColHead>Product</ColHead>
            <ul className="space-y-3">
              {NAV.product.map((l) => (
                <li key={l.href}>
                  <Link href={l.href} className={linkCls}>
                    {l.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          {/* Resources column */}
          <div>
            <ColHead>Resources</ColHead>
            <ul className="space-y-3">
              {NAV.resources.map((l) => (
                <li key={l.href}>
                  <a
                    href={l.href}
                    target={l.ext ? "_blank" : undefined}
                    rel={l.ext ? "noreferrer" : undefined}
                    className={linkCls}
                  >
                    {l.label}
                    {l.ext && <ExternalArrow />}
                  </a>
                </li>
              ))}
            </ul>
          </div>

          {/* Legal column */}
          <div>
            <ColHead>Legal</ColHead>
            <ul className="space-y-3">
              {NAV.legal.map((l) => (
                <li key={l.href}>
                  <Link href={l.href} className={linkCls}>
                    {l.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </div>

        {/* ── Bottom bar ────────────────────────────────────── */}
        <div className="border-t border-border pt-6 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex flex-col sm:flex-row items-center gap-1.5 sm:gap-3 text-center sm:text-left">
            <p className="text-xs text-muted">
              &copy; {year} Gichku. All rights reserved.
            </p>
            <span className="hidden sm:inline text-border-sub text-xs" aria-hidden="true">·</span>
            <p className="text-xs text-muted/70">
              Built with Claude&nbsp;&amp;&nbsp;Playwright
            </p>
          </div>

          {/* Social icons repeated in bottom bar */}
          <div className="flex items-center gap-2">
            <SocialLink href="https://x.com" label="X / Twitter">
              <XIcon />
            </SocialLink>
          </div>
        </div>
      </div>
    </footer>
  );
}
