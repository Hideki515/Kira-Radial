#!/usr/bin/env node
// Roda o Vitest com a letra da unidade em maiúscula na pasta atual. No Windows, quando o
// terminal entrega "d:\..." (ex.: Git Bash / VS Code), o Vitest 5 monta a raiz como "D:/" e
// carrega o próprio módulo duas vezes: todos os testes falham com "failed to find the current suite".
// Uso: node scripts/vitest.mjs [argumentos do vitest]   (npm test = node scripts/vitest.mjs run)
import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const up = (p) => p.replace(/^[a-z]:/, (d) => d.toUpperCase());
const cwd = up(process.cwd());
const root = up(join(dirname(fileURLToPath(import.meta.url)), ".."));
const bin = join(root, "node_modules", "vitest", "vitest.mjs");
const r = spawnSync(process.execPath, [bin, ...process.argv.slice(2)], { cwd, stdio: "inherit" });
process.exit(r.status ?? 1);
