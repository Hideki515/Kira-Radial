// Testes de ponta a ponta (WebDriver) contra a "Kira de teste" (npm run build:qa).
// Clicam/digitam DENTRO das páginas (DOM) — não mexem no mouse/teclado do Windows.
// A Kira de teste abre tudo fora da tela, sem foco, com pasta de dados própria.
// Uso: npm run e2e
import { spawn, execFileSync } from "node:child_process";
import { existsSync, rmSync } from "node:fs";
import { connect } from "node:net";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const app = join(root, "src-tauri", "target-qa", "release", "kira-radial.exe");
export const QA_DATA = join(process.env.APPDATA ?? join(homedir(), "AppData", "Roaming"), "Kira-Radial-QA");

let driver;

/** Quantas Kiras de TESTE (target-qa) estão rodando. A instalada do usuário não conta. */
function qaRunning() {
  try {
    const out = execFileSync(
      "pwsh",
      ["-NoProfile", "-Command", "@(Get-Process kira-radial -ErrorAction SilentlyContinue | Where-Object { $_.Path -like '*\\target-qa\\*' }).Count"],
      { encoding: "utf8" },
    );
    return Number(out.trim()) || 0;
  } catch {
    return 0;
  }
}

function portOpen(port) {
  return new Promise((resolve) => {
    const s = connect({ host: "127.0.0.1", port }, () => {
      s.end();
      resolve(true);
    });
    s.on("error", () => resolve(false));
  });
}

/** Espera `cond()` ficar verdadeira (até `ms`); devolve se conseguiu. */
async function until(cond, ms) {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    if (await cond()) return true;
    await new Promise((r) => setTimeout(r, 250));
  }
  return false;
}

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
  async beforeSession() {
    // Rodadas seguidas: espera a Kira de teste da rodada anterior terminar de fechar.
    await until(() => qaRunning() === 0, 15000);
    if (QA_DATA.endsWith("Kira-Radial-QA")) rmSync(QA_DATA, { recursive: true, force: true, maxRetries: 5, retryDelay: 300 });
    const native = execFileSync("pwsh", ["-NoProfile", "-File", join(root, "scripts", "get-edgedriver.ps1")], { encoding: "utf8" }).trim().split(/\r?\n/).pop();
    driver = spawn("tauri-driver", ["--native-driver", native], { stdio: [null, process.stdout, process.stderr] });
    // Só segue quando o tauri-driver já aceita conexões (senão a sessão falha com ECONNREFUSED).
    if (!(await until(() => portOpen(4444), 15000))) throw new Error("tauri-driver não abriu a porta 4444");
  },

  /**
   * As Configurações nascem escondidas para o WebView2 (não desenham até alguém abrir). Abre
   * pelo mesmo caminho do usuário — comando do backend, chamado da janela do menu — e só segue
   * quando a página está de fato visível. Na partida "fria" do WebView2 as janelas ainda podem
   * estar carregando: tenta de novo até dar certo.
   */
  async before() {
    const pathOf = async () => {
      try {
        return new URL(await browser.getUrl()).pathname.replace(/^\//, "");
      } catch {
        return null; // ainda sem página
      }
    };
    await browser.waitUntil(
      async () => {
        let radial = null;
        let settings = null;
        for (const h of await browser.getWindowHandles()) {
          await browser.switchToWindow(h);
          const path = await pathOf();
          if (path === "settings.html") settings = h;
          else if (path === "" || path === "index.html") radial = h;
        }
        if (!radial || !settings) return false;
        await browser.switchToWindow(radial);
        if (!(await browser.execute(() => !!window.__TAURI_INTERNALS__))) return false;
        await browser.execute(() => window.__TAURI_INTERNALS__.invoke("qa_open_settings"));
        await browser.switchToWindow(settings);
        return browser
          .waitUntil(async () => (await browser.execute(() => document.visibilityState)) === "visible", { timeout: 3000 })
          .catch(() => false);
      },
      { timeout: 45000, interval: 500, timeoutMsg: "não foi possível abrir as Configurações (página continua escondida)" },
    );
  },

  async afterSession() {
    driver?.kill();
    // Deixa a próxima rodada começar limpa: Kira de teste fechada e porta do driver livre.
    await until(() => qaRunning() === 0, 15000);
    await until(async () => !(await portOpen(4444)), 5000);
  },
};
