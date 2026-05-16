"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

interface GitHubUser {
  login: string;
  avatar_url: string;
  name: string | null;
}

export default function LandingPage() {
  const router = useRouter();
  const [url, setUrl] = useState("");
  const [maxSteps, setMaxSteps] = useState<number | "">(0);
  const [githubRepo, setGithubRepo] = useState("");
  const [githubToken, setGithubToken] = useState("");
  const [showPatInput, setShowPatInput] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // OAuth state
  const [oauthEnabled, setOauthEnabled] = useState(false);
  const [oauthConnecting, setOauthConnecting] = useState(false);
  const [githubUser, setGithubUser] = useState<GitHubUser | null>(null);
  const githubSessionId = useRef<string | null>(null);

  useEffect(() => {
    fetch("/api/auth/github/config")
      .then((r) => r.json())
      .then((d) => setOauthEnabled(!!d.enabled))
      .catch(() => setOauthEnabled(false));
  }, []);

  // Listen for OAuth popup postMessage
  useEffect(() => {
    function onMessage(e: MessageEvent) {
      if (
        e.origin !== window.location.origin ||
        e.data?.type !== "github_oauth_success"
      )
        return;
      const sid = e.data.sessionId as string;
      githubSessionId.current = sid;
      fetch(`/api/auth/github/me?session_id=${encodeURIComponent(sid)}`)
        .then((r) => r.json())
        .then((user) => {
          setGithubUser(user);
          setOauthConnecting(false);
        })
        .catch(() => setOauthConnecting(false));
    }
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, []);

  async function connectGitHub() {
    const sid = crypto.randomUUID();
    setOauthConnecting(true);

    const res = await fetch(
      `/api/auth/github/start?session_id=${encodeURIComponent(sid)}`
    );
    if (!res.ok) {
      setOauthConnecting(false);
      setError("GitHub OAuth failed — is GITHUB_CLIENT_ID set in .env?");
      return;
    }
    const { authorize_url } = await res.json();

    const popup = window.open(
      authorize_url,
      "github-oauth",
      "width=600,height=700,scrollbars=yes"
    );

    const poll = setInterval(() => {
      if (popup?.closed) {
        clearInterval(poll);
        setOauthConnecting(false);
      }
    }, 500);
  }

  function disconnectGitHub() {
    githubSessionId.current = null;
    setGithubUser(null);
    setShowPatInput(false);
  }

  async function submit() {
    const trimmed = url.trim();
    if (!trimmed) return;

    setError(null);
    setLoading(true);

    try {
      const body: Record<string, unknown> = {
        url: trimmed,
        max_steps: maxSteps || null,
      };

      if (githubRepo.trim()) {
        body.github_repo = githubRepo.trim();
        if (githubSessionId.current) {
          body.github_session_id = githubSessionId.current;
        } else if (githubToken.trim()) {
          body.github_token = githubToken.trim();
        }
      }

      const res = await fetch("/api/jobs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      const data = await res.json();
      if (!res.ok) {
        const detail = data.detail;
        if (Array.isArray(detail)) {
          setError(detail.map((e: { msg: string }) => e.msg).join(". "));
        } else {
          setError(typeof detail === "string" ? detail : "Something went wrong.");
        }
        return;
      }
      router.push(`/jobs/${data.job_id}`);
    } catch (e) {
      setError(`Network error: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="min-h-screen flex items-center justify-center px-4 py-12">
      <div className="w-full max-w-[560px]">
        {/* Logo */}
        <h1 className="font-mono text-[22px] font-medium mb-2">
          <span className="text-accent">auto</span>-mcp
        </h1>
        <p className="text-text2 text-[15px] mb-8">
          Paste any URL. Watch a browser agent map it. Download a ready-to-run MCP server.
        </p>

        {/* Disclaimer */}
        <div className="bg-yellow-950/40 border border-yellow-800/50 rounded-lg px-4 py-3 text-yellow-400/90 text-xs leading-relaxed mb-5">
          ⚠ auto-mcp drives real browsers against the URLs you submit.
          Only use it on sites you own or have explicit permission to test.
          You are responsible for complying with each site&apos;s terms of service.
        </div>

        {/* Card */}
        <div className="bg-surface border border-border rounded-xl p-5 space-y-4">

          {/* URL row */}
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
                className="flex-1 bg-bg border border-border rounded-lg px-3 py-2.5 text-[15px] text-text1 placeholder-muted outline-none focus:border-accent transition-colors"
              />
              <button
                onClick={submit}
                disabled={loading || !url.trim()}
                className="px-4 py-2.5 bg-accent hover:bg-accent-h disabled:opacity-40 disabled:cursor-not-allowed rounded-lg text-white text-sm font-medium transition-colors whitespace-nowrap"
              >
                {loading ? (
                  <span className="flex items-center gap-2">
                    <span className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    Submitting…
                  </span>
                ) : (
                  "Explore →"
                )}
              </button>
            </div>
          </div>

          {/* ── GitHub section ── */}
          <div className="border border-border rounded-lg overflow-hidden">
            {/* Header */}
            <div className="px-4 pt-3 pb-2">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs font-medium text-text1">
                    GitHub Repository{" "}
                    <span className="text-muted font-normal">(optional)</span>
                  </p>
                  <p className="text-[11px] text-text2 mt-0.5 leading-relaxed">
                    Connect a repo so auto-mcp can discover routes the browser
                    doesn&apos;t visit and detect required environment variables.
                  </p>
                </div>
              </div>
            </div>

            {/* GitHub connect / connected state */}
            <div className="px-4 pb-3 space-y-3">
              {/* ── Not connected ── */}
              {!githubUser && (
                <>
                  {oauthEnabled && (
                    <button
                      type="button"
                      onClick={connectGitHub}
                      disabled={oauthConnecting}
                      className="w-full flex items-center justify-center gap-2.5 px-3 py-2.5 bg-[#24292e] hover:bg-[#2f363d] disabled:opacity-50 disabled:cursor-not-allowed rounded-lg text-white text-sm font-medium transition-colors border border-white/10"
                    >
                      {oauthConnecting ? (
                        <>
                          <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                          Waiting for GitHub…
                        </>
                      ) : (
                        <>
                          <GitHubIcon />
                          Sign in with GitHub
                        </>
                      )}
                    </button>
                  )}

                  {/* PAT toggle / fallback */}
                  {oauthEnabled ? (
                    <button
                      type="button"
                      onClick={() => setShowPatInput((v) => !v)}
                      className="block text-[11px] text-muted hover:text-text2 transition-colors"
                    >
                      {showPatInput
                        ? "Hide token"
                        : "Or use a Personal Access Token"}
                    </button>
                  ) : (
                    <p className="text-[11px] text-text2">
                      Enter a Personal Access Token to access private repositories.
                    </p>
                  )}

                  {(showPatInput || !oauthEnabled) && (
                    <div>
                      <label className="block text-xs text-text2 mb-1">
                        Personal Access Token
                      </label>
                      <input
                        type="password"
                        value={githubToken}
                        onChange={(e) => setGithubToken(e.target.value)}
                        placeholder="ghp_…"
                        autoComplete="off"
                        className="w-full bg-bg border border-border rounded-lg px-3 py-2 text-sm text-text1 placeholder-muted outline-none focus:border-accent transition-colors"
                      />
                      <p className="text-[11px] text-muted mt-1 leading-relaxed">
                        Never written to disk. Requires{" "}
                        <code>repo:read</code> scope for private repos.
                      </p>
                    </div>
                  )}
                </>
              )}

              {/* ── Connected ── */}
              {githubUser && (
                <div className="flex items-center justify-between bg-[#238636]/15 border border-[#238636]/40 rounded-lg px-3 py-2">
                  <div className="flex items-center gap-2">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={githubUser.avatar_url}
                      alt={githubUser.login}
                      className="w-6 h-6 rounded-full"
                    />
                    <div>
                      <p className="text-xs text-text1 font-medium">
                        {githubUser.name ?? githubUser.login}
                      </p>
                      <p className="text-[11px] text-muted">
                        @{githubUser.login}
                      </p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={disconnectGitHub}
                    className="text-[11px] text-muted hover:text-text2 transition-colors"
                  >
                    Disconnect
                  </button>
                </div>
              )}

              {/* Repo URL — shown when connected (OAuth) or always if no OAuth */}
              {(githubUser || !oauthEnabled || showPatInput || githubToken) && (
                <div>
                  <label className="block text-xs text-text2 mb-1">
                    Repository URL or{" "}
                    <code className="text-accent">owner/repo</code>
                  </label>
                  <input
                    type="text"
                    value={githubRepo}
                    onChange={(e) => setGithubRepo(e.target.value)}
                    placeholder="https://github.com/owner/repo"
                    autoComplete="off"
                    spellCheck={false}
                    className="w-full bg-bg border border-border rounded-lg px-3 py-2 text-sm text-text1 placeholder-muted outline-none focus:border-accent transition-colors"
                  />
                </div>
              )}

              {/* Also show repo field when oauth not enabled */}
              {!githubUser && oauthEnabled && !showPatInput && !githubToken && (
                <div>
                  <label className="block text-xs text-text2 mb-1">
                    Repository URL or{" "}
                    <code className="text-accent">owner/repo</code>
                    <span className="text-muted font-normal ml-1">(public repos only without sign-in)</span>
                  </label>
                  <input
                    type="text"
                    value={githubRepo}
                    onChange={(e) => setGithubRepo(e.target.value)}
                    placeholder="https://github.com/owner/repo"
                    autoComplete="off"
                    spellCheck={false}
                    className="w-full bg-bg border border-border rounded-lg px-3 py-2 text-sm text-text1 placeholder-muted outline-none focus:border-accent transition-colors"
                  />
                </div>
              )}
            </div>
          </div>

          {/* Advanced options */}
          <details className="text-sm text-text2">
            <summary className="cursor-pointer select-none text-xs text-text2 hover:text-text1 transition-colors">
              Advanced options
            </summary>
            <div className="mt-4 space-y-3">
              <div>
                <label className="block text-xs text-text2 mb-1.5">
                  Max steps{" "}
                  <span className="text-muted">(leave blank for unlimited)</span>
                </label>
                <input
                  type="number"
                  value={maxSteps === 0 ? "" : maxSteps}
                  onChange={(e) =>
                    setMaxSteps(
                      e.target.value === "" ? 0 : Math.max(1, +e.target.value)
                    )
                  }
                  min={1}
                  placeholder="∞"
                  className="w-28 bg-bg border border-border rounded-lg px-3 py-2 text-sm text-text1 placeholder-muted outline-none focus:border-accent transition-colors"
                />
              </div>
              <div className="text-xs text-text2 bg-bg/60 border border-border rounded-lg p-3">
                If the site requires login, the agent will pause and ask for
                credentials when it reaches the login page.
              </div>
            </div>
          </details>

          {/* Error */}
          {error && (
            <div className="bg-red-950/50 border border-danger/50 rounded-lg px-4 py-3 text-danger text-sm">
              {error}
            </div>
          )}
        </div>

        {/* Footer */}
        <p className="mt-4 text-center text-xs text-muted">
          Powered by{" "}
          <a
            href="https://www.anthropic.com"
            target="_blank"
            rel="noreferrer"
            className="text-accent hover:text-accent-h"
          >
            Claude
          </a>{" "}
          + Playwright · Source code analyzed locally with ChromaDB
        </p>
      </div>
    </main>
  );
}

function GitHubIcon() {
  return (
    <svg
      height="16"
      width="16"
      viewBox="0 0 16 16"
      fill="currentColor"
      aria-hidden="true"
    >
      <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0 0 16 8c0-4.42-3.58-8-8-8z" />
    </svg>
  );
}
