/// <reference types="vitest" />
import { resolve } from "node:path";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import pkg from "./package.json";

// Porta fixa: o Tauri (src-tauri/tauri.conf.json -> devUrl) aponta para ela.
// Três páginas: index.html (menu), settings.html (configurações) e orb.html (ícone flutuante).
export default defineConfig({
  plugins: [react()],
  define: { __APP_VERSION__: JSON.stringify(pkg.version) },
  clearScreen: false,
  server: { port: 1420, strictPort: true, watch: { ignored: ["**/src-tauri/**"] } },
  build: {
    target: "es2021",
    rollupOptions: {
      input: {
        main: resolve(__dirname, "index.html"),
        settings: resolve(__dirname, "settings.html"),
        orb: resolve(__dirname, "orb.html"),
      },
    },
  },
  test: { environment: "jsdom" },
});
