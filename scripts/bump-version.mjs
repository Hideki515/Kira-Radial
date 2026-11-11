#!/usr/bin/env node
// Atualiza a versão em package.json, src-tauri/Cargo.toml, src-tauri/tauri.conf.json e Cargo.lock.
// Uso: node scripts/bump-version.mjs 0.2.0
import { execFileSync, execSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const version = process.argv[2];
if (!/^\d+\.\d+\.\d+(-[0-9A-Za-z.-]+)?$/.test(version ?? "")) {
  console.error("Uso: node scripts/bump-version.mjs <x.y.z>");
  process.exit(1);
}

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const file = (p) => join(root, p);

function editJson(path) {
  const text = readFileSync(file(path), "utf8");
  const data = JSON.parse(text);
  const old = data.version;
  data.version = version;
  writeFileSync(file(path), JSON.stringify(data, null, 2) + "\n");
  console.log(`${path}: ${old} → ${version}`);
}

editJson("package.json");
editJson("src-tauri/tauri.conf.json");

// Só a primeira linha `version = "..."` (a do [package]).
const cargoPath = "src-tauri/Cargo.toml";
const cargo = readFileSync(file(cargoPath), "utf8");
const m = cargo.match(/^version\s*=\s*"([^"]+)"/m);
if (!m) throw new Error("version não encontrada no Cargo.toml");
writeFileSync(file(cargoPath), cargo.replace(m[0], `version = "${version}"`));
console.log(`${cargoPath}: ${m[1]} → ${version}`);

// package-lock.json e Cargo.lock acompanham.
execSync("npm install --package-lock-only --ignore-scripts", { cwd: root, stdio: "inherit" });
execFileSync("cargo", ["update", "-p", "kira-radial", "--offline"], { cwd: file("src-tauri"), stdio: "inherit" });

console.log(`\nPróximos passos:\n  1. Atualize o CHANGELOG.md\n  2. git commit -am "v${version}"\n  3. git tag -a v${version} -m "v${version}" && git push --follow-tags`);
