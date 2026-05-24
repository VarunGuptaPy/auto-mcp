import type { JobStatus } from "@/lib/types";

interface TimelineProps {
  status: JobStatus;
  step: number;
  total: number;
  features: number;
  hasCodeAnalysis?: boolean;
  hasSiteMap?: boolean;
  codeRoutes?: number;
  queuePosition?: number;
  reconstructedCount?: number;
}

// Stages shown depend on whether code analysis and site mapping were used
function buildStages(
  hasCodeAnalysis: boolean,
  hasSiteMap: boolean,
): { key: JobStatus; label: string }[] {
  const base: { key: JobStatus; label: string }[] = [
    { key: "queued",        label: "Queued" },
    { key: "exploring",     label: "Exploring" },
    { key: "analyzing",     label: "Analyzing" },
    { key: "generating",    label: "Generating" },
    { key: "done",          label: "Done" },
  ];
  if (hasCodeAnalysis) {
    base.splice(1, 0, { key: "code_analysis", label: "Code Analysis" });
  }
  if (hasSiteMap) {
    // Insert site mapping stages after exploring
    const exploreIdx = base.findIndex((s) => s.key === "exploring");
    base.splice(
      exploreIdx + 1,
      0,
      { key: "site_mapping",   label: "Site Mapping" },
      { key: "classifying",    label: "Classifying" },
      { key: "questioning",    label: "Q&A" },
      { key: "reconstructing", label: "Reconstructing" },
    );
  }
  return base;
}

const STAGE_ORDER: Record<string, number> = {
  queued: 0,
  code_analysis: 1,
  exploring: 2,
  site_mapping: 3,
  classifying: 4,
  questioning: 5,
  reconstructing: 6,
  analyzing: 7,
  generating: 8,
  done: 9,
  failed: 9,
};

function stageSub(
  key: JobStatus,
  status: JobStatus,
  step: number,
  total: number,
  features: number,
  codeRoutes: number,
  queuePosition: number,
  reconstructedCount: number,
): string {
  if ((status === "failed" || status === "stopped") && key === "done") return status === "stopped" ? "Stopped" : "Failed";
  switch (key) {
    case "queued":
      return queuePosition > 0
        ? `Position ${queuePosition + 1} in queue`
        : "Waiting for a browser slot…";
    case "code_analysis":
      return status === "code_analysis"
        ? "Fetching & indexing repository…"
        : codeRoutes > 0 ? `${codeRoutes} routes indexed` : "Complete";
    case "exploring":
      return status === "exploring" ? (total ? `Step ${step} / ${total}` : `Step ${step}`) : "";
    case "site_mapping":
      return status === "site_mapping" ? "Mapping pages & features…" : "Complete";
    case "classifying":
      return status === "classifying" ? "Determining implementation types…" : "Complete";
    case "questioning":
      return status === "questioning" ? "Waiting for your answers…" : "Complete";
    case "reconstructing":
      return status === "reconstructing"
        ? `Generating ${reconstructedCount > 0 ? reconstructedCount + " " : ""}implementations…`
        : reconstructedCount > 0 ? `${reconstructedCount} features reconstructed` : "Complete";
    case "analyzing":
      return "Finalizing feature spec…";
    case "generating":
      return "Writing server.py…";
    case "done":
      return status === "done" ? `${features} features · ${step} steps` : "";
    default:
      return "";
  }
}

export default function Timeline({
  status,
  step,
  total,
  features,
  hasCodeAnalysis = false,
  hasSiteMap = false,
  codeRoutes = 0,
  queuePosition = 0,
  reconstructedCount = 0,
}: TimelineProps) {
  const STAGES = buildStages(hasCodeAnalysis, hasSiteMap);
  const cur = STAGE_ORDER[status] ?? 0;
  const failed = status === "failed" || status === "stopped";

  return (
    <ul className="space-y-0">
      {STAGES.map((s, i) => {
        const isDone    = !failed && i < cur;
        const isActive  = !failed && i === cur;
        const isFailed  = failed && s.key === "done";
        const sub       = stageSub(s.key, status, step, total, features, codeRoutes, queuePosition, reconstructedCount);

        return (
          <li key={s.key} className="relative flex items-start gap-3 py-2">
            {/* connector line */}
            {i < STAGES.length - 1 && (
              <span className="absolute left-[9px] top-7 bottom-[-4px] w-px bg-border" />
            )}

            {/* dot */}
            <span
              className={[
                "mt-0.5 w-5 h-5 rounded-full border-2 flex-shrink-0 flex items-center justify-center text-[10px] font-bold",
                isDone   ? "border-success bg-success/10 text-success"
                : isFailed ? "border-danger bg-danger/10 text-danger"
                : isActive ? "border-accent bg-accent/10 animate-pulse"
                : "border-border bg-bg",
              ].join(" ")}
            >
              {isDone    ? "✓" : isFailed ? "✗" : ""}
            </span>

            {/* label */}
            <div className="min-w-0">
              <p className="text-sm text-text1 leading-tight">{s.label}</p>
              {sub && (
                <p className="text-xs text-text2 mt-0.5 truncate">{sub}</p>
              )}
            </div>
          </li>
        );
      })}
    </ul>
  );
}
