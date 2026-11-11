import { resolve } from "node:path";
import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import pkg from "./package.json" with { type: "json" };

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
        main: resolve(import.meta.dirname, "index.html"),
        settings: resolve(import.meta.dirname, "settings.html"),
        orb: resolve(import.meta.dirname, "orb.html"),
      },
    },
  },
  test: {
    environment: "jsdom",
    // Testes de página inteira (ex.: editor de tema) passam de 5 s com cobertura e CPU disputada.
    testTimeout: 20_000,
    // npm run coverage → resumo no terminal + relatório em coverage/index.html (fora do git).
    coverage: {
      provider: "v8",
      include: ["src/**/*.{ts,tsx}"],
      exclude: ["src/**/*.test.{ts,tsx}", "src/**/*.d.ts", "src/main.tsx", "src/*/main.tsx"],
      reporter: ["text-summary", "html", "json-summary"],
      reportsDirectory: "coverage",
      // Mesmo com algum teste falhando, grava o relatório (e o total) para comparação.
      reportOnFailure: true,
    },
  },
});
