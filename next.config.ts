import type { NextConfig } from "next";

/**
 * GitHub Pages serves a project site from /<repo>/, so the build needs a base
 * path there and none locally. NEXT_PUBLIC_BASE_PATH carries it to the client
 * as well, because Next rewrites its own routes and /_next assets but not the
 * absolute /media and /sylvasense-report.json paths this app fetches itself.
 */
const base = process.env.NEXT_PUBLIC_BASE_PATH ?? "";

const nextConfig: NextConfig = {
  output: "export",
  basePath: base || undefined,
  images: { unoptimized: true },
};

export default nextConfig;
