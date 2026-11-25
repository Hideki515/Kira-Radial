import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { RadialApp } from "./radial/RadialApp";
import { ErrorBoundary } from "./shared/ErrorBoundary";
import { installErrorLogging } from "./shared/perf";
import { isTauri } from "./shared/ipc";
import "./styles/tokens.css";
import "./styles/radial.css";
import "./styles/themes2.css";
import "./styles/themes3.css";
import "./styles/themes4.css";
import "./styles/themes5.css";
import "./styles/themes6.css";
import "./styles/themes7.css";
import "./styles/themes8.css";

if (isTauri()) document.documentElement.classList.add("is-tauri");
installErrorLogging("radial");

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ErrorBoundary source="radial" compact>
      <RadialApp />
    </ErrorBoundary>
  </StrictMode>,
);
