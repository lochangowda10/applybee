"use client";

import { useEffect } from "react";
import { useParams } from "next/navigation";
import { RotateCw } from "lucide-react";

/**
 * Error boundary for the founder's dashboard.
 *
 * This one names the recovery path precisely, because the dashboard is where a
 * founder has the most to lose and the least reason to believe it survived: it
 * is the screen with the live counts on it. Everything it renders is read from
 * Postgres, so the honest reassurance is that reloading this exact URL restores
 * the run — including the experiment, the variants, and the responses.
 */
export default function ProjectError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const params = useParams();
  const projectId = params?.projectId as string | undefined;

  useEffect(() => {
    console.error("[BOUNDARY] Dashboard failed to render:", error);
  }, [error]);

  return (
    <div className="min-h-screen flex items-center justify-center px-6">
      <div className="w-full max-w-md">
        <p className="label text-muted-foreground">Dashboard</p>
        <h1 className="display mt-3 text-[clamp(1.6rem,4vw,2.2rem)] text-balance">
          This view failed to render.
        </h1>
        <p className="mt-4 text-sm leading-relaxed text-muted-foreground">
          Your experiment is unaffected. The live pages are still serving and
          still recording visitors — this is the dashboard, not the pages.
          Everything on this screen is read from the database, so reloading
          restores it.
        </p>

        <div className="mt-8 flex flex-wrap gap-3">
          <button
            onClick={reset}
            className="h-10 px-5 rounded-lg bg-foreground text-background text-sm font-medium flex items-center gap-2"
          >
            <RotateCw className="w-4 h-4" />
            Reload the dashboard
          </button>
          {projectId && (
            <a
              href={`/project/${projectId}`}
              className="h-10 px-5 rounded-lg border border-border/60 text-sm flex items-center hover:border-foreground/40 transition-colors"
            >
              Reopen from the database
            </a>
          )}
        </div>
      </div>
    </div>
  );
}
