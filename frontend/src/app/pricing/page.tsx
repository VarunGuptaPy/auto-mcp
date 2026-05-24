"use client";

import { useState } from "react";
import Link from "next/link";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import { useAuth, FREE_JOB_LIMIT } from "@/lib/auth-context";

const PLANS = [
  {
    id:        "free",
    name:      "Free",
    price:     "$0",
    period:    "",
    tagline:   "For exploring Gichku",
    features: [
      { text: `${FREE_JOB_LIMIT} MCP servers / month`, included: true },
      { text: "Up to 50 steps per job",                included: true },
      { text: "Browser agent exploration",             included: true },
      { text: "Download MCP server",                   included: true },
      { text: "Priority job queue",                    included: false },
      { text: "Unlimited steps",                       included: false },
    ],
    cta:         "Get started free",
    ctaVariant:  "secondary" as const,
  },
  {
    id:      "pro",
    name:    "Pro",
    price:   "$4.99",
    period:  "/month",
    tagline: "For developers who ship",
    badge:   "Most popular",
    features: [
      { text: "Unlimited MCP servers",                 included: true },
      { text: "Unlimited steps per job",               included: true },
      { text: "Browser agent exploration",             included: true },
      { text: "Download MCP server",                   included: true },
      { text: "Priority job queue",                    included: true },
      { text: "Email support",                         included: true },
    ],
    cta:        "Upgrade to Pro",
    ctaVariant: "primary" as const,
  },
];

