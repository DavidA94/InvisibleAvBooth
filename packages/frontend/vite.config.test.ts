import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Vite config for Playwright E2E tests.
// No socket.io proxy — Playwright's routeWebSocket intercepts directly.
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      "/api": "http://localhost:3000",
    },
  },
});
