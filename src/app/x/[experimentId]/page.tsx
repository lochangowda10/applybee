"use client";

import { use, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";

/**
 * Traffic split. This is where a scanned QR code lands.
 *
 * A visitor is assigned A or B once and keeps that assignment, so a second
 * visit does not silently move them into the other arm and corrupt the
 * comparison the founder is about to read.
 *
 * Every storage access is guarded. A phone in private browsing throws on the
 * first localStorage read, and an unguarded throw here would take the visitor
 * to an error screen instead of the page they scanned for — on the one surface
 * where the visitor is a stranger who will not try twice. Losing stickiness is
 * an acceptable degradation; losing the visitor is not.
 */

function readAssignment(key: string): "a" | "b" | null {
  try {
    const value = localStorage.getItem(key);
    return value === "a" || value === "b" ? value : null;
  } catch {
    return null;
  }
}

function persistAssignment(key: string, value: "a" | "b"): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    // Storage unavailable. The visitor still gets a page; they just are not
    // pinned to this arm if they come back.
  }
}

export default function DistributionPage({
  params,
}: {
  params: Promise<{ experimentId: string }>;
}) {
  const { experimentId } = use(params);
  const router = useRouter();
  const [stalled, setStalled] = useState(false);

  useEffect(() => {
    const key = `ll_assign_${experimentId}`;
    const assignment = readAssignment(key) ?? (Math.random() < 0.5 ? "a" : "b");
    persistAssignment(key, assignment);

    router.replace(`/e/${experimentId}/${assignment}`);

    // If the client-side navigation has not happened shortly, offer a plain
    // link rather than leaving a stranger watching a spinner.
    const timer = setTimeout(() => setStalled(true), 2500);
    return () => clearTimeout(timer);
  }, [experimentId, router]);

  return (
    <div className="min-h-screen flex items-center justify-center px-6">
      <div className="text-center">
        <Loader2 className="w-5 h-5 animate-spin mx-auto text-muted-foreground" />
        {stalled && (
          <div className="mt-6">
            <p className="text-sm text-muted-foreground">Taking longer than it should.</p>
            <a
              href={`/e/${experimentId}/a`}
              className="mt-3 inline-block text-sm underline underline-offset-4"
            >
              Open the page
            </a>
          </div>
        )}
      </div>
    </div>
  );
}
