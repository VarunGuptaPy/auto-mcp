"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";
import { useAuth } from "@/lib/auth-context";

export default function Navbar() {
  const { user, loading, signOut } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const [open,       setOpen]       = useState(false);
  const [avatarMenu, setAvatarMenu] = useState(false);

  const links = [
    { href: "/#how-it-works", label: "How it works" },
    { href: "/pricing",       label: "Pricing" },
    { href: "https://github.com/VarunGuptaPy/auto-mcp", label: "GitHub", ext: true },
  ];

  async function handleSignOut() {
    await signOut();
    setAvatarMenu(false);
    router.push("/");
  }

  return (
    <header className="sticky top-0 z-50 w-full glass border-b border-border/60">
      <nav className="max-w-6xl mx-auto px-4 sm:px-6 h-14 flex items-center gap-6">

        {/* Logo */}
        <Link href="/" className="font-mono text-[15px] font-bold shrink-0 flex items-center gap-1.5">
          <span
            className="w-5 h-5 rounded-md flex items-center justify-center text-[10px] font-black text-white"
            style={{ background: "linear-gradient(135deg, #9d8fff, #e879f9)" }}
          >
            A
          </span>
          <span className="text-text1">auto</span>
          <span className="text-muted">-mcp</span>
        </Link>

        {/* Nav links */}
        <div className="hidden md:flex items-center gap-0.5 flex-1">
          {links.map((l) =>
            l.ext ? (
              <a
                key={l.href}
                href={l.href}
                target="_blank"
                rel="noreferrer"
                className="px-3 py-1.5 text-sm text-text2 hover:text-text1 rounded-lg hover:bg-surface-2 transition-colors"
              >
                {l.label}
              </a>
            ) : (
              <Link
                key={l.href}
                href={l.href}
                className={`px-3 py-1.5 text-sm rounded-lg hover:bg-surface-2 transition-colors ${
                  pathname === l.href ? "text-text1" : "text-text2 hover:text-text1"
                }`}
              >
                {l.label}
              </Link>
            )
          )}
        </div>

        <div className="flex-1 md:hidden" />

        {/* Right */}
        <div className="flex items-center gap-2">
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
                  <div
                    className="w-6 h-6 rounded-full flex items-center justify-center text-white text-xs font-bold"
                    style={{ background: "linear-gradient(135deg, #9d8fff, #e879f9)" }}
                  >
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
                      { href: "/dashboard",  label: "Dashboard",     icon: <HomeIcon /> },
                      { href: "/create",     label: "New MCP server", icon: <PlusIcon /> },
                      { href: "/pricing",    label: "Upgrade plan",   icon: <StarIcon /> },
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
              <Link href="/auth" className="hidden sm:block px-3 py-1.5 text-sm text-text2 hover:text-text1 transition-colors">
                Sign in
              </Link>
              <Link
                href="/auth"
                className="px-4 py-1.5 rounded-lg text-sm font-bold text-white transition-all"
                style={{ background: "linear-gradient(135deg, #9d8fff, #e879f9)", boxShadow: "0 0 16px rgba(157,143,255,0.3)" }}
              >
                Get started
              </Link>
            </>
          )}

          <button
            className="md:hidden p-1.5 rounded-lg text-text2 hover:text-text1 hover:bg-surface-2"
            onClick={() => setOpen((v) => !v)}
          >
            <MenuIcon open={open} />
          </button>
        </div>
      </nav>

      {open && (
        <div className="md:hidden border-t border-border bg-surface/95 px-4 py-3 space-y-0.5">
          {links.map((l) =>
            l.ext ? (
              <a key={l.href} href={l.href} target="_blank" rel="noreferrer"
                className="block px-3 py-2 text-sm text-text2 hover:text-text1 rounded-lg"
                onClick={() => setOpen(false)}>
                {l.label}
              </a>
            ) : (
              <Link key={l.href} href={l.href}
                className="block px-3 py-2 text-sm text-text2 hover:text-text1 rounded-lg"
                onClick={() => setOpen(false)}>
                {l.label}
              </Link>
            )
          )}
          {!user && (
            <Link href="/auth" className="block px-3 py-2 text-sm text-text2 hover:text-text1 rounded-lg" onClick={() => setOpen(false)}>
              Sign in
            </Link>
          )}
        </div>
      )}
    </header>
  );
}

/* ─── Tiny icons ─────────────────────────────────────────────── */
const ico = (d: string) => (
  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
    <path strokeLinecap="round" strokeLinejoin="round" d={d} />
  </svg>
);

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
