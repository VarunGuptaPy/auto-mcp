import type { JobStatus } from "@/lib/types";

interface TimelineProps {
  status: JobStatus;
  step: number;
  total: number;
  features: number;
  hasCodeAnalysis?: boolean;
  codeRoutes?: number;
  queuePosition?: number;
}

// Stages shown depend on whether code analysis was requested
function buildStages(hasCodeAnalysis: boolean): { key: JobStatus; label: string }[] {
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
  return base;
}

const STAGE_ORDER: Record<string, number> = {
  queued: 0, code_analysis: 1, exploring: 2, analyzing: 3, generating: 4, done: 5, failed: 5,
};

function stageSub(
  key: JobStatus,
  status: JobStatus,
  step: number,
  total: number,
  features: number,
  codeRoutes: number,
  queuePosition: number,
): string {
  if (status === "failed" && key === "done") return "Failed";
  switch (key) {
    case "queued":        return queuePosition > 0
                            ? `Position ${queuePosition + 1} in queue`
                            : "Waiting for a browser slot…";
    case "code_analysis": return status === "code_analysis"
                            ? "Fetching & indexing repository…"
                            : codeRoutes > 0 ? `${codeRoutes} routes indexed` : "Complete";
    case "exploring":     return status === "exploring" ? (total ? `Step ${step} / ${total}` : `Step ${step}`) : "";
    case "analyzing":     return "Merging browser trace with code…";
    case "generating":    return "Writing server.py…";
    case "done":          return status === "done" ? `${features} features · ${step} steps` : "";
    default:              return "";
  }
}

export default function Timeline({
  status,
  step,
  total,
  features,
  hasCodeAnalysis = false,
  codeRoutes = 0,
  queuePosition = 0,
}: TimelineProps) {
  const STAGES = buildStages(hasCodeAnalysis);
  const cur = STAGE_ORDER[status] ?? 0;
  const failed = status === "failed";

  return (
    <ul className="space-y-0">
      {STAGES.map((s, i) => {
        const isDone    = !failed && i < cur;
        const isActive  = !failed && i === cur;
        const isFailed  = failed && s.key === "done";
        const sub       = stageSub(s.key, status, step, total, features, codeRoutes, queuePosition);

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
