import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts", "src/**/*.integration.test.ts"],
    env: {
      BCRYPT_ROUNDS: "1",
    },
    coverage: {
      provider: "v8",
      include: ["src/**/*.ts"],
      exclude: ["src/**/*.test.ts", "src/**/*.integration.test.ts"],
      thresholds: {
        lines: 90,
        branches: 85,
        statements: 90,
      },
    },
  },
});
