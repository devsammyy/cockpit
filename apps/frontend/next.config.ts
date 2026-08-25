import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  allowedDevOrigins: ["127.0.0.1"],
  // Standalone output is required by the production Dockerfile, which copies
  // .next/standalone into a minimal runtime image.
  output: "standalone",
  poweredByHeader: false,
  reactStrictMode: true,
  transpilePackages: [
    "@qwen-autopilot/shared-types",
    "@qwen-autopilot/shared-utils",
    "@qwen-autopilot/ui",
  ],
  typedRoutes: true,
};

export default nextConfig;
