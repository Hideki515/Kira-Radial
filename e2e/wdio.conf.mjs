// Testes de ponta a ponta (WebDriver) contra a "Kira de teste" (npm run build:qa).
// Clicam/digitam DENTRO das páginas (DOM) — não mexem no mouse/teclado do Windows.
// A Kira de teste abre tudo fora da tela, sem foco, com pasta de dados própria.
// Uso: npm run e2e
import { spawn, execFileSync } from "node:child_process";
import { existsSync, rmSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const app = join(root, "src-tauri", "target-qa", "release", "kira-radial.exe");
export const QA_DATA = join(process.env.APPDATA ?? join(homedir(), "AppData", "Roaming"), "Kira-Radial-QA");

let driver;

export const config = {
  runner: "local",
  specs: ["./specs/**/*.e2e.mjs"],
  maxInstances: 1,
  hostname: "127.0.0.1",
  port: 4444,
  capabilities: [{ maxInstances: 1, "tauri:options": { application: app } }],
  logLevel: "warn",
  framework: "mocha",
  reporters: ["spec"],
  mochaOpts: { ui: "bdd", timeout: 60000 },
  waitforTimeout: 10000,

  onPrepare() {
    if (!existsSync(app)) throw new Error(`Kira de teste não encontrada (${app}). Rode: npm run build:qa`);
  },

  // Cada spec começa com a pasta de dados de TESTE limpa (nunca a do usuário).
  beforeSession() {
    if (QA_DATA.endsWith("Kira-Radial-QA")) rmSync(QA_DATA, { recursive: true, force: true });
    const native = execFileSync("pwsh", ["-NoProfile", "-File", join(root, "scripts", "get-edgedriver.ps1")], { encoding: "utf8" }).trim().split(/\r?\n/).pop();
    driver = spawn("tauri-driver", ["--native-driver", native], { stdio: [null, process.stdout, process.stderr] });
  },

  afterSession() {
    driver?.kill();
  },
};
