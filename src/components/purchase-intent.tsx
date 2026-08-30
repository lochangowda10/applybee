"use client";

import { useCallback, useEffect, useState } from "react";
import { Check, Loader2 } from "lucide-react";
import { safeJson } from "@/lib/errors";

/**
 * Records that someone would pay, and shows how many already said so.
 *
 * "Would anyone actually pay for this" is the question this product gets asked
 * most, and the honest answer is a count of real people rather than a pricing
 * table delivered confidently. So this captures intent and publishes the
 * running total — with the caveat stated on the same line as the number, since
 * a signup is not a payment and a surface that blurred the two would be doing
 * exactly what this product criticises other tools for.
 */

type Summary = {
  total: number;
  committedUsd: number;
  recent: { email: string; plan: string; created_at: string }[];
};

const PLANS = [
  { id: "starter", label: "Starter · $19" },
  { id: "growth", label: "Growth · $79" },
];

export function PurchaseIntent() {
  const [summary, setSummary] = useState<Summary | null>(null);
  const [plan, setPlan] = useState("starter");
  const [email, setEmail] = useState("");
  const [state, setState] = useState<"idle" | "sending" | "done" | "error">("idle");
  const [message, setMessage] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/interest");
      const data = await safeJson<Summary>(res);
      setSummary(data);
    } catch {
      // A missing count is not worth an error state; the form still works.
    }
  }, []);

  /**
   * The count is fetched once the section mounts. It is scheduled rather than
   * awaited inline so the first paint never waits on it: the form is usable
   * with or without the number beside it.
   */
  useEffect(() => {
    const id = setTimeout(() => {
      void load();
    }, 0);
    return () => clearTimeout(id);
  }, [load]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (state === "sending") return;
    setState("sending");
    setMessage(null);
    try {
      const res = await fetch("/api/interest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, plan }),
      });
      const data = await safeJson<{ error?: string }>(res);
      if (!res.ok) throw new Error(data.error || "Could not record that.");
      setState("done");
      setEmail("");
      void load();
    } catch (err) {
      setState("error");
      setMessage(err instanceof Error ? err.message : "Could not record that.");
    }
  }

  return (
    <div className="mt-8 rounded-xl border border-border/60 p-6">
      <div className="flex flex-wrap items-end justify-between gap-6">
        <div>
          <h3 className="text-sm font-medium">Would you pay for this?</h3>
          <p className="mt-1 max-w-md text-xs leading-relaxed text-muted-foreground">
            Leave an address and we&rsquo;ll open your plan when billing goes
            live. Nothing is charged now, and this is recorded as intent — not
            as revenue.
          </p>
          {/* The quota refusal tells people to "join the waitlist" and points
              them here, so this form has to say plainly that it is that
              thing — otherwise the offer sends them somewhere they do not
              recognise. */}
          <p className="mt-2 max-w-md text-xs leading-relaxed text-muted-foreground">
            It also lifts the free tier straight away: 8 experiments a month
            instead of one a week.
          </p>
        </div>

        {summary && (
          <div className="flex gap-8">
            <div>
              <div className="text-2xl font-bold tabular-nums">
                {summary.total}
              </div>
              <p className="label mt-1 text-muted-foreground">
                said they&rsquo;d pay
              </p>
            </div>
            <div>
              <div className="text-2xl font-bold tabular-nums">
                ${summary.committedUsd}
              </div>
              <p className="label mt-1 text-muted-foreground">
                intent, not billed
              </p>
            </div>
          </div>
        )}
      </div>

      <form onSubmit={submit} className="mt-6 flex flex-col gap-3 sm:flex-row">
        <div className="flex gap-2">
          {PLANS.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => setPlan(p.id)}
              aria-pressed={plan === p.id}
              className={`h-11 whitespace-nowrap rounded-lg border px-4 text-sm transition-colors ${
                plan === p.id
                  ? "border-foreground/40 bg-muted/40 text-foreground"
                  : "border-border/60 text-muted-foreground hover:text-foreground"
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>

        <input
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@company.com"
          aria-label="Email address"
          className="h-11 min-w-0 flex-1 rounded-lg border border-border/60 bg-transparent px-4 text-sm outline-none placeholder:text-muted-foreground/60 focus:border-foreground/40"
        />

        <button
          type="submit"
          disabled={state === "sending"}
          className="flex h-11 items-center justify-center gap-2 whitespace-nowrap rounded-lg bg-foreground px-5 text-sm font-medium text-background disabled:opacity-60"
        >
          {state === "sending" ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : state === "done" ? (
            <Check className="h-4 w-4" />
          ) : null}
          {state === "done" ? "Recorded" : "Reserve a plan"}
        </button>
      </form>

      {state === "done" && (
        <p className="mt-3 text-xs text-muted-foreground">
          Recorded. You have not been charged — we&rsquo;ll email you when
          billing opens.
        </p>
      )}
      {state === "error" && message && (
        <p className="mt-3 text-xs text-destructive">{message}</p>
      )}

      {summary && summary.recent.length > 0 && (
        <div className="mt-6 border-t border-border/50 pt-5">
          <p className="label mb-3 text-muted-foreground">
            Most recent — addresses masked
          </p>
          <div className="flex flex-wrap gap-2">
            {summary.recent.map((r, i) => (
              <span
                key={`${r.email}-${i}`}
                className="rounded-md border border-border/50 px-2.5 py-1 font-mono text-[11px] text-muted-foreground"
              >
                {r.email} · {r.plan}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
