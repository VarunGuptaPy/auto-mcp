"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function LandingPage() {
  const router = useRouter();
  const [url, setUrl] = useState("");
  const [maxSteps, setMaxSteps] = useState<number | "">(0); // 0 = unlimited
  const [githubRepo, setGithubRepo] = useState("");
  const [githubToken, setGithubToken] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
      }
      // Token is included only if a repo was specified.
      // It travels over HTTPS and is never persisted to disk on the server.
      if (githubRepo.trim() && githubToken.trim()) {
        body.github_token = githubToken.trim();
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

          {/* GitHub repo section */}
          <div className="border border-border rounded-lg p-4 space-y-3">
            <div>
              <p className="text-xs font-medium text-text1 mb-0.5">GitHub Repository <span className="text-muted font-normal">(optional)</span></p>
              <p className="text-[11px] text-text2 leading-relaxed">
                Provide the source code so auto-mcp can discover all routes — not just the ones
                the browser visits. Routes from code are merged with browser observations.
              </p>
            </div>

            <div>
              <label className="block text-xs text-text2 mb-1.5">Repository URL or <code className="text-accent">owner/repo</code></label>
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

            {githubRepo.trim() && (
              <div>
                <label className="block text-xs text-text2 mb-1.5">
                  GitHub Personal Access Token{" "}
                  <span className="text-muted">(needed for private repos)</span>
                </label>
                <input
                  type="password"
                  value={githubToken}
                  onChange={(e) => setGithubToken(e.target.value)}
                  placeholder="ghp_…"
                  autoComplete="off"
                  className="w-full bg-bg border border-border rounded-lg px-3 py-2 text-sm text-text1 placeholder-muted outline-none focus:border-accent transition-colors"
                />
                <p className="text-[11px] text-muted mt-1.5 leading-relaxed">
                  🔒 Token is used only to fetch repository files and is never written to disk.
                  Requires at minimum <code>repo:read</code> scope for private repositories.
                </p>
              </div>
            )}
          </div>

          {/* Advanced options */}
          <details className="text-sm text-text2">
            <summary className="cursor-pointer select-none text-xs text-text2 hover:text-text1 transition-colors">
              Advanced options
            </summary>
            <div className="mt-4 space-y-3">
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
          <a href="https://www.anthropic.com" target="_blank" rel="noreferrer" className="text-accent hover:text-accent-h">
            Claude
          </a>{" "}
          + Playwright · Source code analyzed locally with ChromaDB
        </p>
      </div>
    </main>
  );
}
