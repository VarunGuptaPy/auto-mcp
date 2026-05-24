"use client";
export const dynamic = "force-dynamic";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import {
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  updateProfile,
} from "firebase/auth";
import { getFirebaseAuth } from "@/lib/firebase";
import { useAuth } from "@/lib/auth-context";
import Navbar from "@/components/Navbar";

type Mode = "signin" | "signup";

export default function AuthPage() {
  return (
    <Suspense fallback={<LoadingScreen />}>
      <AuthContent />
    </Suspense>
  );
}

function LoadingScreen() {
  return (
    <div className="flex flex-col min-h-screen">
      <Navbar />
      <div className="flex-1 flex items-center justify-center">
        <div className="w-5 h-5 border-2 border-accent/30 border-t-accent rounded-full animate-spin" />
      </div>
    </div>
  );
}

function AuthContent() {
  const { user, loading, signInWithGoogle, signInWithGitHub } = useAuth();
  const router = useRouter();
  const params = useSearchParams();
  const next = params.get("next") ?? "/dashboard";
  const prefillUrl = params.get("url") ?? "";

  const [mode,     setMode]     = useState<Mode>("signin");
  const [name,     setName]     = useState("");
  const [email,    setEmail]    = useState("");
  const [password, setPassword] = useState("");
  const [err,      setErr]      = useState<string | null>(null);
  const [busy,     setBusy]     = useState(false);

  useEffect(() => {
    if (!loading && user) {
      const dest = prefillUrl
        ? `${next}?url=${encodeURIComponent(prefillUrl)}`
        : next;
      router.replace(dest);
    }
  }, [user, loading, router, next, prefillUrl]);

  async function handleOAuth(provider: "google" | "github") {
    setErr(null);
    setBusy(true);
    try {
      if (provider === "github") await signInWithGitHub();
      else await signInWithGoogle();
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : "Sign-in failed");
      setBusy(false);
    }
  }

  async function handleEmail(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    setBusy(true);
    try {
      const fbAuth = getFirebaseAuth();
      if (mode === "signup") {
        const cred = await createUserWithEmailAndPassword(fbAuth, email, password);
        if (name.trim()) await updateProfile(cred.user, { displayName: name.trim() });
      } else {
        await signInWithEmailAndPassword(fbAuth, email, password);
      }
    } catch (e: unknown) {
      setErr(friendlyError(e));
      setBusy(false);
    }
  }

  if (loading) {
    return (
      <div className="flex flex-col min-h-screen">
        <Navbar />
        <div className="flex-1 flex items-center justify-center">
          <div className="w-5 h-5 border-2 border-accent/30 border-t-accent rounded-full animate-spin" />
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col min-h-screen">
      <Navbar />
      <main className="flex-1 flex items-center justify-center px-4 py-16">
        <div className="w-full max-w-sm">
          {/* Header */}
          <div className="text-center mb-8">
            <Link href="/" className="font-mono text-xl font-semibold">
              <span className="text-text1">Gichku</span>
            </Link>
            <h1 className="mt-4 text-2xl font-bold text-text1">
              {mode === "signin" ? "Welcome back" : "Create your account"}
            </h1>
            <p className="mt-2 text-sm text-text2">
              {mode === "signin"
                ? "Sign in to access your MCP servers"
                : "Start generating MCP servers for free"}
            </p>
          </div>

          {/* Card */}
          <div className="bg-surface border border-border rounded-2xl p-6">
            {/* OAuth buttons */}
            <div className="space-y-2.5 mb-5">
              <OAuthButton
                onClick={() => handleOAuth("google")}
                disabled={busy}
                icon={<GoogleIcon />}
                label={`${mode === "signin" ? "Continue" : "Sign up"} with Google`}
              />
              <OAuthButton
                onClick={() => handleOAuth("github")}
                disabled={busy}
                icon={<GitHubIcon />}
                label={`${mode === "signin" ? "Continue" : "Sign up"} with GitHub`}
                dark
              />
            </div>

            {/* Divider */}
            <div className="flex items-center gap-3 mb-5">
              <div className="flex-1 h-px bg-border" />
              <span className="text-xs text-muted">or</span>
              <div className="flex-1 h-px bg-border" />
            </div>

            {/* Email form */}
            <form onSubmit={handleEmail} className="space-y-3">
              {mode === "signup" && (
                <FormField
                  label="Name"
                  type="text"
                  value={name}
                  onChange={setName}
                  placeholder="Your name"
                  autoComplete="name"
                />
              )}
              <FormField
                label="Email"
                type="email"
                value={email}
                onChange={setEmail}
                placeholder="you@example.com"
                autoComplete={mode === "signin" ? "username" : "email"}
              />
              <FormField
                label="Password"
                type="password"
                value={password}
                onChange={setPassword}
                placeholder="••••••••"
                autoComplete={mode === "signin" ? "current-password" : "new-password"}
              />

              {err && (
                <div className="bg-danger/10 border border-danger/30 rounded-lg px-3 py-2 text-danger text-xs">
                  {err}
                </div>
              )}

              <button
                type="submit"
                disabled={busy || !email || !password}
                className="w-full py-2.5 bg-accent hover:bg-accent-h disabled:opacity-40 disabled:cursor-not-allowed text-white font-semibold rounded-xl transition-colors text-sm flex items-center justify-center gap-2"
              >
                {busy && <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />}
                {mode === "signin" ? "Sign in" : "Create account"}
              </button>
            </form>
          </div>

          {/* Toggle */}
          <p className="text-center text-sm text-text2 mt-4">
            {mode === "signin" ? "Don't have an account?" : "Already have an account?"}{" "}
            <button
              onClick={() => { setMode(mode === "signin" ? "signup" : "signin"); setErr(null); }}
              className="text-accent hover:text-accent-h font-medium"
            >
              {mode === "signin" ? "Sign up free" : "Sign in"}
            </button>
          </p>

          <p className="text-center text-xs text-muted mt-4">
            By continuing, you agree to our{" "}
            <Link href="/terms" className="underline hover:text-text2">Terms</Link>
            {" "}and{" "}
            <Link href="/privacy" className="underline hover:text-text2">Privacy Policy</Link>.
          </p>
        </div>
      </main>
    </div>
  );
}

