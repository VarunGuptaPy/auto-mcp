"use client";
export const dynamic = "force-dynamic";

import { Suspense, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useAuth, FREE_JOB_LIMIT } from "@/lib/auth-context";
import { saveJobStart } from "@/lib/firestore";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";

interface GitHubUser {
  login: string;
  avatar_url: string;
  name: string | null;
}

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

function CreateContent() {
  const { user, plan, loading } = useAuth();
  const router = useRouter();
  const params = useSearchParams();

  const [url,          setUrl]          = useState(params.get("url") ?? "");
  const [maxSteps,     setMaxSteps]     = useState<number | "">(0);
  const [githubRepos,  setGithubRepos]  = useState<string[]>([""]);
  const [githubToken,  setGithubToken]  = useState("");
  const [showPat,      setShowPat]      = useState(false);
  const [submitting,   setSubmitting]   = useState(false);
  const [error,        setError]        = useState<string | null>(null);
  const [oauthEnabled, setOauthEnabled] = useState(false);
  const [oauthBusy,    setOauthBusy]    = useState(false);
  const [githubUser,   setGithubUser]   = useState<GitHubUser | null>(null);
  const [localAgent,   setLocalAgent]   = useState(false);
  const sessionRef = useRef<string | null>(null);

  // Auth guard
  useEffect(() => {
    if (!loading && !user) router.replace("/auth?next=/create");
  }, [user, loading, router]);

  // Check OAuth availability
  useEffect(() => {
    fetch("/api/auth/github/config")
      .then((r) => r.json())
      .then((d) => setOauthEnabled(!!d.enabled))
      .catch(() => setOauthEnabled(false));
  }, []);

  // Listen for OAuth popup
  useEffect(() => {
    function onMessage(e: MessageEvent) {
      if (e.origin !== window.location.origin || e.data?.type !== "github_oauth_success") return;
      const sid = e.data.sessionId as string;
      sessionRef.current = sid;
      fetch(`/api/auth/github/me?session_id=${encodeURIComponent(sid)}`)
        .then((r) => r.json())
        .then((u) => { setGithubUser(u); setOauthBusy(false); })
        .catch(() => setOauthBusy(false));
    }
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, []);

  async function connectGitHub() {
    const sid = crypto.randomUUID();
    setOauthBusy(true);
    const res = await fetch(`/api/auth/github/start?session_id=${encodeURIComponent(sid)}`);
    if (!res.ok) { setOauthBusy(false); setError("GitHub OAuth failed — GITHUB_CLIENT_ID not configured."); return; }
    const { authorize_url } = await res.json();
    const popup = window.open(authorize_url, "github-oauth", "width=600,height=700,scrollbars=yes");
    const poll = setInterval(() => { if (popup?.closed) { clearInterval(poll); setOauthBusy(false); } }, 500);
  }

  async function submit() {
    if (!url.trim() || !user) return;
    setError(null);
    setSubmitting(true);
    try {
      const body: Record<string, unknown> = {
        url: url.trim(),
        max_steps: maxSteps || null,
        local_agent: localAgent,
      };
      const validRepos = githubRepos.map((r) => r.trim()).filter(Boolean);
      if (validRepos.length > 0) {
        body.github_repos = validRepos;
        if (sessionRef.current)      body.github_session_id = sessionRef.current;
        else if (githubToken.trim()) body.github_token      = githubToken.trim();
      }

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
            Point auto-mcp at any URL and download a Claude-ready MCP server.
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
            ⚠ auto-mcp drives real browsers. Only submit URLs you own or have explicit permission to test. You are responsible for each site&apos;s terms of service.
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

            {/* GitHub section */}
            <div className="border border-border rounded-xl overflow-hidden">
              <div className="px-4 pt-3 pb-2">
                <p className="text-xs font-medium text-text1">
                  GitHub Repository{" "}
                  <span className="text-muted font-normal">(optional)</span>
                  {!isPro && (
                    <span className="ml-1.5 text-[10px] font-medium bg-accent/10 text-accent border border-accent/20 rounded px-1.5 py-0.5">
                      Pro
                    </span>
                  )}
                </p>
                <p className="text-[11px] text-text2 mt-0.5 leading-relaxed">
                  Connect a repo so auto-mcp can discover routes the browser doesn&apos;t visit.
                </p>
              </div>

              <div className="px-4 pb-3 space-y-3">
                {!githubUser && oauthEnabled && (
                  <button
                    type="button"
                    onClick={connectGitHub}
                    disabled={oauthBusy || (!isPro)}
                    className="w-full flex items-center justify-center gap-2.5 px-3 py-2.5 bg-[#24292e] hover:bg-[#2f363d] disabled:opacity-40 disabled:cursor-not-allowed rounded-lg text-white text-sm font-medium transition-colors border border-white/10"
                  >
                    {oauthBusy ? (
                      <><span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> Connecting…</>
                    ) : (
                      <><GitHubIcon /> Sign in with GitHub</>
                    )}
                  </button>
                )}

                {!isPro && (
                  <p className="text-[11px] text-muted">
                    GitHub integration requires{" "}
                    <a href="/pricing" className="text-accent hover:text-accent-h">Pro plan</a>.
                  </p>
                )}

                {oauthEnabled && isPro && (
                  <button
                    type="button"
                    onClick={() => setShowPat((v) => !v)}
                    className="text-[11px] text-muted hover:text-text2 transition-colors"
                  >
                    {showPat ? "Hide token" : "Or use a Personal Access Token"}
                  </button>
                )}

                {(showPat || !oauthEnabled) && isPro && (
                  <div>
                    <label className="block text-xs text-text2 mb-1">Personal Access Token</label>
                    <input
                      type="password"
                      value={githubToken}
                      onChange={(e) => setGithubToken(e.target.value)}
                      placeholder="ghp_…"
                      className="w-full bg-bg border border-border rounded-lg px-3 py-2 text-sm text-text1 placeholder-muted outline-none focus:border-accent"
                    />
                  </div>
                )}

                {githubUser && (
                  <div className="flex items-center justify-between bg-success/10 border border-success/30 rounded-lg px-3 py-2">
                    <div className="flex items-center gap-2">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={githubUser.avatar_url} alt="" className="w-6 h-6 rounded-full" />
                      <div>
                        <p className="text-xs text-text1 font-medium">{githubUser.name ?? githubUser.login}</p>
                        <p className="text-[11px] text-muted">@{githubUser.login}</p>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => { setGithubUser(null); sessionRef.current = null; }}
                      className="text-[11px] text-muted hover:text-text2"
                    >
                      Disconnect
                    </button>
                  </div>
                )}

                {(githubUser || isPro) && (
                  <div className="space-y-2">
                    <label className="block text-xs text-text2">
                      Repository URLs or <code className="text-accent">owner/repo</code>
                    </label>
                    {githubRepos.map((repo, idx) => (
                      <div key={idx} className="flex gap-2 items-center">
                        <input
                          type="text"
                          value={repo}
                          onChange={(e) => {
                            const next = [...githubRepos];
                            next[idx] = e.target.value;
                            setGithubRepos(next);
                          }}
                          placeholder="https://github.com/owner/repo"
                          autoComplete="off"
                          spellCheck={false}
                          className="flex-1 bg-bg border border-border rounded-lg px-3 py-2 text-sm text-text1 placeholder-muted outline-none focus:border-accent"
                        />
                        {githubRepos.length > 1 && (
                          <button
                            type="button"
                            onClick={() => setGithubRepos(githubRepos.filter((_, i) => i !== idx))}
                            className="text-muted hover:text-danger transition-colors text-lg leading-none px-1"
                            aria-label="Remove repo"
                          >
                            ×
                          </button>
                        )}
                      </div>
                    ))}
                    <button
                      type="button"
                      onClick={() => setGithubRepos([...githubRepos, ""])}
                      className="text-[11px] text-accent hover:text-accent-h transition-colors flex items-center gap-1"
                    >
                      <span className="text-base leading-none">+</span> Add another repository
                    </button>
                  </div>
                )}
              </div>
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

function GitHubIcon() {
  return (
    <svg height="16" width="16" viewBox="0 0 16 16" fill="currentColor">
      <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0 0 16 8c0-4.42-3.58-8-8-8z" />
    </svg>
  );
}

function ChevronIcon() {
  return (
    <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
    </svg>
  );
}
