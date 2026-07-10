import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/integration/**/*.test.ts"],
    fileParallelism: false,
    env: {
      BCRYPT_ROUNDS: "1",
      DEVICE_SECRET_KEY: "a".repeat(64),
      YOUTUBE_CLIENT_ID: "test-youtube-client-id",
      YOUTUBE_CLIENT_SECRET: "test-youtube-client-secret",
      FACEBOOK_APP_ID: "test-facebook-app-id",
      FACEBOOK_APP_SECRET: "test-facebook-app-secret",
    },
  },
});
