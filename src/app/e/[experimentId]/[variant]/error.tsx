"use client";

import { useEffect } from "react";
import { RotateCw } from "lucide-react";

/**
 * Error boundary for the generated landing pages.
 *
 * These pages are the only surface a stranger ever sees, usually seconds after
 * scanning a QR code on someone else's phone. They get their own boundary
 * because the app-level fallback talks about projects and experiments, which
 * would mean nothing to a visitor who came here to read about a product.
 *
 * Note what this deliberately does not do: it does not record an event. A page
 * that failed to render was not a page view, and inflating the count with
 * crashes would corrupt the exact number a founder is about to draw a
 * conclusion from.
 */
export default function VariantError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[BOUNDARY] Variant page failed to render:", error);
  }, [error]);

  return (
    <div className="min-h-screen flex items-center justify-center px-6 text-center">
      <div className="max-w-sm">
        <h1 className="text-xl font-semibold tracking-tight">
          This page didn&rsquo;t load.
        </h1>
        <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
          Nothing is wrong on your end. Give it another try.
        </p>
        <button
          onClick={reset}
          className="mt-6 h-10 px-5 rounded-lg bg-foreground text-background text-sm font-medium inline-flex items-center gap-2"
        >
          <RotateCw className="w-4 h-4" />
          Reload
        </button>
      </div>
    </div>
  );
}
