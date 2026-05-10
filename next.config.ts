import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Allow e2e tests to run multiple isolated next dev servers in the same
  // project directory by pointing each instance at its own dist dir.
  // NEXT_DIST_DIR is set by e2e/fixtures/server.ts; defaults to ".next".
  distDir: process.env.NEXT_DIST_DIR ?? ".next",
};
export default nextConfig;
