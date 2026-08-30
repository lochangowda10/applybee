"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Check, Loader2 } from "lucide-react";
import { safeJson } from "@/lib/errors";

function Confirm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get("token");
  // The missing-token case is known before any effect runs, so it becomes the
  // initial state rather than a synchronous setState inside an effect.
  const [state, setState] = useState<"checking" | "ok" | "failed">(
    token ? "checking" : "failed"
  );
  const [error, setError] = useState<string | null>(
    token ? null : "That link is missing its token."
  );

  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    async function confirm() {
      try {
        const res = await fetch("/api/auth/confirm", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ token }),
        });
        const data = await safeJson<{ error?: string }>(res);
        if (!res.ok) throw new Error(data.error || "That link did not work.");
        if (cancelled) return;
        setState("ok");
        const next = searchParams.get("next");
        setTimeout(() => router.replace(next || "/account"), 1200);
      } catch (err) {
        if (cancelled) return;
        setState("failed");
        setError(
          err instanceof Error ? err.message : "That link did not work."
        );
      }
    }
    void confirm();
    return () => {
      cancelled = true;
    };
  }, [token, searchParams, router]);

  if (state === "checking") {
    return (
      <div className="flex items-center justify-center gap-2 text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />
        Signing you in…
      </div>
    );
  }

  if (state === "ok") {
    return (
      <div className="flex items-center justify-center gap-2 text-sm text-foreground">
        <Check className="h-4 w-4 text-accent" />
        You&rsquo;re signed in.
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-border/60 bg-card p-8 text-center">
      <h2 className="font-semibold">That link did not work.</h2>
      <p className="mt-2 text-sm text-muted-foreground">
        {error || "The link may be expired or already used."}
      </p>
      <Link
        href="/login"
        className="mt-5 inline-block text-sm font-medium text-accent underline underline-offset-4"
      >
        Request a new sign-in link →
      </Link>
    </div>
  );
}

export default function ConfirmPage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-5 py-16">
      <div className="w-full max-w-md">
        <div className="mb-10 text-center">
          <span className="label text-muted-foreground">LaunchLoop AI</span>
          <h1 className="display mt-4 text-balance text-3xl text-foreground">
            Completing your sign-in.
          </h1>
        </div>
        <Suspense fallback={null}>
          <Confirm />
        </Suspense>
      </div>
    </main>
  );
}
