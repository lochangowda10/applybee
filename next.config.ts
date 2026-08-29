import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // No serverExternalPackages needed — we use Neon HTTP driver
  // which works in serverless environments without native modules
};

export default nextConfig;
