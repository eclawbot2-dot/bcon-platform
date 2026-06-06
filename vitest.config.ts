import { defineConfig } from "vitest/config";
import path from "path";

// Vitest config — runs the security-critical helper tests plus the
// DB-touching tests against a dedicated Postgres test database (see
// tests/_db.ts). File parallelism is disabled so the many DB-touching
// files don't open their connection pools all at once and exhaust
// Postgres max_connections; each file still creates uniquely-slugged
// rows so there is no cross-file interference.
export default defineConfig({
  test: {
    include: ["tests/**/*.test.ts"],
    environment: "node",
    testTimeout: 15000,
    fileParallelism: false,
    setupFiles: ["./tests/setup-env.ts"],
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
    },
  },
});
