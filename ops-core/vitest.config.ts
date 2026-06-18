import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    globals: false,
    include: ["src/**/*.{test,spec}.ts"],
    testTimeout: 15_000,
    hookTimeout: 20_000,
    setupFiles: ["./vitest.setup.ts"],
    // Integration tests share one Postgres test DB and truncate between cases,
    // so files must not run concurrently against it. The suite is small enough
    // that serial file execution is fast.
    fileParallelism: false,
  },
});
