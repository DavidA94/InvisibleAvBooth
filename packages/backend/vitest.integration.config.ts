import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/integration/**/*.test.ts"],
    fileParallelism: false,
    env: {
      BCRYPT_ROUNDS: "1",
      DEVICE_SECRET_KEY: "a".repeat(64),
    },
  },
});
