import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { SettingsApp } from "./SettingsApp";
import "../styles/tokens.css";
import "../styles/radial.css";
import "../styles/themes2.css";
import "../styles/settings.css";
import "../styles/orb.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <SettingsApp />
  </StrictMode>,
);
