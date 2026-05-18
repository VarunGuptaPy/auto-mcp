"use client";

import { useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import MethodPill from "@/components/MethodPill";
import type { Feature, FeatureSpec, JobState } from "@/lib/types";

export default function DonePage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [job, setJob]       = useState<JobState | null>(null);
  const [spec, setSpec]     = useState<FeatureSpec | null>(null);
  const [specError, setSpecError] = useState(false);

  // patch state
  const [patchText,    setPatchText]    = useState("");
  const [patching,     setPatching]     = useState(false);
  const [patchError,   setPatchError]   = useState<string | null>(null);
  const [addedIds,     setAddedIds]     = useState<Set<string>>(new Set());
  const [patchSuccess, setPatchSuccess] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

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

  async function submitPatch() {
    if (!patchText.trim() || patching) return;
    setPatching(true);
    setPatchError(null);
    setPatchSuccess(false);
    try {
      const res = await fetch(`/api/jobs/${id}/patch`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ description: patchText.trim() }),
      });
      const data = await res.json();
      if (!res.ok) {
        setPatchError(data.detail ?? "Something went wrong.");
        return;
      }
      // Refresh spec so the new feature appears in the list
      const updatedSpec = await fetch(`/api/jobs/${id}/spec`).then((r) => r.json()).catch(() => null);
      if (updatedSpec && !updatedSpec.detail) setSpec(updatedSpec);
      setAddedIds((prev) => { const s = new Set(prev); s.add(data.feature.id); return s; });
      setPatchText("");
      setPatchSuccess(true);
      setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: "smooth" }), 100);
    } catch (e) {
      setPatchError(e instanceof Error ? e.message : "Network error");
    } finally {
      setPatching(false);
    }
  }

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
          onClick={() => router.push("/dashboard")}
          className="text-xs px-3 py-1.5 border border-border rounded-md text-text2 hover:border-muted transition-colors"
        >
          ← Dashboard
        </button>
        <button
          onClick={() => router.push("/create")}
          className="text-xs px-3 py-1.5 border border-border rounded-md text-text2 hover:border-muted transition-colors"
        >
          + New MCP
        </button>
      </header>

      <main className="flex-1 max-w-3xl mx-auto w-full px-6 py-12">

        {/* Hero */}
        <div className="text-center mb-12">
          <h1 className="text-3xl font-semibold mb-2">MCP server ready ✓</h1>
          <p className="text-text2">
            {spec
              ? `${spec.features.length} feature${spec.features.length === 1 ? "" : "s"} discovered from ${spec.base_url}`
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
          {patchSuccess && (
            <p className="text-xs text-green-400 mt-2">
              ✓ Server updated — download above includes your new tool.
            </p>
          )}
        </div>

        {/* Features */}
        <section className="mb-10">
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
                <FeatureCard key={f.id} feature={f} isNew={addedIds.has(f.id)} />
              ))}
            </div>
          )}
        </section>

        {/* ── Patch / "Missing something?" ───────────────────────────── */}
        <section className="mb-14">
          <h2 className="text-base font-semibold mb-1 pb-3 border-b border-border">
            Missing something?
          </h2>
          <p className="text-sm text-text2 mb-4 mt-3">
            Describe a tool or endpoint that wasn&apos;t captured and the AI will
            add it to your MCP server.
          </p>

          <textarea
            value={patchText}
            onChange={(e) => setPatchText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) submitPatch();
            }}
            placeholder={[
              'e.g. "I need a tool to delete a user by ID"',
              'or "The API also has a POST /export endpoint that returns a CSV"',
              'or "Add a tool that converts Celsius to Fahrenheit locally"',
            ].join("\n")}
            rows={4}
            disabled={patching}
            className="w-full bg-bg border border-border rounded-xl px-4 py-3 text-sm text-text1 placeholder-muted outline-none focus:border-accent transition-colors resize-none disabled:opacity-50 leading-relaxed"
          />

          <div className="flex items-center gap-3 mt-3">
            <button
              onClick={submitPatch}
              disabled={patching || !patchText.trim()}
              className="px-5 py-2.5 bg-accent hover:bg-accent-h disabled:opacity-40 disabled:cursor-not-allowed rounded-xl text-white text-sm font-semibold transition-colors"
            >
              {patching ? (
                <span className="flex items-center gap-2">
                  <span className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  Generating…
                </span>
              ) : "Add tool →"}
            </button>
            <span className="text-xs text-muted">⌘ Enter to submit</span>
          </div>

          {patchError && (
            <p className="mt-3 text-sm text-danger bg-danger/10 border border-danger/30 rounded-lg px-4 py-2">
              {patchError}
            </p>
          )}

          {patchSuccess && (
            <p className="mt-3 text-sm text-green-400">
              ✓ Tool added! Download the updated server above.
            </p>
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

        <div ref={bottomRef} />
      </main>
    </div>
  );
}

// ── Feature card ────────────────────────────────────────────────────────────

function FeatureCard({ feature: f, isNew }: { feature: Feature; isNew: boolean }) {
  const ep = f.endpoint;
  const isDirect = (f as unknown as { implementation_type?: string }).implementation_type === "direct_code";

  // params only apply to http_proxy features
  const pathParams  = ep ? (ep.url_template.match(/\{([^}]+)\}/g) ?? []).map((p) => p.slice(1, -1)) : [];
  const queryParams = ep ? (ep.query_params ?? []).map((q) => ({ name: q.name, required: q.required })) : [];
  const bodyProps   = ep ? Object.keys(ep.body_schema?.properties ?? {}).map((name) => ({
    name,
    required: ep.body_schema?.required?.includes(name) ?? false,
  })) : [];
  const allParams = [
    ...pathParams.map((n) => ({ name: n, required: true })),
    ...queryParams,
    ...bodyProps.filter((b) => !pathParams.includes(b.name)),
  ];

  return (
    <div className={`bg-surface border rounded-lg p-4 transition-colors ${isNew ? "border-accent/50 ring-1 ring-accent/20" : "border-border"}`}>
      <div className="flex items-center gap-2 mb-1.5 flex-wrap">
        {isDirect ? (
          <span className="text-[10px] font-mono font-semibold px-1.5 py-0.5 rounded bg-purple-500/15 text-purple-400 border border-purple-500/25">
            python
          </span>
        ) : ep ? (
          <MethodPill method={ep.method} />
        ) : null}
        <span className="font-medium text-sm text-text1">{f.name || f.id}</span>
        {isNew && (
          <span className="ml-auto text-[10px] font-semibold text-accent bg-accent/10 border border-accent/25 rounded px-1.5 py-0.5">
            + added
          </span>
        )}
      </div>

      {f.description && (
        <p className="text-xs text-text2 mb-2 leading-relaxed">{f.description}</p>
      )}

      {ep && (
        <p className="font-mono text-xs text-text2 truncate mb-2">{ep.url_template}</p>
      )}

      {isDirect && (
        <p className="text-xs text-purple-400/80 mb-2">Implemented directly in Python (no HTTP call)</p>
      )}

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
