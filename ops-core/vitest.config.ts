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
    coverage: {
      provider: "v8",
      reporter: ["text", "text-summary", "json-summary", "html"],
      reportsDirectory: "./coverage",
      // Only the deterministic business logic — services, engines, controllers,
      // middlewares, utils. Bootstrap/config/route-wiring/scripts are excluded;
      // they are exercised end-to-end but carry no branch logic worth gating on.
      include: [
        "src/modules/**/*.ts",
        "src/services/**/*.ts",
        "src/controllers/**/*.ts",
        "src/middlewares/**/*.ts",
        "src/utils/**/*.ts",
        "src/errors/**/*.ts",
      ],
      exclude: ["**/*.test.ts", "**/*.spec.ts", "**/*.d.ts", "src/**/routes.ts", "src/**/*.routes.ts"],
    },
  },
});
