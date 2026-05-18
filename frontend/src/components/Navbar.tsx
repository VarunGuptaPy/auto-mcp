"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState, useEffect } from "react";
import { useAuth } from "@/lib/auth-context";

/* ─── useTheme hook ───────────────────────────────────────────── */
function useTheme() {
  const [theme, setTheme] = useState<"dark" | "light">("dark");

  useEffect(() => {
    const stored = localStorage.getItem("theme");
    if (stored === "light") {
      document.documentElement.classList.remove("dark");
      setTheme("light");
    } else {
      document.documentElement.classList.add("dark");
      setTheme("dark");
    }
  }, []);

  function toggle() {
    setTheme((prev) => {
      const next = prev === "dark" ? "light" : "dark";
      if (next === "light") {
        document.documentElement.classList.remove("dark");
      } else {
        document.documentElement.classList.add("dark");
      }
      localStorage.setItem("theme", next);
      return next;
    });
  }

  return { theme, toggle };
}

/* ─── Main component ──────────────────────────────────────────── */
export default function Navbar() {
  const { user, loading, signOut } = useAuth();
  const router   = useRouter();
  const pathname = usePathname();
  const { theme, toggle } = useTheme();

  const [open,       setOpen]       = useState(false);
  const [avatarMenu, setAvatarMenu] = useState(false);

  const links = [
    { href: "/#how-it-works", label: "How it works" },
    { href: "/pricing",        label: "Pricing" },
    { href: "https://github.com/VarunGuptaPy/auto-mcp", label: "GitHub", ext: true },
  ];

  async function handleSignOut() {
    await signOut();
    setAvatarMenu(false);
    router.push("/");
  }

  return (
    <header className="sticky top-0 z-50 w-full bg-surface/95 backdrop-blur-xl border-b border-border">
      <nav className="max-w-6xl mx-auto px-4 sm:px-6 h-16 grid grid-cols-[auto_1fr_auto] items-center gap-4">

        {/* Logo */}
        <Link href="/" className="shrink-0 flex items-center gap-2.5 group">
          <LogoMark />
          <span className="font-semibold text-[15px] tracking-tight text-text1 group-hover:opacity-80 transition-opacity">
            auto<span className="text-accent">-mcp</span>
          </span>
        </Link>

        {/* Desktop nav links — centered */}
        <div className="hidden md:flex justify-center items-center gap-1">
          {links.map((l) =>
            l.ext ? (
              <a
                key={l.href}
                href={l.href}
                target="_blank"
                rel="noreferrer"
                className="px-3.5 py-1.5 text-sm text-text2 hover:text-text1 rounded-lg hover:bg-surface-2 transition-colors font-medium"
              >
                {l.label}
              </a>
            ) : (
              <Link
                key={l.href}
                href={l.href}
                className={`px-3.5 py-1.5 text-sm rounded-lg transition-colors font-medium ${
                  pathname === l.href ? "text-text1 bg-surface-2" : "text-text2 hover:text-text1 hover:bg-surface-2"
                }`}
              >
                {l.label}
              </Link>
            )
          )}
        </div>

        {/* Mobile: empty center cell so grid still works */}
        <div className="md:hidden" />

        {/* Right section */}
        <div className="flex items-center gap-2">

          {/* Theme toggle */}
          <button
            onClick={toggle}
            aria-label="Toggle theme"
            className="p-1.5 rounded-lg text-text2 hover:text-text1 hover:bg-surface-2 transition-colors"
          >
            {theme === "dark" ? <SunIcon /> : <MoonIcon />}
          </button>

          {/* Auth section */}
          {loading ? (
            <div className="w-7 h-7 rounded-full bg-surface animate-pulse" />
          ) : user ? (
            <div className="relative">
              <button
                onClick={() => setAvatarMenu((v) => !v)}
                className="flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-surface-2 transition-colors"
              >
                {user.photoURL ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={user.photoURL} alt="" className="w-6 h-6 rounded-full ring-1 ring-border" />
                ) : (
                  <div className="w-6 h-6 rounded-full flex items-center justify-center bg-accent text-white text-xs font-bold">
                    {(user.displayName ?? user.email ?? "U")[0].toUpperCase()}
                  </div>
                )}
                <span className="hidden sm:block text-sm text-text1 max-w-[100px] truncate">
                  {user.displayName?.split(" ")[0] ?? user.email?.split("@")[0]}
                </span>
                <ChevronIcon />
              </button>

              {avatarMenu && (
                <>
                  <div className="fixed inset-0 z-10" onClick={() => setAvatarMenu(false)} />
                  <div className="absolute right-0 top-full mt-2 w-52 bg-surface border border-border rounded-2xl shadow-2xl z-20 overflow-hidden">
                    <div className="px-3 py-2.5 border-b border-border">
                      <p className="text-xs text-muted truncate">{user.email}</p>
                    </div>
                    {[
                      { href: "/dashboard", label: "Dashboard",      icon: <HomeIcon /> },
                      { href: "/create",    label: "New MCP server",  icon: <PlusIcon /> },
                      { href: "/pricing",   label: "Upgrade plan",    icon: <StarIcon /> },
                    ].map((item) => (
                      <Link
                        key={item.href}
                        href={item.href}
                        onClick={() => setAvatarMenu(false)}
                        className="flex items-center gap-2.5 px-3 py-2.5 text-sm text-text2 hover:text-text1 hover:bg-surface-2 transition-colors"
                      >
                        {item.icon}
                        {item.label}
                      </Link>
                    ))}
                    <div className="border-t border-border">
                      <button
                        onClick={handleSignOut}
                        className="flex items-center gap-2.5 w-full px-3 py-2.5 text-sm text-text2 hover:text-danger hover:bg-danger/5 transition-colors"
                      >
                        <SignOutIcon />
                        Sign out
                      </button>
                    </div>
                  </div>
                </>
              )}
            </div>
          ) : (
            <>
              <Link
                href="/auth"
                className="hidden sm:block px-3 py-1.5 text-sm text-text2 hover:text-text1 transition-colors"
              >
                Sign in
              </Link>
              <Link
                href="/auth"
                className="btn-primary px-4 py-1.5 rounded-lg text-sm"
              >
                Get started
              </Link>
            </>
          )}

          {/* Mobile hamburger */}
          <button
            className="md:hidden p-1.5 rounded-lg text-text2 hover:text-text1 hover:bg-surface-2"
            onClick={() => setOpen((v) => !v)}
            aria-label="Toggle menu"
          >
            <MenuIcon open={open} />
          </button>
        </div>
      </nav>

      {/* Mobile menu */}
      {open && (
        <div className="md:hidden border-t border-border bg-surface/95 px-4 py-3 space-y-0.5">
          {links.map((l) =>
            l.ext ? (
              <a
                key={l.href}
                href={l.href}
                target="_blank"
                rel="noreferrer"
                className="block px-3 py-2 text-sm text-text2 hover:text-text1 rounded-lg"
                onClick={() => setOpen(false)}
              >
                {l.label}
              </a>
            ) : (
              <Link
                key={l.href}
                href={l.href}
                className="block px-3 py-2 text-sm text-text2 hover:text-text1 rounded-lg"
                onClick={() => setOpen(false)}
              >
                {l.label}
              </Link>
            )
          )}
          {!user && (
            <Link
              href="/auth"
              className="block px-3 py-2 text-sm text-text2 hover:text-text1 rounded-lg"
              onClick={() => setOpen(false)}
            >
              Sign in
            </Link>
          )}
        </div>
      )}
    </header>
  );
}