export default function PricingPage() {
  const { user, plan } = useAuth();
  const [loading, setLoading] = useState<string | null>(null);
  const [error,   setError]   = useState<string | null>(null);

  const currentPlan = plan?.plan ?? "free";

  async function handleUpgrade(planId: string) {
    if (!user) { window.location.href = "/auth?next=/pricing"; return; }
    if (planId === "free" || planId === currentPlan) return;

    setError(null);
    setLoading(planId);

    try {
      const res = await fetch("/api/payments/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          plan:          planId,
          firebase_uid:  user.uid,
          user_email:    user.email ?? "",
          success_url:   `${window.location.origin}/dashboard?upgraded=1`,
          cancel_url:    `${window.location.origin}/pricing`,
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.detail ?? "Payment provider error. Please try again.");
      }

      const { checkout_url } = await res.json();
      window.location.href = checkout_url;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong.");
      setLoading(null);
    }
  }

  return (
    <div className="flex flex-col min-h-screen">
      <Navbar />
      <main className="flex-1 px-4 py-20">

        {/* Header */}
        <div className="max-w-2xl mx-auto text-center mb-14">
          <p className="text-xs font-semibold uppercase tracking-widest text-accent mb-3">
            Pricing
          </p>
          <h1 className="text-4xl sm:text-5xl font-bold text-text1 leading-tight mb-4">
            Simple, transparent pricing
          </h1>
          <p className="text-text2 text-lg">
            Start free. Upgrade when you&apos;re ready for more.
          </p>
        </div>

        {/* Plans */}
        <div className="max-w-3xl mx-auto grid grid-cols-1 md:grid-cols-2 gap-6 mb-14">
          {PLANS.map((p) => {
            const isCurrent  = currentPlan === p.id;
            const isPrimary  = p.ctaVariant === "primary";

            return (
              <div
                key={p.id}
                className={`relative rounded-2xl p-7 border transition-all ${
                  isPrimary
                    ? "bg-accent/10 border-accent/40"
                    : "bg-surface border-border"
                }`}
                style={isPrimary ? { boxShadow: "0 0 0 1px rgba(99,102,241,0.2), 0 0 40px rgba(99,102,241,0.08)" } : {}}
              >
                {p.badge && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-1 bg-accent text-white text-xs font-semibold rounded-full whitespace-nowrap">
                    {p.badge}
                  </div>
                )}

                {isCurrent && (
                  <div className="absolute top-4 right-4 text-[11px] font-medium text-success bg-success/10 border border-success/30 rounded-full px-2.5 py-0.5">
                    Current plan
                  </div>
                )}

                <p className="text-sm font-medium text-text2 mb-1.5">{p.name}</p>
                <div className="flex items-baseline gap-1 mb-1">
                  <span className="text-4xl font-bold text-text1">{p.price}</span>
                  {p.period && <span className="text-text2 text-sm">{p.period}</span>}
                </div>
                <p className="text-sm text-text2 mb-6">{p.tagline}</p>

                <ul className="space-y-2.5 mb-7">
                  {p.features.map((f) => (
                    <li key={f.text} className={`flex items-center gap-2.5 text-sm ${f.included ? "text-text2" : "text-muted line-through"}`}>
                      {f.included ? (
                        <span className="shrink-0 w-4 h-4 rounded-full bg-success/15 border border-success/35 flex items-center justify-center text-success text-[10px]">✓</span>
                      ) : (
                        <span className="shrink-0 w-4 h-4 rounded-full bg-border flex items-center justify-center text-muted text-[10px]">✕</span>
                      )}
                      {f.text}
                    </li>
                  ))}
                </ul>

                <button
                  onClick={() => handleUpgrade(p.id)}
                  disabled={isCurrent || loading === p.id || p.id === "free"}
                  className={`w-full py-2.5 rounded-xl text-sm font-semibold transition-colors flex items-center justify-center gap-2 ${
                    isCurrent
                      ? "bg-surface-2 text-muted cursor-default border border-border"
                      : isPrimary
                      ? "bg-accent hover:bg-accent-h text-white disabled:opacity-50"
                      : p.id === "free"
                      ? "bg-surface-2 border border-border text-text1 hover:bg-border"
                      : "bg-surface-2 border border-border text-text1 hover:bg-border"
                  }`}
                >
                  {loading === p.id && (
                    <span className="w-4 h-4 border-2 border-current/30 border-t-current rounded-full animate-spin" />
                  )}
                  {isCurrent
                    ? "Current plan"
                    : p.id === "free"
                    ? user ? "You're on Free" : "Get started free"
                    : p.cta}
                </button>
              </div>
            );
          })}
        </div>

        {error && (
          <div className="max-w-md mx-auto bg-danger/10 border border-danger/30 rounded-xl px-4 py-3 text-danger text-sm text-center mb-8">
            {error}
          </div>
        )}

        {/* FAQ */}
        <div className="max-w-2xl mx-auto">
          <h2 className="text-xl font-bold text-text1 text-center mb-8">
            Frequently asked questions
          </h2>
          <div className="space-y-4">
            {FAQ.map((item) => (
              <FaqItem key={item.q} q={item.q} a={item.a} />
            ))}
          </div>
        </div>

        {/* Bottom CTA */}
        <div className="max-w-xl mx-auto text-center mt-16">
          <p className="text-text2 text-sm mb-4">
            Questions about enterprise or custom plans?
          </p>
          <a
            href="mailto:hello@gichku.com"
            className="text-accent hover:text-accent-h font-medium text-sm"
          >
            Contact us →
          </a>
        </div>
      </main>
      <Footer />
    </div>
  );
}

const FAQ = [
  {
    q: "What counts as one MCP server?",
    a: "Each job submission counts as one. A job is a single URL you submit to Gichku, which produces one MCP server zip file.",
  },
  {
    q: "What happens if I hit the free limit?",
    a: "You can still view and download your previous MCP servers. To generate new ones, upgrade to Pro or wait for the monthly reset.",
  },
  {
    q: "Is my source code sent to third parties?",
    a: "No. Code analysis happens entirely on the server. Code chunks are stored locally in ChromaDB on your machine.",
  },
  {
    q: "What payment methods do you accept?",
    a: "All major credit and debit cards via DodoPayments. We don't store your card details.",
  },
  {
    q: "Can I cancel anytime?",
    a: "Yes. Cancel from your account settings at any time. You keep Pro access until the end of your billing period.",
  },
];

function FaqItem({ q, a }: { q: string; a: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="border border-border rounded-xl overflow-hidden">
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between px-5 py-4 text-left hover:bg-surface transition-colors"
      >
        <span className="text-sm font-medium text-text1">{q}</span>
        <span className={`text-muted transition-transform duration-200 ${open ? "rotate-180" : ""}`}>
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
          </svg>
        </span>
      </button>
      {open && (
        <div className="px-5 pb-4 text-sm text-text2 leading-relaxed border-t border-border bg-surface">
          {a}
        </div>
      )}
    </div>
  );
}
