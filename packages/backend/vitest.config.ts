import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    projects: [
      {
        test: {
          name: "unit",
          environment: "node",
          include: ["src/**/*.test.ts", "scripts/**/*.test.ts"],
          env: {
            BCRYPT_ROUNDS: "1",
          },
        },
      },
      {
        test: {
          name: "integration",
          environment: "node",
          include: ["tests/integration/**/*.test.ts"],
          fileParallelism: false,
          env: {
            BCRYPT_ROUNDS: "1",
            DEVICE_SECRET_KEY: "a".repeat(64),
            YOUTUBE_CLIENT_ID: "test-client-id",
            YOUTUBE_CLIENT_SECRET: "test-client-secret",
            FACEBOOK_APP_ID: "test-app-id",
            FACEBOOK_APP_SECRET: "test-app-secret",
          },
        },
      },
    ],
    coverage: {
      provider: "v8",
      reporter: ["text", "html"],
      include: ["src/**/*.ts"],
      exclude: ["src/**/*.test.ts", "src/index.ts"],
      thresholds: {
        lines: 90,
        branches: 85,
        statements: 90,
      },
    },
  },
});
