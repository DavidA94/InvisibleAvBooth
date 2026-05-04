import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./src/test/setup.tsx"],
    exclude: ["playwright/**", "node_modules/**", "vite.config.test.ts"],
    testTimeout: 30000,
    hookTimeout: 30000,
    teardownTimeout: 60000,
    pool: "vmThreads",
    server: {
      deps: {
        inline: ["@ionic/core", "@ionic/react", "@ionic/react-router", "ionicons"],
      },
    },
    coverage: {
      provider: "v8",
      include: ["src/**/*.{ts,tsx}"],
      exclude: ["src/main.tsx", "src/App.tsx", "src/test/**", "src/types.ts", "src/vite-env.d.ts", "src/theme/**"],
      thresholds: {
        lines: 90,
        branches: 85,
        statements: 90,
      },
    },
  },
});
