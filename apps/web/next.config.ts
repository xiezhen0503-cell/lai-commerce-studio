import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["@lai/domain", "@lai/database", "@lai/prompt-engine", "@lai/providers", "@lai/permissions", "@lai/security", "@lai/shared"],
  experimental: { serverActions: { bodySizeLimit: "25mb" } }
};

export default nextConfig;
