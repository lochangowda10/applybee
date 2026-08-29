"use client";

import { use, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";

/**
 * A/B Distribution Page
 *
 * When a visitor opens /x/{experimentId}:
 * 1. Check if they already have an assignment for this experiment
 * 2. If not, randomly assign A or B (50/50)
 * 3. Persist the assignment in localStorage
 * 4. Redirect to the assigned variant
 */
export default function DistributionPage({
  params,
}: {
  params: Promise<{ experimentId: string }>;
}) {
  const { experimentId } = use(params);
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const storageKey = `ll_assign_${experimentId}`;
    let assignment = localStorage.getItem(storageKey);

    if (!assignment || (assignment !== "a" && assignment !== "b")) {
      // Random 50/50 assignment
      assignment = Math.random() < 0.5 ? "a" : "b";
      localStorage.setItem(storageKey, assignment);
    }

    // Small delay to ensure localStorage is written
    const timer = setTimeout(() => {
      try {
        router.replace(`/e/${experimentId}/${assignment}`);
      } catch {
        setError("Failed to redirect. Please try the direct link.");
      }
    }, 100);

    return () => clearTimeout(timer);
  }, [experimentId, router]);

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <p className="text-sm text-destructive mb-4">{error}</p>
          <div className="flex gap-3 justify-center">
            <a
              href={`/e/${experimentId}/a`}
              className="px-4 py-2 rounded-lg bg-foreground text-background text-sm font-medium"
            >
              Try Variant A
            </a>
            <a
              href={`/e/${experimentId}/b`}
              className="px-4 py-2 rounded-lg border border-border text-sm font-medium"
            >
              Try Variant B
            </a>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="text-center">
        <Loader2 className="w-6 h-6 animate-spin mx-auto mb-3 text-muted-foreground" />
        <p className="text-sm text-muted-foreground">Setting up your experiment…</p>
      </div>
    </div>
  );
}
