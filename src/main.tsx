import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { RadialApp } from "./radial/RadialApp";
import { isTauri } from "./shared/ipc";
import "./styles/tokens.css";
import "./styles/radial.css";

if (isTauri()) document.documentElement.classList.add("is-tauri");

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <RadialApp />
  </StrictMode>,
);
