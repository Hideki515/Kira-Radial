// Sonda: CPU (% de um núcleo, Kira de teste + WebView2) com o menu aberto, por tema, e com o
// menu fechado. PROBE_SECONDS (padrão 8) por amostra. Saída: result.json { cpu: { tema: % } }.
import { invoke } from "../helpers.mjs";
import { closeMenu, cpu, dump, openMenu, prepare, result, setTheme, themes } from "./lib.mjs";

const SEC = Number(process.env.PROBE_SECONDS ?? 8);

describe(`sonda CPU (${result.tag})`, () => {
  it("menu aberto por tema e menu fechado", async () => {
    await prepare();
    // As Configurações abertas também desenham: ficam escondidas durante a medida.
    await invoke("qa_close_settings");
    await browser.pause(1500);
    result.cpu = {};
    for (const th of themes()) {
      try {
        await setTheme(th);
        await openMenu(th);
        await browser.pause(1500); // abertura e primeiro quadro fora da medida
        result.cpu[th] = cpu(SEC);
        await closeMenu();
      } catch (e) {
        result.errors.push(`${th}: ${String(e).slice(0, 300)}`);
        await closeMenu().catch(() => {});
      }
      dump();
    }
    try {
      await browser.pause(1500);
      result.cpu.closed = cpu(SEC);
    } catch (e) {
      result.errors.push(`closed: ${String(e).slice(0, 300)}`);
    }
    dump();
  });
});
