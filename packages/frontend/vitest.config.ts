import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./src/test/setup.ts"],
    exclude: ["playwright/**", "node_modules/**"],
    server: {
      deps: {
        inline: ["@ionic/core", "@ionic/react", "@ionic/react-router", "ionicons"],
      },
    },
    coverage: {
      provider: "v8",
      include: ["src/**/*.{ts,tsx}"],
      exclude: ["src/main.tsx", "src/App.tsx", "src/test/**"],
      thresholds: {
        lines: 90,
        branches: 85,
        statements: 90,
      },
    },
  },
});
