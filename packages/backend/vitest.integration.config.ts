import { defineConfig } from "vitest/config";
import { tmpdir } from "os";
import { join } from "path";

// Tests must never write into the real packages/logs/app.log (steering testing.md).
const TEST_LOG_DIR = join(tmpdir(), "invisible-av-test-logs");

export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/integration/**/*.test.ts"],
    fileParallelism: false,
    env: {
      BCRYPT_ROUNDS: "1",
      LOG_DIR: TEST_LOG_DIR,
      DEVICE_SECRET_KEY: "a".repeat(64),
      YOUTUBE_CLIENT_ID: "test-youtube-client-id",
      YOUTUBE_CLIENT_SECRET: "test-youtube-client-secret",
      FACEBOOK_APP_ID: "test-facebook-app-id",
      FACEBOOK_APP_SECRET: "test-facebook-app-secret",
    },
  },
});
