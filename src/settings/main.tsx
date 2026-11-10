import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { ErrorBoundary } from "../shared/ErrorBoundary";
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
