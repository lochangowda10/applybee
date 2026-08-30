"use client";

import { useEffect } from "react";
import { RotateCw, ArrowLeft } from "lucide-react";

/**
 * App-level error boundary.
 *
 * A render crash used to take the whole page to blank white, which during a
 * demo is indistinguishable from the product being broken. This keeps the
 * frame, says plainly what happened, and offers the two actions that actually
 * help — retry this view, or go back to a page that works.
 *
 * The underlying error text is deliberately not shown: it is a React stack,
 * not a sentence, and the user can do nothing with it. It goes to the console
 * where a developer will look.
 */
export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[BOUNDARY] Unhandled render error:", error);
  }, [error]);

  return (
    <div className="min-h-screen flex items-center justify-center px-6">
      <div className="w-full max-w-md">
        <p className="label text-muted-foreground">Something broke</p>
        <h1 className="display mt-3 text-[clamp(1.6rem,4vw,2.2rem)] text-balance">
          This screen failed to render.
        </h1>
        <p className="mt-4 text-sm leading-relaxed text-muted-foreground">
          Your work is stored, not lost — experiments live in the database, so
          reloading or reopening the project URL will bring it back.
        </p>

        <div className="mt-8 flex flex-wrap gap-3">
          <button
            onClick={reset}
            className="h-10 px-5 rounded-lg bg-foreground text-background text-sm font-medium flex items-center gap-2"
          >
            <RotateCw className="w-4 h-4" />
            Try again
          </button>
          {/*
            A full page load, not a client-side route change. The router state
            is part of what just failed, so navigating within it can land on
            the same broken render — the point of this button is a clean slate.
          */}
          <button
            onClick={() => {
              // eslint-disable-next-line @next/next/no-location-assign-relative-destination -- the router is part of what just failed; a client-side push can re-enter the same broken render, which is the one outcome this button exists to avoid.
              window.location.href = "/";
            }}
            className="h-10 px-5 rounded-lg border border-border/60 text-sm flex items-center gap-2 hover:border-foreground/40 transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            Start over
          </button>
        </div>

        {error.digest && (
          <p className="mt-8 font-mono text-[11px] text-muted-foreground">
            Reference: {error.digest}
          </p>
        )}
      </div>
    </div>
  );
}
