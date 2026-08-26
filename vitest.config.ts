import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@lai/domain": path.resolve("packages/domain/src/index.ts"),
      "@lai/database": path.resolve("packages/database/src/index.ts"),
      "@lai/prompt-engine": path.resolve("packages/prompt-engine/src/index.ts"),
      "@lai/providers": path.resolve("packages/providers/src/index.ts"),
      "@lai/permissions": path.resolve("packages/permissions/src/index.ts"),
      "@lai/security": path.resolve("packages/security/src/index.ts"),
      "@lai/shared": path.resolve("packages/shared/src/index.ts")
    }
  },
  test: { environment: "node", fileParallelism: false, coverage: { reporter: ["text", "json-summary"] } }
});
