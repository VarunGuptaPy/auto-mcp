"use client";

import { useCallback, useEffect, useReducer, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Timeline from "@/components/Timeline";
import MethodPill from "@/components/MethodPill";
import ChatPanel from "@/components/ChatPanel";
import { useSSE } from "@/lib/useSSE";
import { useAuth } from "@/lib/auth-context";
import { updateJobByJobId } from "@/lib/firestore";
import type {
  ChatMessage,
  Endpoint,
  JobState,
  JobStatus,
  SSEEvent,
} from "@/lib/types";

// ---- state ----------------------------------------------------------------

interface PageState {
  job: JobState | null;
  status: JobStatus;
  step: number;
  total: number;
  features: number;
  screenshotUrl: string | null;
  reasoning: string;
  endpoints: Endpoint[];
  endpointsByHost: Record<string, Endpoint[]>;
  error: string | null;
  queuePosition: number;
  queueLength: number;
  codeRoutes: number;
  codeWarning: string | null;
}

type Action =
  | { type: "INIT"; job: JobState }
  | { type: "STAGE"; stage: JobStatus; features?: number }
  | { type: "STEP"; step: number; total: number; url: string }
  | { type: "REASONING"; reasoning: string; action: string }
  | { type: "NETWORK"; endpoints: Endpoint[] }
  | { type: "FEATURES"; count: number }
  | { type: "CODE_DONE"; routes: number }
  | { type: "CODE_WARN"; message: string }
  | { type: "ERROR"; message: string }
  | { type: "QUEUE_POS"; position: number; queueLength: number };

function byHost(endpoints: Endpoint[]): Record<string, Endpoint[]> {
  return endpoints.reduce<Record<string, Endpoint[]>>((acc, ep) => {
    (acc[ep.host] ??= []).push(ep);
    return acc;
  }, {});
}

function reducer(state: PageState, action: Action): PageState {
  switch (action.type) {
    case "INIT":
      return {
        ...state,
        job: action.job,
        status: action.job.status,
        step: action.job.current_step,
        total: action.job.total_steps,
        features: action.job.features_found,
        queuePosition: action.job.queue_position,
        queueLength: action.job.queue_position + 1,
        error: action.job.error,
      };
    case "STAGE":
      return {
        ...state,
        status: action.stage,
        features: action.features ?? state.features,
      };
    case "STEP":
      return {
        ...state,
        step: action.step,
        total: action.total,
        screenshotUrl: action.url,
      };
    case "REASONING":
      return { ...state, reasoning: `[${action.action}] ${action.reasoning}` };
    case "NETWORK":
      return {
        ...state,
        endpoints: action.endpoints,
        endpointsByHost: byHost(action.endpoints),
      };
    case "FEATURES":
      return { ...state, features: action.count };
    case "CODE_DONE":
      return { ...state, codeRoutes: action.routes };
    case "CODE_WARN":
      return { ...state, codeWarning: action.message };
    case "ERROR":
      return { ...state, status: "failed", error: action.message };
    case "QUEUE_POS":
      return { ...state, queuePosition: action.position, queueLength: action.queueLength };
    default:
      return state;
  }
}

const INIT: PageState = {
  job: null,
  status: "queued",
  step: 0,
  total: 0,
  features: 0,
  screenshotUrl: null,
  reasoning: "",
  endpoints: [],
  endpointsByHost: {},
  error: null,
  queuePosition: 0,
  queueLength: 0,
  codeRoutes: 0,
  codeWarning: null,
};

// ---- component ------------------------------------------------------------

export default function JobPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { user } = useAuth();
  const [state, dispatch] = useReducer(reducer, INIT);
  const startTimeRef = useRef<number>(Date.now());
  const elapsedRef = useRef<HTMLSpanElement>(null);
  const isTerminal = state.status === "done" || state.status === "failed";
  const sseUrl = id && !isTerminal ? `/api/jobs/${id}/events` : null;

  // Chat state
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [pendingQuestion, setPendingQuestion] = useState<ChatMessage | null>(
    null,
  );

  // Local agent command state
  const [agentToken, setAgentToken] = useState<string | null>(null);
  const [copyFeedback, setCopyFeedback] = useState(false);

  // Fetch initial job state
  useEffect(() => {
    if (!id) return;
    fetch(`/api/jobs/${id}`)
      .then((r) => r.json())
      .then((job: JobState) => {
        startTimeRef.current = job.created_at * 1000;
        dispatch({ type: "INIT", job });
        if (job.status === "done") router.push(`/done/${id}`);
      })
      .catch(console.error);
  }, [id, router]);

  // Read agent token from sessionStorage (set during job creation)
  useEffect(() => {
    if (!id) return;
    const token = sessionStorage.getItem(`agent_token:${id}`);
    setAgentToken(token);
  }, [id]);

  // Elapsed timer — direct DOM update to avoid re-renders
  useEffect(() => {
    const iv = setInterval(() => {
      if (!elapsedRef.current) return;
      const s = Math.floor((Date.now() - startTimeRef.current) / 1000);
      elapsedRef.current.textContent = `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
    }, 1000);
    return () => clearInterval(iv);
  }, []);

  const handleEvent = useCallback(
    (ev: SSEEvent) => {
      switch (ev.type) {
        case "stage_change":
          dispatch({
            type: "STAGE",
            stage: ev.stage,
            features: ev.features_found,
          });
          if (ev.stage === "done") {
            if (user && id) {
              updateJobByJobId(user.uid, id, {
                status: "done",
                features: ev.features_found ?? 0,
              }).catch(() => {});
            }
            router.push(`/done/${id}`);
          } else if (ev.stage === "failed") {
            if (user && id) {
              updateJobByJobId(user.uid, id, { status: "failed" }).catch(
                () => {},
              );
            }
          }
          break;
        case "step_update":
          dispatch({
            type: "STEP",
            step: ev.step,
            total: ev.total_steps,
            url: ev.screenshot_url,
          });
          break;
        case "reasoning":
          dispatch({
            type: "REASONING",
            reasoning: ev.reasoning,
            action: ev.action,
          });
          break;
        case "network_update":
          dispatch({ type: "NETWORK", endpoints: ev.endpoints });
          break;
        case "features_found":
          dispatch({ type: "FEATURES", count: ev.count });
          break;
        case "code_analysis_done":
          dispatch({ type: "CODE_DONE", routes: ev.routes_found });
          break;
        case "code_analysis_warning":
          dispatch({ type: "CODE_WARN", message: ev.message });
          break;
        case "chat_question": {
          const msg: ChatMessage = {
            id: `q-${ev.question_id}`,
            sender: "agent",
            text: ev.text,
            timestamp: Date.now(),
            question_id: ev.question_id,
            question_type: ev.question_type,
            fields: ev.fields,
            choices: ev.choices,
            answered: false,
          };
          setChatMessages((prev) => {
            // Deduplicate on replay
            if (prev.some((m) => m.question_id === ev.question_id)) return prev;
            return [...prev, msg];
          });
          setPendingQuestion(msg);
          break;
        }
        case "auth_required": {
          // Legacy SSE event — treat as credentials question
          const msg: ChatMessage = {
            id: `q-auth-legacy-${Date.now()}`,
            sender: "agent",
            text: "Login required. Please enter your credentials:",
            timestamp: Date.now(),
            question_id: `auth-legacy-${Date.now()}`,
            question_type: "credentials",
            fields: ev.fields,
            answered: false,
          };
          setChatMessages((prev) => [...prev, msg]);
          setPendingQuestion(msg);
          break;
        }
        case "chat_answer_received":
          setChatMessages((prev) =>
            prev.map((m) =>
              m.question_id === ev.question_id ? { ...m, answered: true } : m,
            ),
          );
          setPendingQuestion((prev) =>
            prev?.question_id === ev.question_id ? null : prev,
          );
          break;
        case "auth_accepted":
          // Close any pending auth question
          setChatMessages((prev) =>
            prev.map((m) =>
              m.question_type === "credentials" && !m.answered
                ? { ...m, answered: true }
                : m,
            ),
          );
          setPendingQuestion((prev) =>
            prev?.question_type === "credentials" ? null : prev,
          );
          break;
        case "chat_timeout":
          setChatMessages((prev) =>
            prev.map((m) =>
              m.question_id === ev.question_id ? { ...m, timed_out: true } : m,
            ),
          );
          setPendingQuestion((prev) =>
            prev?.question_id === ev.question_id ? null : prev,
          );
          break;
        case "user_message":
          // Echo back free-form instructions sent by the user as chat bubbles
          setChatMessages((prev) => [
            ...prev,
            {
              id: `user-${Date.now()}`,
              sender: "user",
              text: ev.text,
              timestamp: Date.now(),
            },
          ]);
          break;
        case "error":
          dispatch({ type: "ERROR", message: ev.message });
          if (user && id) {
            updateJobByJobId(user.uid, id, { status: "failed" }).catch(
              () => {},
            );
          }
          break;
        case "queue_position":
          dispatch({ type: "QUEUE_POS", position: ev.position, queueLength: ev.queue_length });
          break;
      }
    },
    [id, router, user],
  );

  function handleAnswered(questionId: string) {
    setChatMessages((prev) =>
      prev.map((m) =>
        m.question_id === questionId ? { ...m, answered: true } : m,
      ),
    );
    setPendingQuestion((prev) =>
      prev?.question_id === questionId ? null : prev,
    );
  }

  useSSE(sseUrl, handleEvent);

  const backendUrl = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";
  const tokenDisplay = agentToken ?? "<your-token>";
  const localCommand =
    `pip install playwright && playwright install chromium\n` +
    `python local_agent.py \\\n` +
    `  --job-id ${id} \\\n` +
    `  --token ${tokenDisplay} \\\n` +
    `  --backend-url ${backendUrl}`;

  function copyCommand() {
    navigator.clipboard.writeText(localCommand).then(() => {
      setCopyFeedback(true);
      setTimeout(() => setCopyFeedback(false), 2000);
    });
  }

  const {
    status,
    step,
    total,
    features,
    screenshotUrl,
    reasoning,
    endpointsByHost,
    error,
    queuePosition,
    queueLength,
    codeRoutes,
    codeWarning,
  } = state;
  const epCount = state.endpoints.length;
  const hasCodeAnalysis = !!state.job?.github_repo;

  return (
    <div className="flex flex-col h-screen">
      {/* Header */}
      <header className="flex items-center gap-4 px-6 py-3.5 border-b border-border bg-surface shrink-0">
        <span className="font-mono font-medium text-text2">
          <span className="text-accent">auto</span>-mcp
        </span>
        <span className="font-mono text-xs text-text2 truncate max-w-sm">
          {state.job?.url ?? "…"}
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

      {/* Three-column body */}
      <div className="flex-1 grid grid-cols-[220px_1fr_360px] overflow-hidden max-lg:grid-cols-1 max-lg:overflow-y-auto">
        {/* Left: timeline */}
        <aside className="border-r border-border p-5 overflow-y-auto">
          <Timeline
            status={status}
            step={step}
            total={total}
            features={features}
            hasCodeAnalysis={hasCodeAnalysis}
            codeRoutes={codeRoutes}
            queuePosition={queuePosition}
          />
          {codeWarning && (
            <div className="mt-3 bg-yellow-950/30 border border-yellow-800/40 rounded-lg p-2.5 text-[11px] text-yellow-400/80 leading-relaxed">
              ⚠ {codeWarning}
            </div>
          )}

          <div className="mt-6 pt-5 border-t border-border">
            <span
              ref={elapsedRef}
              className="font-mono text-2xl text-text1 block"
            >
              0:00
            </span>
            <span className="text-xs text-text2">elapsed</span>
          </div>

          {status === "queued" && (
            <div className="mt-4 rounded-xl border border-accent/30 bg-accent/5 p-3 space-y-2.5">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-accent uppercase tracking-wider">Queue</span>
                <span className="text-xs text-text2">
                  {queuePosition === 0 ? "Next up" : `#${queuePosition + 1} of ${queueLength}`}
                </span>
              </div>

              {/* Progress bar */}
              <div className="h-1.5 rounded-full bg-border overflow-hidden">
                <div
                  className="h-full rounded-full bg-accent transition-all duration-500"
                  style={{ width: queueLength > 1 ? `${((queueLength - queuePosition) / queueLength) * 100}%` : "100%" }}
                />
              </div>

              <p className="text-[11px] text-text2 leading-relaxed">
                {queuePosition === 0
                  ? "You're next — a browser slot will open shortly."
                  : `${queuePosition} job${queuePosition > 1 ? "s" : ""} ahead of you. Hang tight…`}
              </p>
            </div>
          )}
        </aside>

        {/* Center: screenshot + reasoning + endpoints (collapsible) */}
        <section className="border-r border-border p-5 flex flex-col gap-4 overflow-y-auto max-lg:border-r-0">
          {/* Screenshot / local agent command panel */}
          <div className="relative bg-black rounded-lg overflow-hidden aspect-[16/10] flex items-center justify-center">
            {screenshotUrl ? (
              <>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={`${screenshotUrl}?t=${Date.now()}`}
                  alt={`Agent screenshot step ${step}`}
                  className="w-full h-full object-contain"
                />
                <span className="absolute top-2 right-2 bg-black/70 border border-border rounded px-2 py-0.5 font-mono text-[11px] text-text2">
                  step {step}
                </span>
              </>
            ) : status === "waiting_for_agent" ? (
              <div className="flex flex-col w-full h-full p-6 justify-center gap-4">
                <p className="text-sm text-text1 font-medium">
                  Run this command on your machine to start exploring:
                </p>
                <pre className="font-mono text-xs text-green-400 bg-black/60 border border-border rounded-lg px-4 py-3 leading-relaxed whitespace-pre overflow-x-auto">
                  {localCommand}
                </pre>
                <div className="flex items-center gap-2">
                  <button
                    onClick={copyCommand}
                    className="px-3 py-1.5 text-xs bg-accent/10 hover:bg-accent/20 border border-accent/30 rounded-md text-accent transition-colors font-medium"
                  >
                    {copyFeedback ? "Copied!" : "Copy command"}
                  </button>
                  <a
                    href="/api/local-agent/download"
                    download="local_agent.py"
                    className="px-3 py-1.5 text-xs bg-white/5 hover:bg-white/10 border border-border rounded-md text-text2 transition-colors font-medium"
                  >
                    Download local_agent.py
                  </a>
                </div>
              </div>
            ) : status === "queued" ? (
              <div className="flex flex-col items-center justify-center w-full h-full gap-6 px-10">
                {/* Position badge */}
                <div className="flex flex-col items-center gap-2">
                  <span className="text-[11px] font-semibold uppercase tracking-widest text-accent">
                    Queue position
                  </span>
                  <span className="text-7xl font-black text-text1 tabular-nums leading-none">
                    {queuePosition === 0 ? "–" : queuePosition + 1}
                  </span>
                  {queueLength > 1 && (
                    <span className="text-sm text-muted">
                      of {queueLength} job{queueLength > 1 ? "s" : ""}
                    </span>
                  )}
                </div>

                {/* Progress bar */}
                <div className="w-full max-w-xs">
                  <div className="h-2 rounded-full bg-white/10 overflow-hidden">
                    <div
                      className="h-full rounded-full bg-accent transition-all duration-700 ease-out"
                      style={{
                        width: queueLength > 1
                          ? `${((queueLength - queuePosition) / queueLength) * 100}%`
                          : "100%",
                      }}
                    />
                  </div>
                </div>

                {/* Status message */}
                <p className="text-sm text-text2 text-center max-w-xs leading-relaxed">
                  {queuePosition === 0
                    ? "You're next — a browser slot will open any moment now."
                    : `${queuePosition} job${queuePosition > 1 ? "s" : ""} ahead of you. Your browser session will start automatically.`}
                </p>

                <span className="w-5 h-5 border-2 border-accent/30 border-t-accent rounded-full animate-spin" />
              </div>
            ) : (
              <div className="flex flex-col items-center gap-2 text-muted text-sm">
                <span className="w-5 h-5 border-2 border-muted border-t-accent rounded-full animate-spin" />
                Waiting for first screenshot…
              </div>
            )}
          </div>

          {/* Reasoning */}
          <div className="bg-surface border border-border rounded-lg p-4">
            <p className="text-[11px] uppercase tracking-wider text-muted mb-2">
              Agent reasoning
            </p>
            <p
              className={`text-sm leading-relaxed ${reasoning ? "text-text1" : "text-muted italic"}`}
            >
              {reasoning || "Waiting for first step…"}
            </p>
          </div>

          {/* Endpoints — collapsible */}
          <details className="bg-surface border border-border rounded-lg overflow-hidden">
            <summary className="flex items-center justify-between px-4 py-3 cursor-pointer select-none hover:bg-white/[0.02] transition-colors">
              <span className="text-[11px] uppercase tracking-wider text-muted">
                Captured endpoints
              </span>
              <span className="font-mono text-xs text-accent bg-accent/10 border border-accent/20 rounded px-1.5 py-0.5">
                {epCount}
              </span>
            </summary>
            <div className="px-4 pb-4 pt-1">
              {epCount === 0 ? (
                <p className="text-xs text-muted">
                  Endpoints will appear here as the agent explores.
                </p>
              ) : (
                <div className="space-y-4">
                  {Object.entries(endpointsByHost).map(([host, eps]) => (
                    <div key={host}>
                      <p className="font-mono text-[11px] text-muted uppercase tracking-wider mb-2">
                        {host}
                      </p>
                      <ul className="space-y-1">
                        {eps.map((ep, i) => (
                          <li
                            key={i}
                            className="flex items-start gap-2 py-1 border-b border-border last:border-0"
                          >
                            <MethodPill method={ep.method} />
                            <span className="font-mono text-xs text-text1 break-all">
                              {ep.path}
                            </span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </details>

          {/* Error banner */}
          {error && (
            <div className="bg-red-950/50 border border-danger/50 rounded-lg px-4 py-3 text-danger text-sm">
              <p className="font-medium mb-1">Job failed</p>
              <p className="text-danger/80 text-xs">{error}</p>
              <button
                onClick={() => router.push("/")}
                className="mt-3 text-xs px-3 py-1.5 bg-danger/20 hover:bg-danger/30 border border-danger/40 rounded-md text-danger transition-colors"
              >
                ← Try again
              </button>
            </div>
          )}
        </section>

        {/* Right: chat panel */}
        <aside className="overflow-hidden flex flex-col">
          {id && (
            <ChatPanel
              jobId={id}
              messages={chatMessages}
              pendingQuestion={pendingQuestion}
              onAnswered={handleAnswered}
              jobDone={isTerminal}
            />
          )}
        </aside>
      </div>
    </div>
  );
}
