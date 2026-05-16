"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useAuth, FREE_JOB_LIMIT } from "@/lib/auth-context";
import { listJobs, type JobRecord } from "@/lib/firestore";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";

export default function DashboardPage() {
  const { user, plan, loading } = useAuth();
  const router = useRouter();
  const [jobs,     setJobs]     = useState<JobRecord[]>([]);
  const [fetching, setFetching] = useState(true);

  useEffect(() => {
    if (!loading && !user) router.replace("/auth?next=/dashboard");
  }, [user, loading, router]);

  useEffect(() => {
    if (!user) return;
    listJobs(user.uid)
      .then(setJobs)
      .catch(console.error)
      .finally(() => setFetching(false));
  }, [user]);

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

  const isPro = plan?.plan === "pro";
  const used  = plan?.jobsThisMonth ?? 0;
  const total = isPro ? Infinity : FREE_JOB_LIMIT;
  const usagePct = isPro ? 0 : Math.min(100, (used / FREE_JOB_LIMIT) * 100);
  const atLimit  = !isPro && used >= FREE_JOB_LIMIT;

  return (
    <div className="flex flex-col min-h-screen">
      <Navbar />
      <main className="flex-1 max-w-5xl mx-auto w-full px-4 sm:px-6 py-10">

        {/* Top bar */}
        <div className="flex items-start justify-between gap-4 mb-8">
          <div>
            <h1 className="text-2xl font-bold text-text1">
              Welcome back{user.displayName ? `, ${user.displayName.split(" ")[0]}` : ""}
            </h1>
            <p className="text-sm text-text2 mt-1">
              Your MCP servers and generation history
            </p>
          </div>
          <Link
            href="/create"
            className={`shrink-0 px-5 py-2.5 rounded-xl text-sm font-semibold transition-colors ${
              atLimit
                ? "bg-surface border border-border text-muted cursor-not-allowed"
                : "bg-accent hover:bg-accent-h text-white"
            }`}
            onClick={(e) => atLimit && e.preventDefault()}
          >
            + New MCP server
          </Link>
        </div>

        {/* Stats row */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
          <StatCard
            label="Plan"
            value={isPro ? "Pro" : "Free"}
            sub={isPro ? "Unlimited jobs" : `${used}/${FREE_JOB_LIMIT} jobs this month`}
            accent={isPro}
          />
          <StatCard
            label="MCP servers generated"
            value={String(jobs.length)}
            sub="All time"
          />
          <StatCard
            label="Features discovered"
            value={String(jobs.reduce((s, j) => s + j.features, 0))}
            sub="Across all jobs"
          />
        </div>

        {/* Usage bar (free only) */}
        {!isPro && (
          <div className="bg-surface border border-border rounded-2xl p-5 mb-8">
            <div className="flex items-center justify-between mb-2.5">
              <div>
                <p className="text-sm font-medium text-text1">Monthly usage</p>
                <p className="text-xs text-text2 mt-0.5">
                  {used} of {FREE_JOB_LIMIT} free jobs used
                </p>
              </div>
              {atLimit ? (
                <Link
                  href="/pricing"
                  className="text-xs font-medium text-accent hover:text-accent-h border border-accent/30 bg-accent/10 px-3 py-1.5 rounded-lg"
                >
                  Upgrade to Pro →
                </Link>
              ) : (
                <p className="text-xs text-muted">{FREE_JOB_LIMIT - used} remaining</p>
              )}
            </div>
            <div className="h-1.5 bg-border rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full transition-all ${atLimit ? "bg-danger" : "bg-accent"}`}
                style={{ width: `${usagePct}%` }}
              />
            </div>
            {atLimit && (
              <p className="text-xs text-danger mt-2">
                Monthly limit reached. Upgrade to Pro for unlimited MCP servers.
              </p>
            )}
          </div>
        )}

        {/* Job list */}
        <div>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-semibold text-text1">Recent jobs</h2>
            {jobs.length > 0 && (
              <Link href="/create" className="text-xs text-accent hover:text-accent-h">
                + Create new →
              </Link>
            )}
          </div>

          {fetching ? (
            <div className="space-y-3">
              {[1, 2, 3].map((i) => (
                <div key={i} className="h-20 bg-surface border border-border rounded-xl animate-pulse" />
              ))}
            </div>
          ) : jobs.length === 0 ? (
            <EmptyState atLimit={atLimit} />
          ) : (
            <div className="space-y-3">
              {jobs.map((job) => (
                <JobCard key={job.id} job={job} />
              ))}
            </div>
          )}
        </div>
      </main>
      <Footer />
    </div>
  );
}

function StatCard({
  label, value, sub, accent,
}: {
  label: string; value: string; sub: string; accent?: boolean;
}) {
  return (
    <div className={`bg-surface border rounded-2xl p-5 ${accent ? "border-accent/30 bg-accent/5" : "border-border"}`}>
      <p className="text-xs text-text2 mb-1.5">{label}</p>
      <p className={`text-2xl font-bold ${accent ? "text-accent" : "text-text1"}`}>{value}</p>
      <p className="text-xs text-muted mt-1">{sub}</p>
    </div>
  );
}

function JobCard({ job }: { job: JobRecord }) {
  const statusColor: Record<string, string> = {
    done:     "text-success bg-success/10 border-success/30",
    failed:   "text-danger bg-danger/10 border-danger/30",
    queued:   "text-warn bg-warn/10 border-warn/30",
    exploring:"text-accent bg-accent/10 border-accent/30",
  };
  const color = statusColor[job.status] ?? "text-text2 bg-surface-2 border-border";
  const hostname = (() => { try { return new URL(job.url).hostname; } catch { return job.url; } })();
  const date = job.createdAt.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });

  return (
    <Link
      href={job.status === "done" ? `/done/${job.jobId}` : `/jobs/${job.jobId}`}
      className="block bg-surface border border-border hover:border-accent/30 rounded-xl p-4 transition-colors group"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 mb-1">
            <p className="text-sm font-medium text-text1 truncate">
              {job.name || hostname}
            </p>
            <span className={`shrink-0 text-[11px] font-medium px-2 py-0.5 rounded-full border ${color}`}>
              {job.status}
            </span>
          </div>
          <p className="text-xs text-muted font-mono truncate">{job.url}</p>
          {job.features > 0 && (
            <p className="text-xs text-text2 mt-1">{job.features} features discovered</p>
          )}
        </div>
        <div className="text-right shrink-0">
          <p className="text-xs text-muted">{date}</p>
          {job.status === "done" && (
            <span className="text-xs text-accent group-hover:text-accent-h mt-1 block">
              Download →
            </span>
          )}
        </div>
      </div>
    </Link>
  );
}

function EmptyState({ atLimit }: { atLimit: boolean }) {
  return (
    <div className="border border-dashed border-border rounded-2xl p-12 text-center">
      <div className="w-12 h-12 rounded-2xl bg-accent/10 border border-accent/20 flex items-center justify-center mx-auto mb-4">
        <svg className="w-5 h-5 text-accent" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
        </svg>
      </div>
      <h3 className="text-base font-semibold text-text1 mb-2">No MCP servers yet</h3>
      <p className="text-sm text-text2 mb-5 max-w-xs mx-auto">
        Paste any URL to generate your first production-ready MCP server.
      </p>
      {atLimit ? (
        <Link
          href="/pricing"
          className="inline-flex px-5 py-2.5 bg-accent hover:bg-accent-h text-white text-sm font-semibold rounded-xl"
        >
          Upgrade to Pro →
        </Link>
      ) : (
        <Link
          href="/create"
          className="inline-flex px-5 py-2.5 bg-accent hover:bg-accent-h text-white text-sm font-semibold rounded-xl"
        >
          Create your first MCP server →
        </Link>
      )}
    </div>
  );
}
