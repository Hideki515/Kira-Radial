import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { ErrorBoundary } from "../shared/ErrorBoundary";
import { settingsReady } from "../shared/ipc";
import { installErrorLogging } from "../shared/perf";
import { SettingsApp } from "./SettingsApp";
import "../styles/tokens.css";
import "../styles/radial.css";
import "../styles/themes2.css";
import "../styles/settings.css";
import "../styles/orb.css";

installErrorLogging("settings");

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ErrorBoundary source="settings">
      <SettingsApp />
    </ErrorBoundary>
  </StrictMode>,
);

// Página carregada: se a janela ainda está escondida, o backend pede ao WebView2 para não desenhar.
const ready = () => void settingsReady();
if (document.readyState === "complete") ready();
else window.addEventListener("load", ready, { once: true });
