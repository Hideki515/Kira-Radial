import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { isTauri } from "../shared/ipc";
import { ErrorBoundary } from "../shared/ErrorBoundary";
import { installErrorLogging } from "../shared/perf";
import { ShotApp } from "./ShotApp";
import "../styles/tokens.css";
import "../styles/shot.css";

if (isTauri()) document.documentElement.classList.add("is-tauri");
installErrorLogging("shot");

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ErrorBoundary source="shot" compact>
      <ShotApp />
    </ErrorBoundary>
  </StrictMode>,
);
