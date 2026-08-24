import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./src/test/setup.tsx"],
    exclude: ["playwright/**", "node_modules/**", "dist/**", "vite.config.test.ts"],
    testTimeout: 30000,
    hookTimeout: 30000,
    teardownTimeout: 60000,
    dangerouslyIgnoreUnhandledErrors: true,
    pool: "vmThreads",
    server: {
      deps: {
        inline: ["@ionic/core", "@ionic/react", "@ionic/react-router", "ionicons"],
      },
    },
    coverage: {
      provider: "v8",
      reporter: ["text", "html"],
      include: ["src/**/*.{ts,tsx}"],
      exclude: [
        "src/main.tsx",
        "src/App.tsx",
        "src/test/**",
        "src/types.ts",
        "src/vite-env.d.ts",
        "src/theme/**",
        "src/components/grid-editor/GridEditor.tsx",
        "src/pages/AdminDashboardManagement.tsx",
      ],
      thresholds: {
        lines: 90,
        branches: 85,
        statements: 90,
      },
    },
  },
});
