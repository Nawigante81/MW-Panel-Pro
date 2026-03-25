import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import "leaflet/dist/leaflet.css";
import App from "./App";
import AppErrorBoundary from "./components/AppErrorBoundary";

if (import.meta.env.PROD) {
  window.addEventListener('unhandledrejection', (event) => {
    // Keep production console clean: report only app-originating promise errors.
    const reason = event?.reason as any
    const msg = typeof reason === 'string' ? reason : reason?.message || ''
    if (!msg) return
    if (msg.includes('background.js') || msg.includes('fido2-page-script-registration') || msg.includes('No tab with id')) {
      return
    }
    console.error('[UnhandledPromise]', msg)
  })
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <AppErrorBoundary>
      <App />
    </AppErrorBoundary>
  </StrictMode>
);
