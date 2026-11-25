// Sonda: capturas do menu aberto (e com o sub-anel aberto) por tema, com as animações congeladas
// e o que muda sozinho (relógio, mídia) escondido. Saída: <tema>.png, <tema>-sub.png, result.json.
import { closeMenu, dump, freeze, hideLive, openFirstSub, openMenu, prepare, result, setTheme, shot, themes } from "./lib.mjs";

describe(`sonda capturas (${result.tag})`, () => {
  it("cada tema: menu aberto e sub-anel aberto", async () => {
    await prepare();
    result.themes = {};
    for (const th of themes()) {
      try {
        await setTheme(th);
        await openMenu(th);
        await browser.pause(700);
        await freeze();
        await hideLive();
        await browser.pause(150);
        await shot(th);
        const sub = await openFirstSub();
        if (sub) {
          await browser.pause(400);
          await freeze();
          await hideLive();
          await browser.pause(150);
          await shot(`${th}-sub`);
        }
        result.themes[th] = await browser.execute((t) => ({
          layer: !!document.querySelector(`[data-testid="${t}-back"]`),
          slices: document.querySelectorAll('[data-testid="main-slice"]').length,
          sub: document.querySelectorAll(".sub-slice").length,
        }), th);
        await closeMenu();
      } catch (e) {
        result.errors.push(`${th}: ${String(e).slice(0, 300)}`);
        await closeMenu().catch(() => {});
      }
      dump();
    }
    dump();
  });
});
