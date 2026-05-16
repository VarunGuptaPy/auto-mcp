"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import MethodPill from "@/components/MethodPill";
import type { Feature, FeatureSpec, JobState } from "@/lib/types";

export default function DonePage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [job, setJob] = useState<JobState | null>(null);
  const [spec, setSpec] = useState<FeatureSpec | null>(null);
  const [specError, setSpecError] = useState(false);

  useEffect(() => {
    if (!id) return;
    Promise.all([
      fetch(`/api/jobs/${id}`).then((r) => r.json()).catch(() => null),
      fetch(`/api/jobs/${id}/spec`).then((r) => r.json()).catch(() => null),
    ]).then(([jobData, specData]) => {
      if (jobData) setJob(jobData);
      if (specData && !specData.detail) setSpec(specData);
      else setSpecError(true);
    });
  }, [id]);

  const productName = spec?.product_name ?? "mcp_server";
  const safeName = productName.toLowerCase().replace(/\s+/g, "_").replace(/[^a-z0-9_]/g, "").slice(0, 30) || "mcp_server";
  const installSnippet = JSON.stringify(
    { mcpServers: { [safeName]: { command: "python", args: [`/path/to/${safeName}/server.py`] } } },
    null, 2,
  );

  return (
    <div className="flex flex-col min-h-screen">
      {/* Header */}
      <header className="flex items-center gap-4 px-6 py-3.5 border-b border-border bg-surface shrink-0">
        <span className="font-mono font-medium text-text2">
          <span className="text-accent">auto</span>-mcp
        </span>
        <div className="flex-1" />
        <button
          onClick={() => router.push("/")}
          className="text-xs px-3 py-1.5 border border-border rounded-md text-text2 hover:border-muted transition-colors"
        >
          ← New job
        </button>
      </header>

      <main className="flex-1 max-w-3xl mx-auto w-full px-6 py-12">
        {/* Hero */}
        <div className="text-center mb-12">
          <h1 className="text-3xl font-semibold mb-2">MCP server ready ✓</h1>
          <p className="text-text2">
            {spec
              ? `${spec.features.length} features discovered from ${spec.base_url}`
              : job
              ? `${job.features_found} features discovered from ${job.url}`
              : "Loading…"}
          </p>
        </div>

        {/* Download */}
        <div className="text-center mb-14">
          <a
            href={`/api/jobs/${id}/download`}
            className="inline-flex items-center gap-2 px-7 py-3.5 bg-accent hover:bg-accent-h text-white text-base font-medium rounded-xl transition-colors"
          >
            ↓ Download MCP server (.zip)
          </a>
        </div>

        {/* Features */}
        <section className="mb-14">
          <h2 className="text-base font-semibold mb-4 pb-3 border-b border-border">
            Features {spec && `(${spec.features.length})`}
          </h2>
          {specError ? (
            <p className="text-muted text-sm">Could not load feature spec.</p>
          ) : !spec ? (
            <div className="space-y-2">
              {[1, 2, 3].map((i) => (
                <div key={i} className="h-20 bg-surface border border-border rounded-lg animate-pulse" />
              ))}
            </div>
          ) : spec.features.length === 0 ? (
            <p className="text-muted text-sm">No features found.</p>
          ) : (
            <div className="space-y-2">
              {spec.features.map((f) => (
                <FeatureCard key={f.id} feature={f} />
              ))}
            </div>
          )}
        </section>

        {/* Install instructions */}
        <section>
          <h2 className="text-base font-semibold mb-4 pb-3 border-b border-border">
            How to install
          </h2>
          <ol className="text-sm text-text2 space-y-1 mb-4 list-decimal list-inside">
            <li>Unzip the downloaded archive.</li>
            <li>
              Install dependencies:{" "}
              <code className="font-mono text-text1 bg-surface px-1.5 py-0.5 rounded">
                pip install -r requirements.txt
              </code>
            </li>
            <li>Add to your Claude Desktop config:</li>
          </ol>
          <div className="bg-[#0a0a14] border border-border rounded-lg p-4 overflow-x-auto">
            <pre className="font-mono text-xs text-blue-200 whitespace-pre-wrap break-all">
              {installSnippet}
            </pre>
          </div>
          <p className="text-xs text-muted mt-3">
            Config file:{" "}
            <code className="font-mono">
              ~/Library/Application Support/Claude/claude_desktop_config.json
            </code>{" "}
            (macOS) /{" "}
            <code className="font-mono">%APPDATA%\Claude\claude_desktop_config.json</code>{" "}
            (Windows)
          </p>
        </section>
      </main>
    </div>
  );
}

function FeatureCard({ feature: f }: { feature: Feature }) {
  const ep = f.endpoint;
  const pathParams = (ep.url_template.match(/\{([^}]+)\}/g) ?? []).map((p) =>
    p.slice(1, -1),
  );
  const queryParams = (ep.query_params ?? []).map((q) => ({
    name: q.name,
    required: q.required,
  }));
  const bodyProps = Object.keys(ep.body_schema?.properties ?? {}).map((name) => ({
    name,
    required: ep.body_schema?.required?.includes(name) ?? false,
  }));
  const allParams = [
    ...pathParams.map((n) => ({ name: n, required: true })),
    ...queryParams,
    ...bodyProps.filter((b) => !pathParams.includes(b.name)),
  ];

  return (
    <div className="bg-surface border border-border rounded-lg p-4">
      <div className="flex items-center gap-2 mb-1.5">
        <MethodPill method={ep.method} />
        <span className="font-medium text-sm text-text1">{f.name || f.id}</span>
      </div>
      {f.description && (
        <p className="text-xs text-text2 mb-2 leading-relaxed">{f.description}</p>
      )}
      <p className="font-mono text-xs text-text2 truncate mb-2">{ep.url_template}</p>
      {allParams.length > 0 && (
        <div className="flex flex-wrap gap-1.5 pt-2 border-t border-border">
          {allParams.map((p) => (
            <span
              key={p.name}
              className="font-mono text-[11px] px-2 py-0.5 bg-[#1a1a1a] border border-border rounded"
            >
              <span className={p.required ? "text-accent" : "text-text2"}>{p.name}</span>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