function OAuthButton({
  onClick, disabled, icon, label, dark,
}: {
  onClick: () => void;
  disabled: boolean;
  icon: React.ReactNode;
  label: string;
  dark?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`w-full flex items-center justify-center gap-2.5 py-2.5 px-4 rounded-xl border text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
        dark
          ? "bg-[#24292e] hover:bg-[#2f363d] border-white/10 text-white"
          : "bg-surface-2 hover:bg-border border-border text-text1"
      }`}
    >
      {icon}
      {label}
    </button>
  );
}

function FormField({
  label, type, value, onChange, placeholder, autoComplete,
}: {
  label: string;
  type: string;
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  autoComplete?: string;
}) {
  return (
    <div>
      <label className="block text-xs text-text2 mb-1">{label}</label>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        autoComplete={autoComplete}
        required
        className="w-full bg-bg border border-border rounded-xl px-3 py-2.5 text-sm text-text1 placeholder-muted outline-none focus:border-accent transition-colors"
      />
    </div>
  );
}

function friendlyError(e: unknown): string {
  const msg = e instanceof Error ? e.message : String(e);
  if (msg.includes("user-not-found") || msg.includes("wrong-password") || msg.includes("invalid-credential"))
    return "Invalid email or password.";
  if (msg.includes("email-already-in-use")) return "An account with this email already exists.";
  if (msg.includes("weak-password")) return "Password should be at least 6 characters.";
  if (msg.includes("too-many-requests")) return "Too many attempts. Please try again later.";
  return msg;
}

function GitHubIcon() {
  return (
    <svg className="w-4 h-4" viewBox="0 0 16 16" fill="currentColor">
      <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z" />
    </svg>
  );
}

function GoogleIcon() {
  return (
    <svg className="w-4 h-4" viewBox="0 0 24 24">
      <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
      <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
      <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
      <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
    </svg>
  );
}