/* ─── Logo mark ───────────────────────────────────────────────── */
function LogoMark() {
  return (
    <svg width="32" height="32" viewBox="0 0 32 32" fill="none" aria-hidden>
      <defs>
        <linearGradient id="amcp-grad" x1="0" y1="0" x2="32" y2="32" gradientUnits="userSpaceOnUse">
          <stop stopColor="#22d3ee" />
          <stop offset="1" stopColor="#0891b2" />
        </linearGradient>
      </defs>

      {/* Background rounded square */}
      <rect width="32" height="32" rx="9" fill="url(#amcp-grad)" />

      {/* Left arc of chain link — represents "website" */}
      <path
        d="M13 11.5a4 4 0 0 0-4 4v1a4 4 0 0 0 4 4h1.5"
        stroke="white"
        strokeWidth="2.5"
        strokeLinecap="round"
        fill="none"
      />

      {/* Right arc of chain link — represents "MCP server" */}
      <path
        d="M19 20.5a4 4 0 0 0 4-4v-1a4 4 0 0 0-4-4h-1.5"
        stroke="white"
        strokeWidth="2.5"
        strokeLinecap="round"
        fill="none"
      />

      {/* Center bar connecting the two — represents auto-mcp bridge */}
      <path
        d="M13.5 16h5"
        stroke="white"
        strokeWidth="2.5"
        strokeLinecap="round"
      />

      {/* Small dot at center — the "connection point" */}
      <circle cx="16" cy="16" r="1.2" fill="white" />
    </svg>
  );
}

/* ─── Icons ───────────────────────────────────────────────────── */
const ico = (d: string) => (
  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
    <path strokeLinecap="round" strokeLinejoin="round" d={d} />
  </svg>
);

function SunIcon() {
  return (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <circle cx="12" cy="12" r="5" strokeLinecap="round" strokeLinejoin="round" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42" />
    </svg>
  );
}

function MoonIcon() {
  return (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M21 12.79A9 9 0 1111.21 3 7 7 0 0021 12.79z" />
    </svg>
  );
}

function ChevronIcon()  { return ico("M19 9l-7 7-7-7"); }
function MenuIcon({ open }: { open: boolean }) {
  return open
    ? ico("M6 18L18 6M6 6l12 12")
    : ico("M4 6h16M4 12h16M4 18h16");
}
function HomeIcon()     { return ico("M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6"); }
function PlusIcon()     { return ico("M12 4v16m8-8H4"); }
function StarIcon()     { return ico("M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z"); }
function SignOutIcon()  { return ico("M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1"); }
