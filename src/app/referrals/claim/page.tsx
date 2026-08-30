"use client";

import { Suspense, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowRight, Check, Loader2 } from "lucide-react";
import { safeJson } from "@/lib/errors";

function ClaimForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const prefilled = searchParams.get("code") || "";
  const [code, setCode] = useState(prefilled.toUpperCase());
  const [state, setState] = useState<"idle" | "sending" | "done" | "error">(
    "idle"
  );
  const [message, setMessage] = useState<string | null>(null);
  const [referrer, setReferrer] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (state === "sending") return;
    if (!code.trim()) return;
    setState("sending");
    setMessage(null);
    try {
      const res = await fetch("/api/referrals/claim", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: code.trim() }),
      });
      const data = await safeJson<{
        claimed?: boolean;
        referrer?: string;
        error?: string;
      }>(res);

      // Sign in first — claim is per-account, so it has to hang off a user.
      if (res.status === 401) {
        const next = `/referrals/claim?code=${encodeURIComponent(
          code.trim().toUpperCase()
        )}`;
        router.push(`/login?next=${encodeURIComponent(next)}`);
        return;
      }

      if (!res.ok) throw new Error(data.error || "Could not claim that code.");
      setState("done");
      setReferrer(data.referrer ?? null);
    } catch (err) {
      setState("error");
      setMessage(
        err instanceof Error ? err.message : "Could not claim that code."
      );
    }
  }

  if (state === "done") {
    return (
      <div className="rounded-xl border border-border/60 bg-card p-8 text-center">
        <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-full bg-accent/15">
          <Check className="h-5 w-5 text-accent" />
        </div>
        <h2 className="mt-4 font-semibold">Referral claimed.</h2>
        <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
          {referrer ? (
            <>
              You&rsquo;ve credited{" "}
              <span className="text-foreground">{referrer}</span> — they&rsquo;ll
              see it on their dashboard.
            </>
          ) : (
            <>The founder who invited you is now credited.</>
          )}
        </p>
        <div className="mt-6 flex items-center justify-center gap-5 text-xs">
          <Link
            href="/account"
            className="font-medium text-accent underline underline-offset-4"
          >
            Go to your account →
          </Link>
          <Link
            href="/"
            className="text-muted-foreground transition-colors hover:text-foreground"
          >
            Start an experiment
          </Link>
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="rounded-xl border border-border/60 bg-card p-8">
      <label htmlFor="code" className="label">
        Referral code
      </label>
      <input
        id="code"
        value={code}
        onChange={(e) => setCode(e.target.value.toUpperCase())}
        placeholder="ABC123XY"
        className="mt-3 h-12 w-full rounded-lg border border-border bg-transparent px-4 font-mono text-sm uppercase tracking-[0.2em] outline-none placeholder:normal-case placeholder:tracking-normal placeholder:text-muted-foreground/60 focus:border-foreground/40"
      />
      <button
        type="submit"
        disabled={state === "sending" || !code.trim()}
        className="mt-4 flex h-12 w-full items-center justify-center gap-2 rounded-lg bg-foreground text-sm font-medium text-background transition-opacity hover:opacity-90 disabled:opacity-40"
      >
        {state === "sending" ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <>
            Claim this referral
            <ArrowRight className="h-4 w-4" />
          </>
        )}
      </button>
      <p className="mt-3 text-center text-[11px] leading-relaxed text-muted-foreground/70">
        Codes are shown on every founder&rsquo;s account page and in generated
        page footers. You&rsquo;ll be asked to sign in first.
      </p>
      {state === "error" && message && (
        <p className="mt-3 text-xs text-destructive">{message}</p>
      )}
    </form>
  );
}

export default function ClaimPage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-5 py-16">
      <div className="w-full max-w-md">
        <div className="mb-10 text-center">
          <span className="label text-muted-foreground">LaunchLoop AI</span>
          <h1 className="display mt-4 text-balance text-3xl text-foreground">
            Claim a referral.
          </h1>
          <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
            Someone&rsquo;s page sent you here. Enter their code and they get
            the credit — and you&rsquo;re part of the chain.
          </p>
        </div>
        <Suspense fallback={null}>
          <ClaimForm />
        </Suspense>
        <div className="mt-8 text-center">
          <Link
            href="/login"
            className="text-xs text-muted-foreground underline underline-offset-4 transition-colors hover:text-foreground"
          >
            Just signing in? →
          </Link>
        </div>
      </div>
    </main>
  );
}
