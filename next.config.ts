import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // No serverExternalPackages needed — we use Neon HTTP driver
  // which works in serverless environments without native modules

  /**
   * Baseline security headers on every response.
   *
   * A strict Content-Security-Policy is deliberately absent: Next.js App
   * Router ships inline scripts that require a per-request nonce, and a CSP
   * written without that plumbing breaks the entire site — the one outcome
   * worse than a missing header. The four below carry no such risk:
   * nothing in the app is framed, and no sensor APIs are used.
   */
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=()",
          },
        ],
      },
    ];
  },
};

export default nextConfig;
