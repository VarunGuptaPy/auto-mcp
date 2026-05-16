"use client";

import { useEffect, useRef, useState } from "react";
import type { AuthField, ChatMessage } from "@/lib/types";

interface Props {
  jobId: string;
  messages: ChatMessage[];
  pendingQuestion: ChatMessage | null;
  onAnswered: (questionId: string) => void;
  jobDone?: boolean;
}

export default function ChatPanel({ jobId, messages, pendingQuestion, onAnswered, jobDone }: Props) {
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [textInput, setTextInput] = useState("");
  const [credValues, setCredValues] = useState<Record<string, string>>({});
  const [choiceSelected, setChoiceSelected] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  // Play a chime when a new question arrives
  useEffect(() => {
    if (!pendingQuestion || pendingQuestion.answered) return;
    try {
      const ctx = new AudioContext();
      const gain = ctx.createGain();
      gain.connect(ctx.destination);
      gain.gain.setValueAtTime(0.25, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.9);
      // Two-tone chime: 880 Hz → 1100 Hz
      const osc = ctx.createOscillator();
      osc.connect(gain);
      osc.type = "sine";
      osc.frequency.setValueAtTime(880, ctx.currentTime);
      osc.frequency.setValueAtTime(1100, ctx.currentTime + 0.18);
      osc.start(ctx.currentTime);
      osc.stop(ctx.currentTime + 0.9);
      osc.onended = () => ctx.close();
    } catch {
      // AudioContext blocked (e.g. no user gesture yet) — silent fail
    }
  }, [pendingQuestion?.question_id]);

  // Reset credential/choice state when a new question arrives
  useEffect(() => {
    if (pendingQuestion) {
      setCredValues(
        Object.fromEntries((pendingQuestion.fields ?? []).map((f) => [f.name, ""]))
      );
      setChoiceSelected(null);
      setSubmitError(null);
    }
  }, [pendingQuestion?.question_id]);

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length]);

  // Determine what the bottom input will do
  const answeringTextQuestion =
    pendingQuestion && !pendingQuestion.answered && pendingQuestion.question_type === "text";
  const isAnswering = !!answeringTextQuestion;
  const inputPlaceholder = isAnswering
    ? "Reply to agent question…"
    : jobDone
      ? "Job complete"
      : "Send instruction to agent…";

  async function submitAnswer(answer: string | Record<string, string>) {
    if (!pendingQuestion?.question_id) return;
    setSubmitting(true);
    setSubmitError(null);
    try {
      const res = await fetch(`/api/jobs/${jobId}/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question_id: pendingQuestion.question_id, answer }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setSubmitError(data.detail ?? "Failed to send answer.");
        return;
      }
      onAnswered(pendingQuestion.question_id);
    } catch (e) {
      setSubmitError(e instanceof Error ? e.message : "Network error");
    } finally {
      setSubmitting(false);
    }
  }

  async function sendInstruction(text: string) {
    setSubmitting(true);
    setSubmitError(null);
    try {
      const res = await fetch(`/api/jobs/${jobId}/message`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setSubmitError(data.detail ?? "Failed to send message.");
      }
    } catch (e) {
      setSubmitError(e instanceof Error ? e.message : "Network error");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleSend() {
    const text = textInput.trim();
    if (!text || submitting) return;
    setTextInput("");
    if (isAnswering) {
      await submitAnswer(text);
    } else {
      await sendInstruction(text);
    }
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="px-4 pt-4 pb-3 border-b border-border shrink-0">
        <h2 className="text-sm font-medium text-text1">Chat</h2>
        <p className="text-[11px] text-muted mt-0.5">
          {pendingQuestion && !pendingQuestion.answered
            ? "Agent is waiting for your reply"
            : "Send instructions anytime"}
        </p>
      </div>

      {/* Message list */}
      <div className="flex-1 overflow-y-auto px-3 py-3 space-y-3">
        {messages.length === 0 && (
          <p className="text-xs text-muted italic text-center mt-6">
            Type anything below to guide the agent, or wait for it to ask you a question.
          </p>
        )}

        {messages.map((msg) => (
          <MessageBubble
            key={msg.id}
            jobId={jobId}
            msg={msg}
            isActive={pendingQuestion?.question_id === msg.question_id && !msg.answered}
            credValues={credValues}
            setCredValues={setCredValues}
            choiceSelected={choiceSelected}
            setChoiceSelected={setChoiceSelected}
            onSubmit={() => {
              if (pendingQuestion?.question_type === "credentials") submitAnswer(credValues);
              else if (pendingQuestion?.question_type === "env_vars") submitAnswer(credValues);
              else if (pendingQuestion?.question_type === "choice") submitAnswer(choiceSelected ?? "");
            }}
            onAnswered={onAnswered}
            submitting={submitting}
            submitError={submitError}
          />
        ))}
        <div ref={bottomRef} />
      </div>

      {/* Always-active bottom input */}
      <div className="px-3 pb-3 shrink-0 border-t border-border pt-3">
        {isAnswering && (
          <p className="text-[10px] text-accent mb-1.5 truncate">
            Replying to: {pendingQuestion?.text}
          </p>
        )}
        <div className="flex gap-2">
          <input
            ref={inputRef}
            type="text"
            value={textInput}
            onChange={(e) => setTextInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleSend()}
            placeholder={inputPlaceholder}
            disabled={!!jobDone}
            className="flex-1 bg-bg border border-border rounded-lg px-3 py-2 text-sm text-text1 placeholder-muted outline-none focus:border-accent disabled:opacity-40 transition-colors"
          />
          <button
            onClick={handleSend}
            disabled={!textInput.trim() || submitting || !!jobDone}
            className="px-3 py-2 bg-accent hover:bg-accent-h disabled:opacity-40 disabled:cursor-not-allowed rounded-lg text-white text-sm transition-colors"
          >
            {submitting ? (
              <span className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin block" />
            ) : "→"}
          </button>
        </div>
        {submitError && <p className="mt-1.5 text-xs text-danger">{submitError}</p>}
      </div>
    </div>
  );
}


// ---- individual message bubble --------------------------------------------

interface BubbleProps {
  jobId: string;
  msg: ChatMessage;
  isActive: boolean;
  credValues: Record<string, string>;
  setCredValues: (v: Record<string, string>) => void;
  choiceSelected: string | null;
  setChoiceSelected: (v: string) => void;
  onSubmit: () => void;
  onAnswered: (questionId: string) => void;
  submitting: boolean;
  submitError: string | null;
}

function MessageBubble({
  jobId, msg, isActive,
  credValues, setCredValues,
  choiceSelected, setChoiceSelected,
  onSubmit, onAnswered, submitting, submitError,
}: BubbleProps) {
  if (msg.sender === "user") {
    return (
      <div className="flex justify-end">
        <div className="bg-accent/20 border border-accent/30 rounded-xl rounded-tr-sm px-3 py-2 max-w-[85%]">
          <p className="text-sm text-text1">{msg.text}</p>
        </div>
      </div>
    );
  }

  const dimmed = msg.answered || msg.timed_out;
  const canSubmitCreds = Object.values(credValues).some((v) => v.trim());
  const isEnvVars = msg.question_type === "env_vars";
  return (
    <div className={`rounded-xl rounded-tl-sm px-3 py-3 border ${dimmed ? "bg-[#0f0f17] border-border opacity-60" : "bg-[#13131f] border-accent/25"}`}>
      <div className="flex items-center gap-1.5 mb-2">
        <span className="text-[10px] font-medium text-accent uppercase tracking-wider">Agent</span>
        {msg.answered && <span className="text-[10px] text-green-400 ml-auto">✓ answered</span>}
        {msg.timed_out && <span className="text-[10px] text-muted ml-auto">timed out</span>}
      </div>
      <p className="text-sm text-text1 leading-relaxed mb-3">{msg.text}</p>

      {isActive && (msg.question_type === "credentials" || isEnvVars) && (
        <CredFields
          fields={msg.fields ?? []}
          values={credValues}
          onChange={setCredValues}
          onSubmit={onSubmit}
          canSubmit={canSubmitCreds && !submitting}
          submitting={submitting}
          error={submitError}
          isEnvVars={isEnvVars}
        />
      )}

      {isActive && msg.question_type === "choice" && (
        <ChoiceButtons
          choices={msg.choices ?? []}
          selected={choiceSelected}
          onSelect={setChoiceSelected}
          onSubmit={onSubmit}
          canSubmit={!!choiceSelected && !submitting}
          submitting={submitting}
          error={submitError}
        />
      )}

      {isActive && msg.question_type === "file_upload" && (
        <FileUploadField
          jobId={jobId}
          questionId={msg.question_id!}
          onAnswered={() => onAnswered(msg.question_id!)}
        />
      )}
    </div>
  );
}


// ---- credential fields ----------------------------------------------------

function CredFields({ fields, values, onChange, onSubmit, canSubmit, submitting, error, isEnvVars }: {
  fields: AuthField[];
  values: Record<string, string>;
  onChange: (v: Record<string, string>) => void;
  onSubmit: () => void;
  canSubmit: boolean;
  submitting: boolean;
  error: string | null;
  isEnvVars?: boolean;
}) {
  const isSecret = (name: string) =>
    /key|secret|token|password|passwd|credential/i.test(name);

  return (
    <div className="space-y-2.5">
      {isEnvVars && (
        <p className="text-[11px] text-muted leading-relaxed">
          These values will be included in the generated MCP server&apos;s{" "}
          <code>.env.example</code> and README. They are not stored beyond the current job.
        </p>
      )}
      {fields.map((f: AuthField & { description?: string }) => (
        <div key={f.name}>
          <label className="block text-[11px] text-text2 mb-1">
            <code className="text-accent text-[10px]">{f.name}</code>
            {f.label && f.label !== f.name && <span className="ml-1 text-muted">— {f.label}</span>}
          </label>
          <input
            type={isSecret(f.name) ? "password" : "text"}
            value={values[f.name] ?? ""}
            onChange={(e) => onChange({ ...values, [f.name]: e.target.value })}
            onKeyDown={(e) => e.key === "Enter" && canSubmit && onSubmit()}
            autoComplete="off"
            placeholder={isEnvVars ? `Value for ${f.name}` : undefined}
            className="w-full bg-bg border border-border rounded-lg px-2.5 py-1.5 text-sm text-text1 outline-none focus:border-accent transition-colors font-mono"
          />
        </div>
      ))}
      {error && <p className="text-xs text-danger">{error}</p>}
      <button
        onClick={onSubmit}
        disabled={!canSubmit}
        className="w-full py-2 bg-accent hover:bg-accent-h disabled:opacity-40 disabled:cursor-not-allowed rounded-lg text-white text-sm font-medium transition-colors"
      >
        {submitting ? "Sending…" : isEnvVars ? "Save env vars →" : "Submit credentials →"}
      </button>
    </div>
  );
}


// ---- choice buttons -------------------------------------------------------

function ChoiceButtons({ choices, selected, onSelect, onSubmit, canSubmit, submitting, error }: {
  choices: string[];
  selected: string | null;
  onSelect: (v: string) => void;
  onSubmit: () => void;
  canSubmit: boolean;
  submitting: boolean;
  error: string | null;
}) {
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        {choices.map((c) => (
          <button
            key={c}
            onClick={() => onSelect(c)}
            className={`px-3 py-1.5 rounded-lg text-xs border transition-colors ${
              selected === c
                ? "bg-accent/25 border-accent text-accent"
                : "bg-bg border-border text-text2 hover:border-muted"
            }`}
          >
            {c}
          </button>
        ))}
      </div>
      {error && <p className="text-xs text-danger">{error}</p>}
      <button
        onClick={onSubmit}
        disabled={!canSubmit}
        className="w-full py-2 bg-accent hover:bg-accent-h disabled:opacity-40 disabled:cursor-not-allowed rounded-lg text-white text-sm font-medium transition-colors"
      >
        {submitting ? "Sending…" : "Confirm →"}
      </button>
    </div>
  );
}


// ---- file upload field ----------------------------------------------------
// Self-contained: uploads file → posts answer to /chat using questionId directly.
// Does NOT depend on any parent state closure, so it can't silently drop the answer.

function FileUploadField({ jobId, questionId, onAnswered }: {
  jobId: string;
  questionId: string;
  onAnswered: () => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [fileName, setFileName] = useState<string | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setFileName(file.name);
    setUploading(true);
    setUploadError(null);
    try {
      // Step 1 — upload file to server, get back local path
      const form = new FormData();
      form.append("file", file);
      const uploadRes = await fetch(`/api/jobs/${jobId}/upload`, { method: "POST", body: form });
      if (!uploadRes.ok) {
        const data = await uploadRes.json().catch(() => ({}));
        setUploadError(data.detail ?? "Upload failed.");
        return;
      }
      const { path } = await uploadRes.json();

      // Step 2 — submit path as answer to the pending question, using questionId directly
      const answerRes = await fetch(`/api/jobs/${jobId}/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question_id: questionId, answer: path }),
      });
      if (!answerRes.ok) {
        const data = await answerRes.json().catch(() => ({}));
        setUploadError(data.detail ?? "Failed to send answer.");
        return;
      }

      // Step 3 — notify parent so it can update UI state
      onAnswered();
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : "Upload failed.");
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="space-y-2">
      <input ref={fileRef} type="file" className="hidden" onChange={handleFile}
        accept="image/*,video/*,audio/*,.pdf,.csv,.txt,.json" />
      <button
        onClick={() => fileRef.current?.click()}
        disabled={uploading}
        className="w-full py-2.5 border-2 border-dashed border-accent/40 hover:border-accent/70 disabled:opacity-40 rounded-lg text-sm text-accent transition-colors"
      >
        {uploading ? (
          <span className="flex items-center justify-center gap-2">
            <span className="w-3.5 h-3.5 border-2 border-accent/30 border-t-accent rounded-full animate-spin" />
            Uploading {fileName}…
          </span>
        ) : fileName ? `Selected: ${fileName} — click to change` : "Click to choose a file"}
      </button>
      {uploadError && <p className="text-xs text-danger">{uploadError}</p>}
    </div>
  );
}
