import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

// Minimal entry point — App shell is implemented in task 39.
const rootEl = document.getElementById("root");
if (!rootEl) throw new Error("Root element not found");

createRoot(rootEl).render(<StrictMode><div /></StrictMode>);
