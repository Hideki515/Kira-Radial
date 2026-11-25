// Utilitários das sondas do QA (só DOM/WebDriver dentro da Kira de teste; nada de mouse ou
// teclado do Windows). Cada sonda grava em PROBE_OUT/<TAG>/: result.json + capturas.
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { invoke, pressKey, qaState } from "../helpers.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
export const TAG = process.env.PROBE_TAG ?? "B";
export const OUT = join(process.env.PROBE_OUT ?? join(root, ".claude", "qa", "probe"), TAG);
mkdirSync(OUT, { recursive: true });

/** Temas pedidos (PROBE_THEMES="glass,rain" ou "all"); padrão: só o tema padrão. */
export function themes() {
  // Lista sempre atual: lida do próprio types.ts (THEMES).
  const src = readFileSync(join(root, "src", "shared", "types.ts"), "utf8");
  const all = [...src.match(/export const THEMES: readonly Theme\[\] = \[([\s\S]*?)\];/)[1].matchAll(/"(\w+)"/g)].map((m) => m[1]);
  const want = (process.env.PROBE_THEMES ?? "glass").trim();
  if (want === "all") return all;
  // Só temas que existem (o nome vira nome de arquivo).
  return want.split(",").map((s) => s.trim()).filter((t) => all.includes(t));
}

/**
 * Vai para a janela do menu, sem esperar a página montar (com o menu fechado ela pode estar
 * vazia). Os comandos de teste e de config funcionam de qualquer janela; esta nunca é
 * suspensa, ao contrário das Configurações fechadas.
 */
export async function radial() {
  await browser.waitUntil(
    async () => {
      for (const h of await browser.getWindowHandles()) {
        await browser.switchToWindow(h);
        const p = new URL(await browser.getUrl()).pathname;
        if (p === "/" || p === "/index.html") return true;
      }
      return false;
    },
    { timeout: 15000, timeoutMsg: "janela do menu não encontrada" },
  );
  await browser.waitUntil(() => browser.execute(() => !!window.__TAURI_INTERNALS__), { timeout: 15000, timeoutMsg: "menu sem o Tauri" });
}

export const result = { tag: TAG, errors: [] };
export const dump = () => writeFileSync(join(OUT, "result.json"), JSON.stringify(result, null, 1));

/** Volta aos itens e à cor padrão (o resultado não depende do que outra sonda deixou). */
export async function prepare(mut = () => {}) {
  await radial();
  const def = JSON.parse(readFileSync(join(root, "src", "shared", "default-config.json"), "utf8"));
  const cfg = await invoke("get_config");
  cfg.profiles[0].items = def.profiles[0].items;
  cfg.appearance.customThemes = [];
  cfg.appearance.accent = def.appearance.accent;
  mut(cfg);
  await invoke("save_config", { config: cfg });
  return cfg;
}

export async function setTheme(theme) {
  await radial();
  const cfg = await invoke("get_config");
  cfg.appearance.theme = theme;
  await invoke("save_config", { config: cfg });
}

/** Abre o menu (pelo comando de teste) e espera o tema estar aplicado. */
export async function openMenu(theme) {
  await radial();
  await invoke("qa_show_menu", { fromOrb: false });
  await browser.waitUntil(
    async () => (await qaState()).menuVisible && (await $("svg.radial-canvas").getAttribute("class")).includes(`theme-${theme}`),
    { timeout: 10000, timeoutMsg: `menu com o tema ${theme} não abriu` },
  );
}

export async function closeMenu() {
  await invoke("hide_menu");
  await browser.waitUntil(async () => !(await qaState()).menuVisible, { timeout: 8000, timeoutMsg: "menu não fechou" });
}

/** Abre o sub-anel da primeira fatia que tem filhos (tecla 1–9 dentro da página). */
export async function openFirstSub() {
  const idx = await browser.execute(() => [...document.querySelectorAll('[data-testid="main-slice"]')].findIndex((s) => s.classList.contains("has-children")));
  if (idx < 0 || idx > 8) return false;
  await pressKey(String(idx + 1), `Digit${idx + 1}`);
  await browser.waitUntil(async () => (await $$(".sub-slice")).length > 0, { timeout: 8000, timeoutMsg: "sub-anel não abriu" });
  return true;
}

/** Congela as animações em t=0 (imagem igual a cada rodada). */
export const freeze = () =>
  browser.execute(() => {
    for (const a of document.getAnimations()) {
      const it = a.effect?.getComputedTiming?.().iterations;
      if (it !== Infinity) a.finish();
      else {
        a.pause();
        a.currentTime = 0;
      }
    }
  });

/** Esconde o que muda sozinho a cada rodada (relógio, data, mídia tocando no sistema). */
export const hideLive = () =>
  browser.execute(() => {
    for (const el of document.querySelectorAll(".center-hub text, .center-hub image, .center-hub foreignObject")) el.style.visibility = "hidden";
  });

export const shot = (name) => browser.saveScreenshot(join(OUT, `${name}.png`));

/** CPU (% de um núcleo) da Kira de teste em `sec` segundos (scripts/qa-cpu.ps1). */
export function cpu(sec = 8) {
  const out = execFileSync("pwsh", ["-NoProfile", "-File", join(root, "scripts", "qa-cpu.ps1"), "-Seconds", String(sec)], { encoding: "utf8" });
  return Number(out.trim());
}
