const METHOD_STYLES: Record<string, string> = {
  GET:    "bg-emerald-950 text-emerald-400 border-emerald-900",
  POST:   "bg-orange-950 text-orange-400 border-orange-900",
  PUT:    "bg-indigo-950 text-indigo-400 border-indigo-900",
  PATCH:  "bg-lime-950  text-lime-400  border-lime-900",
  DELETE: "bg-red-950   text-red-400   border-red-900",
};

export default function MethodPill({ method }: { method: string }) {
  const upper = method.toUpperCase();
  const cls = METHOD_STYLES[upper] ?? "bg-zinc-900 text-zinc-400 border-zinc-700";
  return (
    <span
      className={`inline-flex items-center px-1.5 py-0.5 rounded text-[11px] font-mono font-medium border ${cls}`}
    >
      {upper}
    </span>
  );
}
