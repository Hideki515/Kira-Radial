import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { isTauri } from "../shared/ipc";
import { OrbApp } from "./OrbApp";
import { ErrorBoundary } from "../shared/ErrorBoundary";
import { installErrorLogging } from "../shared/perf";
import "../styles/tokens.css";
import "../styles/orb-window.css";
import "../styles/orb.css";

if (isTauri()) document.documentElement.classList.add("is-tauri");
installErrorLogging("orb");

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ErrorBoundary source="orb" compact>
      <OrbApp />
    </ErrorBoundary>
  </StrictMode>,
);
