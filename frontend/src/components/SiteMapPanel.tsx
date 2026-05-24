"use client";

import type { SiteMapData, SiteFeature } from "@/lib/types";

interface Props {
  siteMap: SiteMapData;
  reconstructionProgress: Record<string, string>;
}

const FEATURE_TYPE_LABELS: Record<string, string> = {
  api_endpoint: "API",
  database_query: "DB",
  ai_generation: "AI",
  computation: "Compute",
  auth_action: "Auth",
  file_operation: "Files",
  websocket: "WS",
  unknown: "?",
};

const TRIGGER_LABELS: Record<string, string> = {
  page_load: "on load",
  button_click: "button",
  form_submit: "form",
  navigation: "nav",
  scroll: "scroll",
  unknown: "",
};

function featureStatus(
  feature: SiteFeature,
  reconstructionProgress: Record<string, string>,
): "endpoint" | "reconstructed" | "questioning" | "pending" | "failed" {
  const prog = reconstructionProgress[feature.feature_id];
  if (prog === "done") return "reconstructed";
  if (prog === "questioning" || prog === "generating") return "questioning";
  if (prog === "failed") return "failed";
  if (feature.has_endpoint) return "endpoint";
  return "pending";
}

function StatusDot({ status }: { status: ReturnType<typeof featureStatus> }) {
  const classes: Record<string, string> = {
    endpoint:     "bg-green-500",
    reconstructed:"bg-blue-400",
    questioning:  "bg-yellow-400 animate-pulse",
    pending:      "bg-zinc-500",
    failed:       "bg-red-500",
  };
  return (
    <span
      className={`inline-block w-2 h-2 rounded-full shrink-0 mt-1 ${classes[status] ?? "bg-zinc-500"}`}
      title={status}
    />
  );
}

function TypeBadge({ type }: { type: string }) {
  const label = FEATURE_TYPE_LABELS[type] ?? type;
  const colors: Record<string, string> = {
    api_endpoint:   "bg-sky-900/50 text-sky-300 border-sky-700/50",
    database_query: "bg-amber-900/50 text-amber-300 border-amber-700/50",
    ai_generation:  "bg-violet-900/50 text-violet-300 border-violet-700/50",
    computation:    "bg-teal-900/50 text-teal-300 border-teal-700/50",
    auth_action:    "bg-orange-900/50 text-orange-300 border-orange-700/50",
    file_operation: "bg-indigo-900/50 text-indigo-300 border-indigo-700/50",
    websocket:      "bg-pink-900/50 text-pink-300 border-pink-700/50",
    unknown:        "bg-zinc-800/50 text-zinc-400 border-zinc-700/50",
  };
  return (
    <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-semibold border ${colors[type] ?? colors.unknown}`}>
      {label}
    </span>
  );
}

export default function SiteMapPanel({ siteMap, reconstructionProgress }: Props) {
  const { pages, total_features, features_with_endpoints } = siteMap;
  const coveragePct = total_features > 0
    ? Math.round((features_with_endpoints / total_features) * 100)
    : 0;

  return (
    <details className="bg-surface border border-border rounded-lg overflow-hidden">
      <summary className="flex items-center justify-between px-4 py-3 cursor-pointer select-none hover:bg-white/[0.02] transition-colors">
        <span className="text-[11px] uppercase tracking-wider text-muted">
          Website feature map
        </span>
        <span className="font-mono text-xs text-accent bg-accent/10 border border-accent/20 rounded px-1.5 py-0.5">
          {total_features}
        </span>
      </summary>

      <div className="px-4 pb-4 pt-2 space-y-3">
        {/* Coverage bar */}
        <div>
          <div className="flex items-center justify-between mb-1">
            <span className="text-[11px] text-text2">Endpoint coverage</span>
            <span className="text-[11px] font-mono text-text1">
              {features_with_endpoints}/{total_features}
            </span>
          </div>
          <div className="h-1.5 rounded-full bg-border overflow-hidden">
            <div
              className="h-full rounded-full bg-gradient-to-r from-green-600 to-green-400 transition-all duration-500"
              style={{ width: `${coveragePct}%` }}
            />
          </div>
          <div className="flex items-center gap-3 mt-1.5 text-[10px] text-muted">
            <span className="flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-green-500" /> API endpoint
            </span>
            <span className="flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-blue-400" /> Reconstructed
            </span>
            <span className="flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-yellow-400" /> In progress
            </span>
          </div>
        </div>

        {/* Pages accordion */}
        <div className="space-y-2">
          {pages.map((page) => (
            <details key={page.url} className="rounded-lg border border-border overflow-hidden">
              <summary className="flex items-center justify-between px-3 py-2 cursor-pointer select-none hover:bg-white/[0.02] transition-colors">
                <div className="min-w-0 mr-2">
                  <p className="text-xs text-text1 font-medium truncate">
                    {page.title || (() => { try { return new URL(page.url).pathname; } catch { return page.url; } })() || "/"}
                  </p>
                  <p className="text-[10px] text-muted truncate">{page.url}</p>
                </div>
                <span className="shrink-0 text-[10px] text-muted bg-border rounded px-1.5 py-0.5">
                  {page.features.length}
                </span>
              </summary>

              <div className="px-3 pb-3 pt-1 space-y-1.5">
                {page.features.length === 0 ? (
                  <p className="text-[11px] text-muted italic">No features detected</p>
                ) : (
                  page.features.map((feature) => {
                    const status = featureStatus(feature, reconstructionProgress);
                    const trigger = TRIGGER_LABELS[feature.ui_trigger] ?? "";
                    return (
                      <div
                        key={feature.feature_id}
                        className="flex items-start gap-2 py-1.5 border-b border-border/50 last:border-0"
                      >
                        <StatusDot status={status} />
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className="text-xs text-text1 font-medium">{feature.name}</span>
                            <TypeBadge type={feature.feature_type} />
                            {trigger && (
                              <span className="text-[9px] text-muted">{trigger}</span>
                            )}
                          </div>
                          {feature.description && (
                            <p className="text-[10px] text-muted mt-0.5 leading-tight line-clamp-2">
                              {feature.description}
                            </p>
                          )}
                          {feature.triggering_element && (
                            <p className="text-[10px] text-text2 mt-0.5">
                              via <span className="text-accent">"{feature.triggering_element}"</span>
                            </p>
                          )}
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </details>
          ))}
        </div>
      </div>
    </details>
  );
}
