#!/usr/bin/env node
// Gera a "Kira de teste" (QA): identifier e pasta de dados próprios, janelas fora da tela,
// sem atalho/bandeja/autostart e com comandos de automação qa_*. Não interfere na Kira instalada.
// Saída: src-tauri/target-qa/release/kira-radial.exe
// Uso: node scripts/build-qa.mjs
import { execSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const env = { ...process.env, CARGO_TARGET_DIR: join(root, "src-tauri", "target-qa") };
// Comando fixo numa linha só (lista de argumentos + shell gera o aviso DEP0190 do Node).
execSync("npx tauri build --no-bundle --features qa --config src-tauri/tauri.qa.conf.json", { cwd: root, env, stdio: "inherit" });
console.log("\nKira de teste: src-tauri/target-qa/release/kira-radial.exe  (dados em %APPDATA%\\Kira-Radial-QA)");
