// Utilitários dos testes E2E (só DOM/WebDriver dentro das janelas da Kira de teste).
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";

export const QA_DATA = join(process.env.APPDATA ?? join(homedir(), "AppData", "Roaming"), "Kira-Radial-QA");

/** Muda o foco do WebDriver para a janela cuja URL termina com `page` ("settings.html", "orb.html" ou "" = menu). */
export async function toWindow(page) {
  let found = null;
  // As janelas (webviews) podem demorar um pouco para existir logo após abrir o app.
  await browser.waitUntil(
    async () => {
      for (const handle of await browser.getWindowHandles()) {
        await browser.switchToWindow(handle);
        const path = new URL(await browser.getUrl()).pathname.replace(/^\//, "");
        if (page === "" ? path === "" || path === "index.html" : path === page) {
          found = handle;
          return true;
        }
      }
      return false;
    },
    { timeout: 15000, timeoutMsg: `janela "${page}" não encontrada` },
  );
  // Espera o React montar a página.
  await $("#root > *").waitForExist({ timeout: 15000 });
  return found;
}

/** Chama um comando do backend a partir da janela atual. */
export function invoke(cmd, args = {}) {
  return browser.execute((c, a) => window.__TAURI_INTERNALS__.invoke(c, a), cmd, args);
}

export async function qaState() {
  return invoke("qa_state");
}

/** Abre uma página das Configurações pelo menu lateral. */
export async function nav(label) {
  await toWindow("settings.html");
  const btn = await $(`button.nav-item*=${label}`);
  await btn.waitForExist();
  await btn.click();
}

/** Clica num botão de opção (role=radio) pelo texto. */
export async function pickRadio(text) {
  const radios = await $$('[role="radio"]');
  for (const r of radios) {
    if ((await r.getText()).trim() === text || (await r.getAttribute("aria-label")) === text) return r.click();
  }
  throw new Error(`opção "${text}" não encontrada`);
}

/** Salva as Configurações e espera "salvas e aplicadas". */
export async function save() {
  await toWindow("settings.html");
  const btn = await $("button=Salvar");
  await btn.waitForEnabled();
  await btn.click();
  await browser.waitUntil(async () => (await $(".savebar").getText()).includes("salvas e aplicadas"), { timeoutMsg: "não salvou" });
}

/** config.json da pasta de TESTE. */
export function qaConfig() {
  return JSON.parse(readFileSync(join(QA_DATA, "config.json"), "utf8"));
}

export function qaFiles(sub = "") {
  const dir = join(QA_DATA, sub);
  return existsSync(dir) ? readdirSync(dir) : [];
}

/** Dispara uma tecla dentro da página atual (sem teclado do Windows). */
export function pressKey(key, code = key) {
  return browser.execute((k, c) => window.dispatchEvent(new KeyboardEvent("keydown", { key: k, code: c, bubbles: true })), key, code);
}
