import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import { useStore } from "./store";

// Global 401 interceptor — clears auth state on expired session
const originalFetch = window.fetch.bind(window);
window.fetch = async (...args: Parameters<typeof fetch>): Promise<Response> => {
  const response = await originalFetch(...args);
  if (response.status === 401 && useStore.getState().user) {
    useStore.getState().clearUser();
  }
  return response;
};

const rootEl = document.getElementById("root");
if (!rootEl) throw new Error("Root element not found");

createRoot(rootEl).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
