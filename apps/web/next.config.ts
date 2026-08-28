import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["@lai/domain", "@lai/database", "@lai/prompt-engine", "@lai/providers", "@lai/permissions", "@lai/security", "@lai/shared"],
  serverExternalPackages: ["@remotion/bundler", "@remotion/renderer", "tesseract.js", "@tesseract.js-data/chi_sim", "@expo-google-fonts/noto-sans-sc"],
  experimental: { serverActions: { bodySizeLimit: "25mb" } }
};

export default nextConfig;
