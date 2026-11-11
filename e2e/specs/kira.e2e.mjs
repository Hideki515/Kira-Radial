// Cenários de ponta a ponta na Kira de teste (pasta de dados de teste limpa no início).
import { invoke, nav, pickRadio, pressKey, qaConfig, qaFiles, qaState, save, toWindow } from "../helpers.mjs";

/** Espera a lista real de navegadores (o select fica desabilitado enquanto carrega) e devolve o 1º instalado. */
async function firstInstalled(sel) {
  await browser.waitUntil(async () => sel.isEnabled(), { timeoutMsg: "navegadores não carregaram" });
  for (const o of await sel.$$("option")) {
    const v = await o.getAttribute("value");
    if (v && v !== "system" && v !== "__missing__") return v;
  }
  throw new Error("nenhum navegador instalado listado");
}

describe("Kira de teste — ponta a ponta", () => {
  it("1. Configurações abrem e mostram a versão certa", async () => {
    await toWindow("settings.html");
    const { version, qa } = await qaState();
    expect(qa).toBe(true);
    await expect($(".sidebar-foot")).toHaveText(`v${version}`);
    // Aberta logo após iniciar: o WebView2 precisa estar desenhando (não ficou "escondida").
    expect(await browser.execute(() => document.visibilityState)).toBe("visible");
    const rafRan = await browser.executeAsync((done) => {
      const t = setTimeout(() => done(false), 2000);
      requestAnimationFrame(() => { clearTimeout(t); done(true); });
    });
    expect(rafRan).toBe(true);
  });

  it("2. trocar o tema para Terminal e salvar grava a config e muda o menu", async () => {
    await nav("Aparência");
    await $('button.theme-card[aria-label="Terminal"]').click();
    await save();
    expect(qaConfig().appearance.theme).toBe("terminal");
    await invoke("qa_show_menu", { fromOrb: false });
    await toWindow("");
    await expect($("svg.radial-canvas")).toHaveElementClass("theme-terminal");
    await pressKey("Escape");
    await browser.waitUntil(async () => !(await qaState()).menuVisible, { timeoutMsg: "Esc não fechou o menu" });
  });

  it("3. renomear uma fatia, salvar e vê-la no menu", async () => {
    await nav("Itens do menu");
    await $$(".tree-row")[1].click();
    const label = await $(".item-editor input");
    await label.setValue("E2E");
    await save();
    expect(qaConfig().profiles[0].items.some((i) => i.label === "E2E")).toBe(true);
    await invoke("qa_show_menu", { fromOrb: false });
    await toWindow("");
    await expect($('[data-testid="main-slice"][aria-label="E2E"]')).toBeExisting();
    await pressKey("Escape");
  });

  it("3b. 'Usar ícone do programa' extrai o ícone e ele aparece no menu", async () => {
    await nav("Itens do menu");
    await $$(".tree-row")[0].click(); // Terminal (Abrir programa)
    await $("button*=Usar ícone do programa").click();
    await expect($('[data-testid="icon-file"]')).toBeExisting();
    await save();
    const file = qaConfig().profiles[0].items[0].iconFile;
    expect(file).toContain("Kira-Radial-QA");
    expect(qaFiles("icons").some((f) => file.endsWith(f))).toBe(true);
    await invoke("qa_show_menu", { fromOrb: false });
    await toWindow("");
    await browser.waitUntil(async () => (await $$('[data-testid="main-slice"] [data-testid="slice-img"]')).length > 0, {
      timeoutMsg: "ícone do programa não apareceu no menu",
    });
    await pressKey("Escape");
  });

  it("4. submenu automático 'Planos de energia' lista os planos (só leitura)", async () => {
    await nav("Itens do menu");
    await $$(".tree-row")[0].click();
    await pickRadio("Submenu automático");
    await $('.item-editor select:has(option[value="powerPlans"])').selectByAttribute("value", "powerPlans");
    await save();
    await invoke("qa_show_menu", { fromOrb: false });
    await toWindow("");
    await pressKey("1", "Digit1"); // abre o sub-anel da 1ª fatia
    await browser.waitUntil(
      async () => {
        const subs = await $$('.sub-slice');
        if (!subs.length) return false;
        return (await subs[0].getAttribute("aria-label")) !== "Carregando…";
      },
      { timeoutMsg: "planos não carregaram" },
    );
    expect((await $$(".sub-slice")).length).toBeGreaterThan(0);
    await pressKey("Escape");
    await pressKey("Escape");
  });

  it("5. salvamentos geram versões anteriores na página Backup", async () => {
    expect(qaFiles("backups").length).toBeGreaterThanOrEqual(2);
    await nav("Backup");
    await browser.waitUntil(async () => (await $$('[data-testid^="backup-config-"]')).length >= 2, { timeoutMsg: "versões não listadas" });
    await $$('[data-testid^="backup-config-"]')[0].$("button*=Ver diferenças").click();
    await expect($('[data-testid="backup-diff"]')).toBeExisting();
  });

  it("5b. perfil por monitor: vale no monitor marcado e o menu abre com ele", async () => {
    await nav("Perfis");
    await $("button*=Novo perfil").click();
    // Marca todos os monitores: o perfil vale em qualquer tela onde o menu abrir.
    await browser.waitUntil(async () => (await $$(".monitor-pick input")).length > 0, { timeoutMsg: "monitores não listados" });
    for (const box of await $$(".monitor-pick input")) await box.click();
    await save();
    expect(qaConfig().profiles[1].when.monitors.length).toBeGreaterThan(0);
    await nav("Itens do menu");
    await $(".profile-picker select").selectByIndex(1);
    await $$(".tree-row:not(.is-child)")[2].click(); // só fatias principais (a lista também tem subitens)
    await $(".item-editor input").setValue("PERFIL2");
    await save();
    await invoke("qa_show_menu", { fromOrb: false });
    await toWindow("");
    await expect($('[data-testid="main-slice"][aria-label="PERFIL2"]')).toBeExisting();
    await pressKey("Escape");
  });

  it("6. modo Ícone: ícone ativo e o menu nasce dele", async () => {
    await nav("Atalho");
    await pickRadio("Ícone");
    await save();
    expect(qaConfig().launcher.mode).toBe("orb");
    await invoke("qa_show_menu", { fromOrb: true });
    await toWindow("");
    await expect($('[data-testid="radial-root"]')).toHaveElementClass("is-from-orb");
    await pressKey("Escape");
  });

  it("6b. editor de tema: criar, trocar a cor do texto, salvar e ver no menu", async () => {
    await nav("Aparência");
    await $("button*=Criar tema").click();
    await expect($('[data-testid="theme-editor"]')).toBeExisting();
    // <input type=color>: define o valor pelo setter nativo e dispara "input" (como o React espera).
    await browser.execute(() => {
      const el = document.querySelector('input[type="color"][aria-label="Texto"]');
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set.call(el, "#ff3366");
      el.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await save();
    const cfg = qaConfig();
    expect(cfg.appearance.theme.startsWith("custom:")).toBe(true);
    expect(cfg.appearance.customThemes[0].colors.label).toBe("#ff3366");
    await invoke("qa_show_menu", { fromOrb: false });
    await toWindow("");
    const svg = await $("svg.radial-canvas");
    await expect(svg).toHaveElementClass("theme-custom");
    expect(await browser.execute(() => document.querySelector("svg.radial-canvas").style.getPropertyValue("--k-label"))).toBe("#ff3366");
    await pressKey("Escape");
  });

  it("6c. navegador: fatia 'Abrir site' com navegador próprio e anônima; navegador geral (sem abrir nada)", async () => {
    await nav("Itens do menu");
    await $(".profile-picker select").selectByIndex(0);
    await $$(".tree-row:not(.is-child)")[0].click(); // virou submenu automático no cenário 4
    await pickRadio("Executar ação");
    await $('.item-editor select:has(option[value="url"])').selectByAttribute("value", "url");
    const browserSel = await $('select[aria-label="Navegador"]');
    const firstId = await firstInstalled(browserSel);
    await browserSel.selectByAttribute("value", firstId);
    const anon = await $("label.toggle-row*=janela anônima");
    const hasAnon = await anon.isExisting();
    if (hasAnon) await anon.$("input").click();
    await save();
    const item = qaConfig().profiles[0].items[0];
    expect(item.action).toMatchObject({ type: "url", browser: firstId });
    if (hasAnon) expect(item.action.private).toBe(true);
    expect(typeof item.action.browserName).toBe("string");

    await nav("Geral");
    const globalSel = await $('select[aria-label="Navegador para sites"]');
    expect(await firstInstalled(globalSel)).toBe(firstId);
    await globalSel.selectByAttribute("value", firstId);
    await save();
    expect(qaConfig().behavior.browser).toBe(firstId);
    await globalSel.selectByIndex(0); // volta ao padrão do Windows
    await save();
    expect(qaConfig().behavior.browser).toBeUndefined();
  });

  it("6d. submenu 'Brilho' com tela escolhida: grava o alvo e o sub-anel abre (só leitura, nenhum nível é clicado)", async () => {
    await nav("Itens do menu");
    await $(".profile-picker select").selectByIndex(0);
    await $$(".tree-row:not(.is-child)")[0].click();
    await pickRadio("Submenu automático");
    await $('.item-editor select:has(option[value="brightness"])').selectByAttribute("value", "brightness");
    const sel = await $('select[aria-label="Tela do brilho"]');
    expect(await sel.getValue()).toBe("cursor");
    // Espera a lista de telas (leitura DDC/CI leva ~100 ms por monitor); sem nenhuma tela ajustável fica em "Todas".
    await browser.waitUntil(async () => (await sel.$$("option")).length > 2, { timeout: 8000 }).catch(() => {});
    let chosen = "all";
    for (const o of await sel.$$("option")) {
      const v = await o.getAttribute("value");
      if (v !== "cursor" && v !== "all" && v !== "__missing__") {
        chosen = v;
        break;
      }
    }
    await sel.selectByAttribute("value", chosen);
    await save();
    const item = qaConfig().profiles[0].items[0];
    expect(item.dynamic).toBe("brightness");
    expect(item.dynamicTarget).toBe(chosen);
    await invoke("qa_show_menu", { fromOrb: false });
    await toWindow("");
    await pressKey("1", "Digit1"); // só abre o sub-anel
    await browser.waitUntil(async () => {
      const subs = await $$(".sub-slice");
      return subs.length > 0 && (await subs[0].getAttribute("aria-label")) !== "Carregando…";
    }, { timeoutMsg: "sub-anel do brilho não carregou" });
    await pressKey("Escape");
    await pressKey("Escape");
  });

  it("7. Diagnóstico mostra o resumo e gera o relatório", async () => {
    await nav("Diagnóstico");
    await expect($('[data-testid="diag-summary"]')).toHaveText(expect.stringContaining("Kira de teste"));
    await $("button*=Gerar relatório").click();
    await expect($('[role="status"]')).toHaveText(expect.stringContaining("relatorio-"));
    expect(qaFiles().some((f) => f.startsWith("relatorio-"))).toBe(true);
    const log = (await invoke("read_log", { lines: 200 })).join("\n");
    expect(log).toContain("iniciada (Kira de teste)");
    expect(log).not.toMatch(/ ERROR | \[panic\]/);
  });

  it("8. fechar as Configurações suspende a página; abrir de novo retoma (responde e salva)", async () => {
    // Comandos chamados da janela do menu: a página suspensa não roda script nem recebe resposta
    // (no uso real o fechamento vem do X da janela, não da própria página).
    for (const handle of await browser.getWindowHandles()) {
      await browser.switchToWindow(handle);
      const path = new URL(await browser.getUrl()).pathname.replace(/^\//, "");
      if (path === "" || path === "index.html") break;
    }
    await browser.execute(() => window.__TAURI_INTERNALS__.invoke("qa_close_settings"));
    await browser.pause(800); // dá tempo de a suspensão acontecer
    await browser.execute(() => window.__TAURI_INTERNALS__.invoke("qa_open_settings"));
    await toWindow("settings.html");
    const { qa } = await qaState(); // a página voltou a responder
    expect(qa).toBe(true);
    expect(await browser.execute(() => document.visibilityState)).toBe("visible");
    await nav("Geral");
    await nav("Aparência");
    await $('button.theme-card[aria-label="Vidro"]').click();
    await save();
    expect(qaConfig().appearance.theme).toBe("glass");
  });
});
