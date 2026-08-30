"use client";

import { useEffect } from "react";

/**
 * Last-resort boundary, for a failure in the root layout itself.
 *
 * At this level the app's own styles may not have loaded, so this deliberately
 * ships inline styles and its own html/body — a boundary that depends on the
 * thing that just broke is not a boundary.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[BOUNDARY] Root layout failed:", error);
  }, [error]);

  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#0a0a0a",
          color: "#fafafa",
          fontFamily:
            "ui-sans-serif, system-ui, -apple-system, Segoe UI, sans-serif",
          padding: "24px",
        }}
      >
        <div style={{ maxWidth: "24rem" }}>
          <h1 style={{ fontSize: "1.5rem", margin: 0, letterSpacing: "-0.02em" }}>
            LaunchLoop failed to start.
          </h1>
          <p
            style={{
              marginTop: "12px",
              fontSize: "0.875rem",
              lineHeight: 1.6,
              color: "#a1a1aa",
            }}
          >
            Nothing was lost. Every experiment lives in the database, so
            reopening its URL brings it back.
          </p>
          <button
            onClick={reset}
            style={{
              marginTop: "24px",
              height: "40px",
              padding: "0 20px",
              borderRadius: "8px",
              border: "none",
              background: "#fafafa",
              color: "#0a0a0a",
              fontSize: "0.875rem",
              fontWeight: 500,
              cursor: "pointer",
            }}
          >
            Try again
          </button>
        </div>
      </body>
    </html>
  );
}
