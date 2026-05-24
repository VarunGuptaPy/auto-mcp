"use client";
export const dynamic = "force-dynamic";

import { Suspense, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useAuth, FREE_JOB_LIMIT } from "@/lib/auth-context";
import { saveJobStart } from "@/lib/firestore";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";

export default function CreatePage() {
  return (
    <Suspense fallback={
      <div className="flex flex-col min-h-screen">
        <Navbar />
        <div className="flex-1 flex items-center justify-center">
          <div className="w-5 h-5 border-2 border-accent/30 border-t-accent rounded-full animate-spin" />
        </div>
      </div>
    }>
      <CreateContent />
    </Suspense>
  );
}

interface GitHubUser {
  login: string;
  avatar_url: string;
}

function CreateContent() {
  const { user, plan, loading } = useAuth();
  const router = useRouter();
  const params = useSearchParams();

  const [url,        setUrl]        = useState(params.get("url") ?? "");
  const [maxSteps,   setMaxSteps]   = useState<number | "">(0);
  const [submitting, setSubmitting] = useState(false);
  const [error,      setError]      = useState<string | null>(null);
  const [localAgent, setLocalAgent] = useState(false);

  // GitHub state
  const [githubToken,  setGithubToken]  = useState("");
  const [githubRepos,  setGithubRepos]  = useState<string[]>([]);
  const [showPat,      setShowPat]      = useState(false);
  const [oauthEnabled, setOauthEnabled] = useState(false);
  const [oauthBusy,    setOauthBusy]    = useState(false);
  const [githubUser,   setGithubUser]   = useState<GitHubUser | null>(null);
  const sessionRef = useRef<string | null>(null);

  // Auth guard
  useEffect(() => {
    if (!loading && !user) router.replace("/auth?next=/create");
  }, [user, loading, router]);

  // Check if server supports GitHub OAuth
  useEffect(() => {
    fetch("/api/auth/github/config")
      .then((r) => r.ok ? r.json() : { enabled: false })
      .then((d) => setOauthEnabled(d.enabled))
      .catch(() => setOauthEnabled(false));
  }, []);

  // Listen for OAuth popup result
  useEffect(() => {
    async function onMessage(e: MessageEvent) {
      if (e.data?.type !== "github_oauth_success") return;
      const sessionId: string = e.data.sessionId;
      if (!sessionId) return;
      sessionRef.current = sessionId;
      // Fetch user profile now that the token is stored server-side
      try {
        const res = await fetch(`/api/auth/github/me?session_id=${encodeURIComponent(sessionId)}`);
        if (res.ok) {
          const u = await res.json();
          setGithubUser({ login: u.login, avatar_url: u.avatar_url });
        }
      } catch {}
      setOauthBusy(false);
    }
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, []);

  async function connectGitHub() {
    setOauthBusy(true);
    const sessionId = crypto.randomUUID();
    sessionRef.current = sessionId;
    try {
      const res = await fetch(`/api/auth/github/start?session_id=${encodeURIComponent(sessionId)}`);
      if (!res.ok) throw new Error("Failed to start OAuth");
      const { authorize_url } = await res.json();
      const w = window.open(authorize_url, "gh-oauth", "width=600,height=700");
      if (!w) window.location.href = authorize_url;
    } catch {
      setOauthBusy(false);
    }
  }

  async function submit() {
    if (!url.trim() || !user) return;
    setError(null);
    setSubmitting(true);
    try {
      const validRepos = githubRepos.filter(Boolean);
      const body: Record<string, unknown> = {
        url: url.trim(),
        max_steps: maxSteps || null,
        local_agent: localAgent,
        ...(validRepos.length > 0 && { github_repos: validRepos }),
        ...(sessionRef.current   && { github_session_id: sessionRef.current }),
        ...(githubToken.trim()   && { github_token: githubToken.trim() }),
      };

      const res = await fetch("/api/jobs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) {
        const detail = data.detail;
        setError(Array.isArray(detail) ? detail.map((e: { msg: string }) => e.msg).join(". ") : String(detail || "Something went wrong."));
        return;
      }

      // Track in Firestore
      try { await saveJobStart(user.uid, data.job_id, url.trim()); } catch {}

      // Store agent token if returned (local agent mode)
      if (data.agent_token) {
        sessionStorage.setItem(`agent_token:${data.job_id}`, data.agent_token);
      }

      router.push(`/jobs/${data.job_id}`);
    } catch (e) {
      setError(`Network error: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setSubmitting(false);
    }
  }

  if (loading || !user) {
    return (
      <div className="flex flex-col min-h-screen">
        <Navbar />
        <div className="flex-1 flex items-center justify-center">
          <div className="w-5 h-5 border-2 border-accent/30 border-t-accent rounded-full animate-spin" />
        </div>
      </div>
    );
  }

  const isPro    = plan?.plan === "pro";
  const atLimit  = !isPro && (plan?.jobsThisMonth ?? 0) >= FREE_JOB_LIMIT;

  return (
    <div className="flex flex-col min-h-screen">
      <Navbar />
      <main className="flex-1 flex items-start justify-center px-4 py-12">
        <div className="w-full max-w-[540px]">

          {/* Heading */}
          <h1 className="text-2xl font-bold text-text1 mb-1">New MCP server</h1>
          <p className="text-sm text-text2 mb-7">
            Point Gichku at any URL and download a Claude-ready MCP server.
          </p>

          {/* Limit warning */}
          {atLimit && (
            <div className="bg-warn/10 border border-warn/30 rounded-xl px-4 py-3 text-warn text-sm mb-5">
              You&apos;ve used all {FREE_JOB_LIMIT} free jobs this month.{" "}
              <a href="/pricing" className="underline font-medium">Upgrade to Pro</a> for unlimited.
            </div>
          )}

          {/* Disclaimer */}
          <div className="bg-surface border border-border-sub rounded-xl px-4 py-3 text-text2 text-xs leading-relaxed mb-5">
            ⚠ Gichku drives real browsers. Only submit URLs you own or have explicit permission to test. You are responsible for each site&apos;s terms of service.
          </div>

          {/* Form card */}
          <div className="bg-surface border border-border rounded-2xl p-5 space-y-5">

            {/* URL */}
            <div>
              <label className="block text-xs text-text2 mb-1.5">Target URL</label>
              <div className="flex gap-2">
                <input
                  type="url"
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && submit()}
                  placeholder="https://news.ycombinator.com"
                  autoComplete="off"
                  spellCheck={false}
                  disabled={atLimit}
                  className="flex-1 bg-bg border border-border rounded-xl px-3 py-2.5 text-[15px] text-text1 placeholder-muted outline-none focus:border-accent transition-colors disabled:opacity-40"
                />
                <button
                  onClick={submit}
                  disabled={submitting || !url.trim() || atLimit}
                  className="px-5 py-2.5 bg-accent hover:bg-accent-h disabled:opacity-40 disabled:cursor-not-allowed rounded-xl text-white text-sm font-semibold transition-colors whitespace-nowrap"
                >
                  {submitting ? (
                    <span className="flex items-center gap-2">
                      <span className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                      Starting…
                    </span>
                  ) : "Explore →"}
                </button>
              </div>
            </div>

            {/* Execution mode */}
            <div>
              <label className="block text-xs text-text2 mb-2">Execution mode</label>
              <div className="space-y-2">
                <label className="flex items-start gap-3 cursor-pointer">
                  <input
                    type="radio"
                    name="exec-mode"
                    checked={!localAgent}
                    onChange={() => setLocalAgent(false)}
                    className="mt-0.5 accent-accent"
                  />
                  <div>
                    <span className="text-sm text-text1">Run on server</span>
                    <span className="text-xs text-muted ml-2">We run the browser for you. Easy, no setup needed.</span>
                  </div>
                </label>
                <label className="flex items-start gap-3 cursor-pointer">
                  <input
                    type="radio"
                    name="exec-mode"
                    checked={localAgent}
                    onChange={() => setLocalAgent(true)}
                    className="mt-0.5 accent-accent"
                  />
                  <div>
                    <span className="text-sm text-text1">Run locally</span>
                    <span className="text-xs text-muted ml-2">Faster, uses your own machine. Download a script after creating the job.</span>
                  </div>
                </label>
              </div>
              {localAgent && (
                <div className="mt-2.5 bg-bg border border-border rounded-lg px-3 py-2.5 text-xs text-text2 leading-relaxed">
                  Your browser will explore the site. We handle the AI. Requires Python + Playwright.
                </div>
              )}
            </div>

            {/* GitHub code analysis */}
            <div>
              <label className="block text-xs text-text2 mb-2">
                GitHub repo <span className="text-muted">(optional — improves MCP quality)</span>
              </label>

              {githubUser ? (
                <div className="flex items-center gap-2 mb-2">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={githubUser.avatar_url} alt="" className="w-5 h-5 rounded-full" />
                  <span className="text-sm text-text1">{githubUser.login}</span>
                  <button
                    type="button"
                    onClick={() => { setGithubUser(null); sessionRef.current = null; setGithubRepos([]); }}
                    className="ml-auto text-xs text-muted hover:text-danger"
                  >
                    Disconnect
                  </button>
                </div>
              ) : oauthEnabled ? (
                <button
                  type="button"
                  onClick={connectGitHub}
                  disabled={oauthBusy}
                  className="flex items-center gap-2 px-3 py-2 rounded-xl border border-border bg-surface-2 hover:bg-border text-sm text-text1 transition-colors disabled:opacity-50 mb-2"
                >
                  <GitHubIcon />
                  {oauthBusy ? "Connecting…" : "Connect GitHub"}
                </button>
              ) : null}

              {/* Manual repo URLs */}
              <div className="space-y-1.5">
                {githubRepos.map((r, i) => (
                  <div key={i} className="flex gap-2">
                    <input
                      type="url"
                      value={r}
                      onChange={(e) => setGithubRepos(prev => prev.map((v, j) => j === i ? e.target.value : v))}
                      placeholder="https://github.com/owner/repo"
                      className="flex-1 bg-bg border border-border rounded-lg px-3 py-2 text-sm text-text1 placeholder-muted outline-none focus:border-accent"
                    />
                    <button
                      type="button"
                      onClick={() => setGithubRepos(prev => prev.filter((_, j) => j !== i))}
                      className="text-muted hover:text-danger px-2"
                    >
                      ✕
                    </button>
                  </div>
                ))}
                <button
                  type="button"
                  onClick={() => setGithubRepos(prev => [...prev, ""])}
                  className="text-xs text-accent hover:text-accent-h"
                >
                  + Add repo URL
                </button>
              </div>

              {/* PAT fallback */}
              <button
                type="button"
                onClick={() => setShowPat(v => !v)}
                className="mt-2 text-xs text-muted hover:text-text2"
              >
                {showPat ? "Hide" : "Use a Personal Access Token instead"}
              </button>
              {showPat && (
                <input
                  type="password"
                  value={githubToken}
                  onChange={(e) => setGithubToken(e.target.value)}
                  placeholder="ghp_…"
                  className="mt-1.5 w-full bg-bg border border-border rounded-lg px-3 py-2 text-sm text-text1 placeholder-muted outline-none focus:border-accent font-mono"
                />
              )}
            </div>

            {/* Advanced */}
            <details className="text-sm text-text2">
              <summary className="cursor-pointer select-none text-xs text-text2 hover:text-text1 flex items-center gap-1">
                <span>Advanced options</span>
                <ChevronIcon />
              </summary>
              <div className="mt-3 space-y-3">
                <div>
                  <label className="block text-xs text-text2 mb-1.5">
                    Max steps <span className="text-muted">(leave blank for unlimited)</span>
                  </label>
                  <input
                    type="number"
                    value={maxSteps === 0 ? "" : maxSteps}
                    onChange={(e) => setMaxSteps(e.target.value === "" ? 0 : Math.max(1, +e.target.value))}
                    min={1}
                    placeholder="∞"
                    className="w-28 bg-bg border border-border rounded-lg px-3 py-2 text-sm text-text1 placeholder-muted outline-none focus:border-accent"
                  />
                </div>
                <div className="text-xs text-text2 bg-bg/60 border border-border rounded-lg p-3">
                  If the site requires login, the agent will pause and ask for credentials when it reaches the login page.
                </div>
              </div>
            </details>

            {error && (
              <div className="bg-danger/10 border border-danger/30 rounded-xl px-4 py-3 text-danger text-sm">
                {error}
              </div>
            )}
          </div>
        </div>
      </main>
      <Footer />
    </div>
  );
}

function ChevronIcon() {
  return (
    <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
    </svg>
  );
}

function GitHubIcon() {
  return (
    <svg className="w-4 h-4" viewBox="0 0 16 16" fill="currentColor">
      <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z" />
    </svg>
  );
}
