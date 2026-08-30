"use client";

import { useEffect, useState } from "react";

/**
 * Progress feedback for the long AI steps.
 *
 * Analysis takes roughly ten seconds and generating both variants takes
 * around twenty-five. Silence for that long reads as a crash, so this names
 * the stage actually being worked on and counts real elapsed seconds rather
 * than animating a fake percentage.
 *
 * The stage list is advisory: it advances on its own timings, but the elapsed
 * counter is always the truth, and if a step overruns we say so instead of
 * pretending the bar is still moving.
 */
export function ProgressStatus({
  stages,
  expectedSeconds,
  className = "",
}: {
  stages: string[];
  expectedSeconds: number;
  className?: string;
}) {
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    const started = Date.now();
    const id = setInterval(() => {
      setElapsed(Math.floor((Date.now() - started) / 1000));
    }, 250);
    return () => clearInterval(id);
  }, []);

  const perStage = Math.max(expectedSeconds / stages.length, 1);
  const index = Math.min(Math.floor(elapsed / perStage), stages.length - 1);
  const overrunning = elapsed > expectedSeconds * 1.5;
  const pctRaw = (elapsed / expectedSeconds) * 100;
  // Never claim to be finished while we are still waiting.
  const pct = Math.min(pctRaw, 95);

  return (
    <div className={className} role="status" aria-live="polite">
      <div className="flex items-baseline justify-between gap-4">
        <p className="text-sm font-medium text-foreground">
          {overrunning ? "Still working" : stages[index]}
        </p>
        <span className="font-mono text-xs tabular-nums text-muted-foreground">
          {elapsed}s
        </span>
      </div>

      <div className="mt-3 h-1 w-full overflow-hidden rounded-full bg-border">
        <div
          className="h-full rounded-full bg-foreground transition-[width] duration-500 ease-out"
          style={{ width: `${pct}%` }}
        />
      </div>

      <p className="mt-3 text-xs leading-relaxed text-muted-foreground">
        {overrunning
          ? `This is taking longer than the usual ${expectedSeconds}s. It has not failed — large repositories take more reading. We stop automatically if it goes too long.`
          : `Usually about ${expectedSeconds}s.`}
      </p>

      <ol className="mt-4 space-y-1.5">
        {stages.map((s, i) => (
          <li
            key={s}
            className={`flex items-center gap-2 text-xs ${
              i < index
                ? "text-muted-foreground"
                : i === index
                  ? "text-foreground"
                  : "text-muted-foreground/40"
            }`}
          >
            <span
              className={`inline-block h-1 w-1 shrink-0 rounded-full ${
                i < index
                  ? "bg-muted-foreground"
                  : i === index
                    ? "animate-pulse bg-foreground"
                    : "bg-muted-foreground/30"
              }`}
            />
            {s}
          </li>
        ))}
      </ol>
    </div>
  );
}

/**
 * Error presentation: a plain sentence, the next action, and a retry only when
 * retrying could plausibly help.
 */
export function ErrorNotice({
  message,
  action,
  retryable,
  onRetry,
  className = "",
}: {
  message: string;
  action: string;
  retryable: boolean;
  onRetry?: () => void;
  className?: string;
}) {
  return (
    <div
      role="alert"
      className={`rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-left ${className}`}
    >
      <p className="text-sm font-medium text-foreground">{message}</p>
      <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">
        {action}
      </p>
      {retryable && onRetry && (
        <button
          type="button"
          onClick={onRetry}
          className="mt-3 rounded-md border border-border px-3 py-1.5 text-xs font-medium transition hover:bg-accent"
        >
          Try again
        </button>
      )}
    </div>
  );
}
