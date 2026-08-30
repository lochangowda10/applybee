"use client";

import { useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { ArrowRight, Check, Loader2 } from "lucide-react";
import { safeJson } from "@/lib/errors";

function LoginForm() {
  const [email, setEmail] = useState("");
  const [state, setState] = useState<"idle" | "sending" | "done" | "error">(
    "idle"
  );
  const [devLink, setDevLink] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const searchParams = useSearchParams();
  const next = searchParams.get("next") || "";

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (state === "sending") return;
    if (!email.trim()) return;
    setState("sending");
    setMessage(null);
    setDevLink(null);
    try {
      const res = await fetch("/api/auth/request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim(), next }),
      });
      const data = await safeJson<{ sent?: boolean; devLink?: string; error?: string }>(
        res
      );
      if (!res.ok) throw new Error(data.error || "Could not send a link.");
      setState("done");
      if (data.devLink) setDevLink(data.devLink);
    } catch (err) {
      setState("error");
      setMessage(
        err instanceof Error ? err.message : "Could not send a link."
      );
    }
  }

  if (state === "done") {
    return (
      <div className="rounded-xl border border-border/60 bg-card p-8">
        <div className="flex items-start gap-3">
          <Check className="mt-0.5 h-5 w-5 shrink-0 text-accent" />
          <div>
            <h2 className="font-semibold">Check your inbox.</h2>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
              We sent a sign-in link to <span className="text-foreground">{email}</span>.
              It works once and expires in 15 minutes.
            </p>
            {devLink && (
              <div className="mt-4 rounded-lg border border-amber-500/30 bg-amber-500/5 p-4">
                <p className="label text-amber-500/90">
                  Development mode — no email provider configured
                </p>
                <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
                  This link would have been emailed. Open it directly to finish
                  signing in:
                </p>
                <a
                  href={devLink}
                  className="mt-2 block break-all font-mono text-[11px] text-accent underline underline-offset-4"
                >
                  {devLink}
                </a>
                <p className="mt-3 text-[11px] leading-relaxed text-muted-foreground/70">
                  On a real deployment, set <code>RESEND_API_KEY</code> and the
                  link is emailed instead of shown here.
                </p>
              </div>
            )}
            <div className="mt-6 flex items-center gap-5 text-xs text-muted-foreground">
              <Link
                href={next || "/account"}
                className="font-medium text-accent underline underline-offset-4 transition-colors hover:text-accent/80"
              >
                Continue once signed in →
              </Link>
              <button
                onClick={() => {
                  setState("idle");
                  setEmail("");
                }}
                className="transition-colors hover:text-foreground"
              >
                Use a different address
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="rounded-xl border border-border/60 bg-card p-8">
      <label htmlFor="email" className="label">
        Email address
      </label>
      <input
        id="email"
        type="email"
        required
        autoFocus
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        placeholder="you@company.com"
        className="mt-3 h-12 w-full rounded-lg border border-border bg-transparent px-4 text-sm outline-none placeholder:text-muted-foreground/60 focus:border-foreground/40"
      />
      <button
        type="submit"
        disabled={state === "sending" || !email.trim()}
        className="mt-4 flex h-12 w-full items-center justify-center gap-2 rounded-lg bg-foreground text-sm font-medium text-background transition-opacity hover:opacity-90 disabled:opacity-40"
      >
        {state === "sending" ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <>
            Email me a sign-in link
            <ArrowRight className="h-4 w-4" />
          </>
        )}
      </button>
      <p className="mt-3 text-center text-[11px] leading-relaxed text-muted-foreground/70">
        No password to invent or remember. The link signs you in — new addresses
        get an account automatically.
      </p>
      {state === "error" && message && (
        <p className="mt-3 text-xs text-destructive">{message}</p>
      )}
    </form>
  );
}

export default function LoginPage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-5 py-16">
      <div className="w-full max-w-md">
        <div className="mb-10 text-center">
          <span className="label text-muted-foreground">LaunchLoop AI</span>
          <h1 className="display mt-4 text-balance text-3xl text-foreground">
            Sign in to your account.
          </h1>
          <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
            Signing in lets you claim referrals, track who you brought in, and
            keep your projects across browsers.
          </p>
        </div>
        <Suspense fallback={null}>
          <LoginForm />
        </Suspense>
        <div className="mt-8 text-center">
          <Link
            href="/referrals/claim"
            className="text-xs text-muted-foreground underline underline-offset-4 transition-colors hover:text-foreground"
          >
            Have a referral code to claim? →
          </Link>
        </div>
      </div>
    </main>
  );
}
