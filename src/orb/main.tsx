import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { isTauri } from "../shared/ipc";
import { OrbApp } from "./OrbApp";
import "../styles/tokens.css";
import "../styles/orb.css";

if (isTauri()) document.documentElement.classList.add("is-tauri");

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <OrbApp />
  </StrictMode>,
);
