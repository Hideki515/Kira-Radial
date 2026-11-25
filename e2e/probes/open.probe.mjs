// Sonda: tempo de abertura do menu (primeiro quadro, medido pela própria Kira em diagnostics),
// PROBE_OPENS vezes (padrão 20) por tema. Saída: result.json { open: { tema: { afterThemeChange, median, all } } }.
import { invoke } from "../helpers.mjs";
import { closeMenu, dump, openMenu, prepare, result, setTheme, themes } from "./lib.mjs";

const N = Number(process.env.PROBE_OPENS ?? 20);
/** Mediana de verdade (com quantidade par, a média dos dois do meio). */
const median = (xs) => {
  const s = xs.filter((x) => typeof x === "number").sort((a, b) => a - b);
  if (!s.length) return null;
  const m = Math.floor(s.length / 2);
  return Number((s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2).toFixed(2));
};

describe(`sonda abertura (${result.tag})`, () => {
  it("tempo de abertura por tema", async () => {
    await prepare();
    result.open = {};
    for (const th of themes()) {
      try {
        await setTheme(th);
        // Aquecimento: a 1ª abertura depois de trocar o tema mede o tema carregando, não o menu.
        await openMenu(th);
        await browser.pause(600);
        const warm = (await invoke("diagnostics"))?.menuOpen?.lastMs ?? null;
        await closeMenu();
        await browser.pause(300);
        const all = [];
        for (let i = 0; i < N; i++) {
          await openMenu(th);
          await browser.pause(600);
          all.push((await invoke("diagnostics"))?.menuOpen?.lastMs ?? null);
          await closeMenu();
          await browser.pause(300);
        }
        result.open[th] = { afterThemeChange: warm, median: median(all), all };
      } catch (e) {
        result.errors.push(`${th}: ${String(e).slice(0, 300)}`);
        await closeMenu().catch(() => {});
      }
      dump();
    }
  });
});
