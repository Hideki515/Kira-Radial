// Cenários de ponta a ponta na Kira de teste (pasta de dados de teste limpa no início).
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { QA_DATA, invoke, nav, pickRadio, pressKey, qaConfig, qaFiles, qaState, save, toWindow } from "../helpers.mjs";

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
    // wdio 10: execute aceita função que devolve Promise (executeAsync foi removido).
    const rafRan = await browser.execute(
      () =>
        new Promise((done) => {
          const t = setTimeout(() => done(false), 2000);
          requestAnimationFrame(() => { clearTimeout(t); done(true); });
        }),
    );
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
    // Os cenários anteriores abriram o menu várias vezes: o tempo de abertura foi medido.
    const diag = await invoke("diagnostics");
    expect(diag.menuOpen.count).toBeGreaterThan(0);
    expect(diag.menuOpen.maxMs).toBeLessThan(5000);
    await expect($('[data-testid="diag-open-time"]')).toHaveText(expect.stringMatching(/média \d+ ms/));
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

  it("9. ícone encostado na borda: hover estável e clique em toda a parte visível (CSS real, eventos só na página)", async function () {
    this.timeout(180000);
    await toWindow("settings.html"); // a página das Configurações carrega o orb.css (pré-visualização do ícone)
    const make = (edge) =>
      browser.execute((edge) => {
        document.getElementById("e2e-stage")?.remove();
        const st = document.createElement("div");
        st.className = `orb-stage anim-off${edge ? ` dock-${edge}` : ""}`;
        st.id = "e2e-stage";
        // Janela do ícone: 1,5 × o orbe (144 px para 96 px), como no app.
        st.style.cssText = "position:fixed;left:0;top:0;width:144px;height:144px;z-index:99999;--orb-size:96px;--orb-idle:1;--orb-accent:#4ade9b";
        const b = document.createElement("button");
        b.className = "orb";
        b.id = "e2e-orb";
        window.__e2eUp = 0;
        b.addEventListener("pointerup", () => window.__e2eUp++);
        st.appendChild(b);
        document.body.appendChild(st);
      }, edge);
    const hovered = () => browser.execute(() => document.getElementById("e2e-orb").matches(":hover"));
    // Pontos dentro da metade visível em repouso, inclusive os "cantos" e a beirada da tela.
    const POINTS = {
      right: [[143, 40], [130, 30], [135, 100], [130, 72]],
      left: [[0, 40], [13, 30], [8, 100], [14, 72]],
      bottom: [[40, 143], [30, 130], [100, 135], [72, 130]],
      top: [[40, 0], [30, 13], [100, 8], [72, 14]],
    };
    const problems = [];
    for (const [edge, points] of Object.entries(POINTS)) {
      await make(edge);
      for (const [x, y] of points) {
        await browser.action("pointer").move({ x: 400, y: 400, origin: "viewport" }).pause(300).perform();
        await browser.action("pointer").move({ x, y, origin: "viewport" }).pause(450).perform(); // fim da transição (220 ms)
        const states = [];
        for (let i = 0; i < 4; i++) {
          // tremida de 1 px para dentro da janela: o orbe não pode sair de baixo do cursor
          const d = i % 2;
          const horiz = edge === "left" || edge === "right";
          const nx = horiz ? (x >= 72 ? x - d : x + d) : x;
          const ny = horiz ? y : y >= 72 ? y - d : y + d;
          await browser.action("pointer").move({ x: nx, y: ny, origin: "viewport" }).pause(300).perform();
          states.push(await hovered());
        }
        await browser.action("pointer").move({ x, y, origin: "viewport" }).down().pause(80).up().pause(200).perform();
        const ups = await browser.execute(() => window.__e2eUp);
        await browser.execute(() => (window.__e2eUp = 0));
        if (!states.every(Boolean) || ups !== 1) problems.push(`${edge} (${x},${y}): hover=${states.join("/")} cliques=${ups}`);
      }
    }
    // Ícone solto: sem a área de toque quadrada e sem deslocamento.
    await make(null);
    const loose = await browser.execute(() => {
      const o = document.getElementById("e2e-orb");
      return { tf: getComputedStyle(o).transform, before: getComputedStyle(o, "::before").content };
    });
    await browser.execute(() => document.getElementById("e2e-stage")?.remove());
    expect(problems).toEqual([]);
    expect(loose.tf).toBe("none");
    expect(loose.before).toBe("none");
  });

  it("10. a política de segurança (CSP) não bloqueou nada em nenhuma janela", async () => {
    const log = (await invoke("read_log", { lines: 2000 })).join("\n");
    expect(log).not.toContain("CSP bloqueou");
    expect(log).not.toMatch(/ ERROR /);
    // A CSP está mesmo ativa: imagem de outro site é barrada antes de qualquer requisição.
    const blocked = await browser.execute(
      () =>
        new Promise((done) => {
          const t = setTimeout(() => done(null), 3000);
          document.addEventListener("securitypolicyviolation", (e) => (clearTimeout(t), done(e.effectiveDirective)), { once: true });
          const img = document.createElement("img");
          img.src = "https://example.invalid/kira-csp-check.png";
          document.body.appendChild(img);
          img.remove();
        }),
    );
    expect(blocked).toBe("img-src");
  });
  it("11. Discord (FALSO, da Kira de teste): conectar, submenu com o estado e mutar pelo menu", async () => {
    await nav("Discord");
    await $('input[placeholder="123456789012345678"]').setValue("123456");
    await $('input[type="password"]').setValue("segredo-e2e");
    await $("button*=Conectar").click();
    await browser.waitUntil(async () => (await $('[data-testid="discord-status"]').getText()).includes("kira-teste"), { timeoutMsg: "não conectou ao Discord falso" });
    // Credenciais cifradas na pasta de TESTE (sem o segredo em texto puro).
    expect(qaFiles()).toContain("discord.bin");
    expect(readFileSync(join(QA_DATA, "discord.bin")).includes(Buffer.from("segredo-e2e"))).toBe(false);
    expect(JSON.stringify(qaConfig())).not.toContain("segredo-e2e");

    await nav("Itens do menu");
    // O cenário 5b deixou o perfil 2 ("Padrão (cópia)", todos os monitores) valendo no menu.
    await $(".profile-picker select").selectByIndex(1);
    await $$(".tree-row")[0].click();
    await pickRadio("Submenu automático");
    await $('.item-editor select:has(option[value="discordVoice"])').selectByAttribute("value", "discordVoice");
    await save();
    await invoke("qa_show_menu", { fromOrb: false });
    await toWindow("");
    await pressKey("1", "Digit1");
    await browser.waitUntil(
      async () => {
        const subs = await $$(".sub-slice");
        return subs.length > 0 && (await subs[0].getAttribute("aria-label")) === "Microfone ligado";
      },
      { timeoutMsg: "submenu do Discord não mostrou o estado" },
    );
    expect(await $$(".sub-slice")[1].getAttribute("aria-label")).toBe("Áudio ligado");
    await pressKey("1", "Digit1"); // "Microfone ligado" → muta
    await browser.waitUntil(async () => (await invoke("discord_voice")).voice?.mute === true, { timeoutMsg: "não mutou" });
    const v = await invoke("discord_voice");
    expect(v.status).toBe("ok");
    expect(v.voice.deaf).toBe(false);
  });
  it("12. knob (simulado por qa_knob): apertar abre, girar escolhe, apertar abre o submenu e executa", async () => {
    // Usa a fatia do Discord FALSO do cenário 11 (perfil ativo, fatia 1): executar é seguro.
    await toWindow("settings.html");
    await invoke("hide_menu");
    await browser.waitUntil(async () => !(await qaState()).menuVisible, { timeoutMsg: "menu não fechou" });
    const before = (await invoke("discord_voice")).voice.mute;
    await invoke("qa_knob", { input: "press" });
    await browser.waitUntil(async () => (await qaState()).menuVisible, { timeoutMsg: "apertar o knob não abriu o menu" });
    await toWindow("");
    await invoke("qa_knob", { input: "right" });
    await browser.waitUntil(async () => (await $$(".main-slice.is-active")).length === 1, { timeoutMsg: "girar não escolheu fatia" });
    await invoke("qa_knob", { input: "press" }); // fatia com submenu → abre o sub-anel no 1º item
    await browser.waitUntil(
      async () => {
        const a = await $$(".sub-slice.is-active");
        return a.length === 1 && /^Microfone/.test(await a[0].getAttribute("aria-label"));
      },
      { timeoutMsg: "apertar não abriu o submenu com o 1º item escolhido" },
    );
    await invoke("qa_knob", { input: "press" }); // executa: alterna o mudo no Discord falso
    await browser.waitUntil(async () => (await invoke("discord_voice")).voice.mute === !before, { timeoutMsg: "apertar não executou a fatia" });
  });
});
