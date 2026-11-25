#!/usr/bin/env node
// Gera a "Kira de teste" (QA): identifier e pasta de dados próprios, janelas fora da tela,
// sem atalho/bandeja/autostart e com comandos de automação qa_*. Não interfere na Kira instalada.
// Saída: src-tauri/target-qa/release/kira-radial.exe
// Uso: node scripts/build-qa.mjs            (gera o front e a Kira de teste)
//      node scripts/build-qa.mjs --no-front (usa o dist/ já gerado: QA em paralelo, onde o
//                                            front é gerado uma vez antes de começar)
import { execSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const env = {
  ...process.env,
  CARGO_TARGET_DIR: join(root, "src-tauri", "target-qa"),
  // Build de teste rápido: sem LTO, com várias unidades de compilação e incremental. Assim, a
  // partir da 2ª vez, só o código da Kira é recompilado (~1–2 min em vez de ~7). O build final
  // (instalador/release) continua com o perfil do Cargo.toml (LTO, 1 unidade) e é medido
  // pelo qa-rust; a Kira de teste só precisa se comportar igual.
  CARGO_PROFILE_RELEASE_LTO: "false",
  CARGO_PROFILE_RELEASE_CODEGEN_UNITS: "16",
  CARGO_PROFILE_RELEASE_INCREMENTAL: "true",
};
const noFront = process.argv.includes("--no-front");
// Sem o beforeBuildCommand, o tauri não regera o dist/ (outro agente pode estar lendo).
const skip = noFront ? " --config src-tauri/tauri.nofront.conf.json" : "";
// Comando fixo numa linha só (lista de argumentos + shell gera o aviso DEP0190 do Node).
execSync(`npx tauri build --no-bundle --features qa --config src-tauri/tauri.qa.conf.json${skip}`, { cwd: root, env, stdio: "inherit" });
console.log("\nKira de teste: src-tauri/target-qa/release/kira-radial.exe  (dados em %APPDATA%\\Kira-Radial-QA)");
