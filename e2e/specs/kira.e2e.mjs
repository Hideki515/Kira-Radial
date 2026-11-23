// Cenários de ponta a ponta na Kira de teste (pasta de dados de teste limpa no início).
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { QA_DATA, invoke, nav, pickRadio, pressKey, qaConfig, qaFiles, qaState, save, saveEn, toWindow } from "../helpers.mjs";

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
  it("13. preview de print (qa_fake_shot): aparece, fixa na tela e fecha — sem tocar na área de transferência", async () => {
    await toWindow("settings.html");
    const id = await invoke("qa_fake_shot", { width: 1600, height: 900 });
    await toWindow("shot.html");
    await $('[data-testid="shot-preview"]').waitForExist({ timeout: 10000 });
    expect(await $(".shot-title").getText()).toBe("Print · 1600×900");
    // WebdriverIO 10: $$().map já é assíncrono e devolve uma Promise do array.
    const labels = await $$(".shot-btn").map((b) => b.getAttribute("aria-label"));
    expect(labels).toEqual(["Copiar", "Salvar como…", "Editar", "Fixar na tela"]);
    const info = await invoke("shot_current");
    expect(info.id).toBe(id);
    expect(info.thumb.startsWith("data:image/png;base64,")).toBe(true);
    // Fixar: abre a janela do print fixado com a imagem inteira.
    await $('button[aria-label="Fixar na tela"]').click();
    await browser.waitUntil(
      async () => {
        for (const h of await browser.getWindowHandles()) {
          await browser.switchToWindow(h);
          if ((await browser.getUrl()).includes("pin=1") && (await $('[data-testid="shot-pin"] img').isExisting())) return true;
        }
        return false;
      },
      { timeout: 10000, timeoutMsg: "print fixado não apareceu" },
    );
    expect(await $('[data-testid="shot-pin"] img').getAttribute("alt")).toBe("Print fixado de 1600×900");
    expect((await invoke("shot_pin_image")).width).toBe(1600);
    await $('[data-testid="shot-pin"] button[aria-label="Fechar"]').click();
    // A janela do fixado agora está escondida e suspensa (não roda script): consulta pelas Configurações.
    await toWindow("settings.html");
    await browser.waitUntil(async () => (await invoke("shot_pin_image")) === null, { timeoutMsg: "print fixado não fechou" });
  });
  it("14. rótulos dentro da fatia: nenhum texto sai do formato (anel e sub-anel do Discord)", async () => {
    await toWindow("settings.html");
    await invoke("hide_menu");
    await invoke("qa_show_menu", { fromOrb: false });
    await toWindow("");
    await pressKey("1", "Digit1"); // fatia do Discord (cenário 11) → sub-anel com nomes longos
    await browser.waitUntil(async () => (await $$(".sub-slice")).length > 0, { timeoutMsg: "sub-anel não abriu" });
    await browser.pause(400); // animação de entrada do sub-anel
    const out = await browser.execute(() => {
      const bad = [];
      let checked = 0;
      for (const g of document.querySelectorAll(".main-slice, .sub-slice")) {
        const shape = g.querySelector("path.slice-shape");
        const text = g.querySelector("text.slice-label:not([visibility])");
        if (!shape || !text) continue;
        checked++;
        const rows = text.querySelectorAll("tspan").length ? [...text.querySelectorAll("tspan")] : [text];
        for (const row of rows) {
          const b = row.getBBox();
          // Margem de 1 px: a caixa de linha inclui um pouco de espaço acima/abaixo das letras.
          const pts = [[b.x + 1, b.y + 2], [b.x + b.width - 1, b.y + 2], [b.x + 1, b.y + b.height - 2], [b.x + b.width - 1, b.y + b.height - 2]];
          const outside = pts.filter(([x, y]) => !shape.isPointInFill(new DOMPoint(x, y)));
          if (outside.length) bad.push(`${g.getAttribute("aria-label")}: "${row.textContent}"`);
        }
      }
      return { checked, bad };
    });
    expect(out.checked).toBeGreaterThan(8);
    expect(out.bad).toEqual([]);
    await pressKey("Escape");
    await pressKey("Escape");
  });

  it("15. confirmação de Desligar: a trava da Kira de teste vale e o duplo clique não confirma", async () => {
    await toWindow("settings.html");
    // Antes de tudo: na Kira de teste, comandos de energia nunca rodam de verdade.
    const lock = await browser.execute(() =>
      window.__TAURI_INTERNALS__.invoke("run_action", { action: { type: "system", cmd: "lock" } }).then(() => "rodou", (e) => String(e)),
    );
    expect(lock).toContain("bloqueado na Kira de teste");
    // Fatia "Desligar" na posição 1 de todos os perfis (o perfil ativo depende do monitor).
    const cfg = await invoke("get_config");
    for (const p of cfg.profiles) p.items[0] = { id: "e2e-off", label: "Desligar", icon: "zap", action: { type: "system", cmd: "shutdown" } };
    await invoke("save_config", { config: cfg });
    await invoke("qa_show_menu", { fromOrb: false });
    await toWindow("");
    // Escolhe a fatia e clica em Desligar logo em seguida (~50 ms, como o 2º clique de um duplo
    // clique), tudo dentro da página: a ida e volta do WebDriver passaria dos 400 ms da pausa.
    const quick = await browser.execute(
      () =>
        new Promise((done) => {
          window.dispatchEvent(new KeyboardEvent("keydown", { key: "1", code: "Digit1", bubbles: true }));
          setTimeout(() => {
            const btn = document.querySelector("button.confirm-btn.is-danger");
            if (!btn) return done("sem diálogo");
            btn.click();
            setTimeout(() => done(document.querySelector('[role="alertdialog"]') ? "aberto" : "fechou"), 50);
          }, 50);
        }),
    );
    expect(quick).toBe("aberto");
    await browser.pause(450);
    await $("button.confirm-btn.is-danger").click();
    await browser.waitUntil(async () => !(await $('[role="alertdialog"]').isExisting()), { timeoutMsg: "diálogo não fechou" });
    await browser.waitUntil(async () => (await $(".toast").isExisting()) && (await $(".toast").getText()).includes("bloqueado"), {
      timeoutMsg: "o Desligar não chegou à trava da Kira de teste",
    });
  });
  it("16. sequência: os passos rodam em ordem (Discord FALSO) e desligar não entra numa sequência", async () => {
    await toWindow("settings.html");
    const call = (action) =>
      browser.execute((a) => window.__TAURI_INTERNALS__.invoke("run_action", { action: a }).then(() => "ok", (e) => String(e)), action);
    // Estado conhecido: tudo ligado.
    expect(await call({ type: "discord", cmd: "unmute" })).toBe("ok");
    expect(await call({ type: "sequence", delayMs: 0, steps: [{ type: "discord", cmd: "mute" }, { type: "discord", cmd: "deafen" }] })).toBe("ok");
    const v = (await invoke("discord_voice")).voice;
    expect(v.mute && v.deaf).toBe(true);
    // Passo inválido para o Rust: nem chega a rodar.
    const bad = await call({ type: "sequence", steps: [{ type: "discord", cmd: "unmute" }, { type: "system", cmd: "shutdown" }] });
    expect(bad).toContain("desligar");
    expect((await invoke("discord_voice")).voice.deaf).toBe(true);
  });
  it("16b. (QA) sequência montada pela UI: passos, ordem e intervalo vão para o config.json", async () => {
    await nav("Itens do menu");
    await $(".profile-picker select").selectByIndex(0);
    await $$(".tree-row:not(.is-child)")[1].click();
    await pickRadio("Executar ação");
    await $('.item-editor select:has(option[value="sequence"])').selectByAttribute("value", "sequence");
    await $('[data-testid="step-1"]').waitForExist();
    // Passo 1: site (não abre nada; só grava).
    await $('[data-testid="step-0"] select:has(option[value="url"])').selectByAttribute("value", "url");
    await $$('[data-testid="step-0"] input')[0].setValue("https://example.com");
    // Passo novo (Adicionar) vira "Bloquear" e sobe para a posição 2.
    await $("button*=Adicionar passo").click();
    await $('[data-testid="step-2"] select:has(option[value="system"])').selectByAttribute("value", "system");
    expect(await $$('[data-testid="step-0"] option[value="sequence"]').length).toBe(0);
    expect(await browser.execute(() => [...document.querySelectorAll('[data-testid="step-0"] button')].some((b) => b.textContent.includes("Testar")))).toBe(false);
    await $('[data-testid="step-2"] select:has(option[value="lock"])').selectByAttribute("value", "lock");
    // Clique de verdade (o botão precisa estar visível — ver 16c).
    await $('button[aria-label="Subir passo 3"]').click();
    // Intervalo 1000 ms pelo slider (evento de input do React, dentro da página).
    await browser.execute(() => {
      const r = document.querySelector('.item-editor input[type="range"]');
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set.call(r, "1000");
      r.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await save();
    const item = qaConfig().profiles[0].items.find((i) => i.action?.type === "sequence");
    expect(item.action).toEqual({
      type: "sequence",
      delayMs: 1000,
      steps: [{ type: "url", url: "https://example.com" }, { type: "system", cmd: "lock" }, { type: "media", cmd: "playpause" }],
    });
    // Desligar num passo: erro na tela e o Testar fica desabilitado (nada é executado).
    await $('[data-testid="step-1"] select:has(option[value="shutdown"])').selectByAttribute("value", "shutdown");
    await browser.waitUntil(() => browser.execute(() => [...document.querySelectorAll(".item-editor .inline-error")].some((e) => e.textContent.includes("desligar"))), { timeoutMsg: "sem erro de desligar" });
    expect(await $("button*=Testar ação").isEnabled()).toBe(false);
  });
  it("16c. (QA) botões subir/descer/remover dos passos aparecem na tela (CSS real)", async () => {
    await toWindow("settings.html");
    const shown = await browser.execute(() =>
      [...document.querySelectorAll(".sequence-step .row-tools")].map((t) => getComputedStyle(t).display),
    );
    expect(shown.length).toBeGreaterThan(0);
    expect(shown.filter((d) => d === "none")).toEqual([]);
  });
  it("17. atalho global de fatia (qa_hotkey): executa sem abrir o menu; conflito aparece no erro", async () => {
    await toWindow("settings.html");
    const cfg = await invoke("get_config");
    // Fatia com atalho no 1º perfil: desmutar o Discord FALSO.
    cfg.profiles[0].items[1] = { id: "e2e-hk", label: "Desmutar", icon: "mic", hotkey: "Ctrl+Alt+Shift+F9", action: { type: "discord", cmd: "unmute" } };
    await invoke("save_config", { config: cfg });
    await browser.execute(() => window.__TAURI_INTERNALS__.invoke("run_action", { action: { type: "discord", cmd: "mute" } }));
    expect((await invoke("discord_voice")).voice.mute).toBe(true);
    await invoke("qa_hotkey", { accelerator: "Ctrl+Alt+Shift+F9" });
    await browser.waitUntil(async () => (await invoke("discord_voice")).voice.mute === false, { timeoutMsg: "o atalho não executou a fatia" });
    expect((await qaState()).menuVisible).toBe(false);
    expect(await invoke("hotkeys_error")).toBe(null);
    // Mesmo atalho em duas fatias: o Rust recusa e explica.
    cfg.profiles[0].items[2] = { id: "e2e-hk2", label: "Outra", icon: "mic", hotkey: "ctrl+alt+shift+f9", action: { type: "discord", cmd: "mute" } };
    await invoke("save_config", { config: cfg });
    expect(await invoke("hotkeys_error")).toMatch(/ctrl\+alt\+shift\+f9/i);
  });
  it("18. busca por digitação: resultados viram as fatias; Esc limpa e o 2º Esc fecha", async () => {
    await toWindow("settings.html");
    await invoke("hide_menu");
    await invoke("qa_show_menu", { fromOrb: false });
    await toWindow("");
    for (const k of "desm") await pressKey(k, `Key${k.toUpperCase()}`);
    await browser.waitUntil(async () => (await $$(".main-slice")).length > 0 && (await $$(".main-slice")[0].getAttribute("aria-label")) === "Desmutar", {
      timeoutMsg: "a fatia do cenário 17 não apareceu na busca",
    });
    expect(await $('[data-testid="hub-search"]').getText()).toContain("desm");
    await pressKey("Escape");
    await browser.waitUntil(async () => !(await $('[data-testid="hub-search"]').isExisting()), { timeoutMsg: "Esc não limpou a busca" });
    expect((await qaState()).menuVisible).toBe(true);
    await pressKey("Escape");
    await toWindow("settings.html");
    await browser.waitUntil(async () => !(await qaState()).menuVisible, { timeoutMsg: "o 2º Esc não fechou o menu" });
  });
  it("19. (QA) pré-visualização editável: clicar escolhe, arrastar reordena, põe no submenu (spring), tira dele; inválido não muda (ponteiro só na página)", async function () {
    this.timeout(180000);
    await toWindow("settings.html");
    const cfg = await invoke("get_config");
    const leaf = (id) => ({ id: `e2e-${id}`, label: id, icon: "code", action: { type: "media", cmd: "playpause" } });
    cfg.profiles[0].items = [leaf("A"), leaf("B"), leaf("C"), { id: "e2e-S", label: "S", icon: "folder", children: [leaf("s1"), leaf("s2")] }, { id: "e2e-T", label: "T", icon: "folder", children: [leaf("t1")] }, leaf("D")];
    await invoke("save_config", { config: cfg });
    await browser.refresh();
    await toWindow("settings.html");
    // Outras páginas: pré-visualização sem editor (igual a antes).
    await nav("Aparência");
    await $(".preview-canvas svg.radial-canvas").waitForExist();
    expect(await $('[data-testid="preview-editor"]').isExisting()).toBe(false);
    await nav("Itens do menu");
    if (await $(".profile-picker select").isExisting()) await $(".profile-picker select").selectByIndex(0);
    await $('[data-testid="preview-editor"]').waitForExist();
    const box = await browser.execute(() => {
      const r = document.querySelector('[data-testid="preview-editor"] svg').getBoundingClientRect();
      return { left: r.left, top: r.top, width: r.width, height: r.height, vw: innerWidth, vh: innerHeight };
    });
    expect(Math.abs(box.width - box.height)).toBeLessThan(2); // hitTest supõe <svg> quadrado
    const k = box.width / 900;
    const at = (r, deg) => ({ x: Math.round(box.left + (450 + r * Math.cos((deg * Math.PI) / 180)) * k), y: Math.round(box.top + (450 + r * Math.sin((deg * Math.PI) / 180)) * k) });
    const main = (i, n) => at(215, -90 + (i * 360) / n);
    const sub = (parent, n, j, kids) => {
      const s = Math.min(38, 320 / kids);
      return at(332, -90 + (parent * 360) / n - (kids * s) / 2 + (j + 0.5) * s);
    };
    const rows = () => browser.execute(() => [...document.querySelectorAll(".tree-row")].map((r) => (r.classList.contains("is-child") ? "  " : "") + r.querySelector(".tree-label").textContent + (r.classList.contains("is-selected") ? "*" : "")));
    const hint = () => browser.execute(() => document.querySelector(".preview-drag-hint")?.textContent ?? null);
    const ptr = () => browser.action("pointer");
    const labels = (items) => items.map((i) => (i.children ? `${i.label}[${i.children.map((c) => c.label).join(",")}]` : i.label)).join(" ");

    // Clique escolhe (e não muda nada).
    await ptr().move({ ...main(2, 6), origin: "viewport" }).down().pause(60).up().perform();
    expect(await rows()).toEqual(["A", "B", "C*", "S", "  s1", "  s2", "T", "  t1", "D"]);
    expect(await browser.execute(() => document.querySelector(".item-editor input").value)).toBe("C");
    expect(await $("button=Salvar").isEnabled()).toBe(false);

    // (QA v0.29.1) Esc no meio do arrasto cancela: some a dica e o fantasma, soltar não move nada.
    await ptr().move({ ...main(0, 6), origin: "viewport" }).down().move({ ...main(1, 6), origin: "viewport", duration: 150 }).move({ ...main(2, 6), origin: "viewport", duration: 150 }).pause(150).perform(true);
    expect(await hint()).toBe("Mover para a posição 3");
    await pressKey("Escape");
    await browser.waitUntil(async () => (await hint()) === null && !(await $(".preview-ghost").isExisting()), { timeoutMsg: "Esc não cancelou o arrasto" });
    await ptr().move({ ...main(2, 6), origin: "viewport" }).up().perform();
    expect(await rows()).toEqual(["A*", "B", "C", "S", "  s1", "  s2", "T", "  t1", "D"]);
    expect(await $("button=Salvar").isEnabled()).toBe(false);
    expect(labels(qaConfig().profiles[0].items)).toBe("A B C S[s1,s2] T[t1] D");

    // Fatia 1 → posição 3 (com captura no meio do arrasto).
    await ptr().move({ ...main(0, 6), origin: "viewport" }).down().move({ ...main(1, 6), origin: "viewport", duration: 150 }).move({ ...main(2, 6), origin: "viewport", duration: 150 }).pause(150).perform(true);
    expect(await hint()).toBe("Mover para a posição 3");
    expect(await $(".preview-ghost").isExisting()).toBe(true);
    if (process.env.KIRA_SHOT_DIR) await browser.saveScreenshot(join(process.env.KIRA_SHOT_DIR, "19-arrastando.png"));
    await ptr().move({ ...main(2, 6), origin: "viewport" }).up().perform();
    expect(await rows()).toEqual(["B", "C", "A*", "S", "  s1", "  s2", "T", "  t1", "D"]);
    await save();
    expect(labels(qaConfig().profiles[0].items)).toBe("B C A S[s1,s2] T[t1] D");

    // D parado sobre S → sub-anel abre → solta entre s1 e s2.
    await ptr().move({ ...main(5, 6), origin: "viewport" }).down().move({ ...main(4, 6), origin: "viewport", duration: 100 }).move({ ...main(3, 6), origin: "viewport", duration: 100 }).pause(800).perform(true);
    expect(await browser.execute(() => document.querySelectorAll('[data-testid="preview-editor"] .sub-slice').length)).toBe(2);
    await ptr().move({ ...sub(3, 6, 1, 2), origin: "viewport", duration: 150 }).pause(100).perform(true);
    expect(await hint()).toBe('Mover para o submenu "S"');
    if (process.env.KIRA_SHOT_DIR) await browser.saveScreenshot(join(process.env.KIRA_SHOT_DIR, "19-subanel.png"));
    await ptr().move({ ...sub(3, 6, 1, 2), origin: "viewport" }).up().perform();
    expect(await rows()).toEqual(["B", "C", "A", "S", "  s1", "  D*", "  s2", "T", "  t1"]);
    await save();
    expect(labels(qaConfig().profiles[0].items)).toBe("B C A S[s1,D,s2] T[t1]");

    // Subitem s1 (sub-anel de S aberto pela seleção) → anel, na posição 1.
    await ptr().move({ ...sub(3, 5, 0, 3), origin: "viewport" }).down().move({ ...main(4, 5), origin: "viewport", duration: 150 }).move({ ...main(0, 5), origin: "viewport", duration: 150 }).pause(100).perform(true);
    expect(await hint()).toBe("Mover para a posição 1");
    await ptr().move({ ...main(0, 5), origin: "viewport" }).up().perform();
    expect(await rows()).toEqual(["s1*", "B", "C", "A", "S", "  D", "  s2", "T", "  t1"]);
    await save();
    expect(labels(qaConfig().profiles[0].items)).toBe("s1 B C A S[D,s2] T[t1]");

    // Inválido: submenu S dentro do submenu T → motivo na tela, nada muda.
    await ptr().move({ ...main(4, 6), origin: "viewport" }).down().move({ ...main(5, 6), origin: "viewport", duration: 150 }).pause(800).perform(true);
    await ptr().move({ ...sub(5, 6, 0, 1), origin: "viewport", duration: 150 }).pause(100).perform(true);
    expect(await hint()).toBe("Não dá: submenu dentro de submenu não é permitido");
    expect(await $(".preview-ghost.is-invalid").isExisting()).toBe(true);
    if (process.env.KIRA_SHOT_DIR) await browser.saveScreenshot(join(process.env.KIRA_SHOT_DIR, "19-invalido.png"));
    await ptr().move({ ...sub(5, 6, 0, 1), origin: "viewport" }).up().perform();
    expect(await rows()).toEqual(["s1", "B", "C", "A", "S*", "  D", "  s2", "T", "  t1"]);
    expect(await $("button=Salvar").isEnabled()).toBe(false);
    expect(await $(".preview-ghost").isExisting()).toBe(false);

    // Lista ao lado continua igual: Alt+↓ na linha move o item.
    await browser.execute(() => document.querySelector(".tree-row.is-selected").dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowDown", altKey: true, bubbles: true })));
    expect((await rows()).filter((r) => !r.startsWith(" ")).map((r) => r.replace("*", ""))).toEqual(["s1", "B", "C", "A", "T", "S"]);
    await browser.execute(() => document.querySelector(".tree-row.is-selected").dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowUp", altKey: true, bubbles: true })));
    expect(await $("button=Salvar").isEnabled()).toBe(false);
  });
  it("20. atualização (simulada): aviso no topo, seção em Geral e a Kira de teste não instala", async () => {
    await nav("Itens do menu");
    await invoke("qa_fake_update", { version: "9.9.9", notes: "- Teste do aviso" });
    await $('[data-testid="update-banner"]').waitForExist({ timeout: 5000 });
    expect(await $('[data-testid="update-banner"]').getText()).toContain("9.9.9");
    await $('[data-testid="update-banner"] button.link').click();
    await $('[data-testid="update-box"]').waitForExist({ timeout: 5000 });
    expect(await $('[data-testid="update-box"]').getText()).toContain("Versão 9.9.9 disponível");
    expect(await $('[data-testid="update-banner"]').isExisting()).toBe(false);
    await $("button*=Atualizar e reiniciar").click();
    await browser.waitUntil(async () => (await $('[data-testid="update-box"]').getText()).includes("não instala"), {
      timeoutMsg: "a Kira de teste deveria recusar a instalação",
    });
  });
  it("20b. (QA) Atualizações em Geral: toggle grava checkUpdates e 'Procurar agora' não procura de verdade na Kira de teste", async () => {
    await nav("Geral");
    const row = await $("label.toggle-row*=Procurar atualizações automaticamente");
    await row.waitForExist({ timeout: 5000 });
    const box = await row.$("input.toggle");
    if (!(await box.isSelected())) {
      await row.click();
      await save();
    }
    expect(await box.isSelected()).toBe(true);
    await row.click();
    expect(await box.isSelected()).toBe(false);
    await save();
    expect(qaConfig().behavior.checkUpdates).toBe(false);
    await row.click();
    await save();
    expect(qaConfig().behavior.checkUpdates).not.toBe(false); // ausente ou true (padrão)

    const before = await invoke("update_status");
    await $("button*=Procurar agora").click();
    await browser.waitUntil(async () => !(await $('[data-testid="update-box"]').getText()).includes("Procurando"), {
      timeoutMsg: "'Procurar agora' não terminou",
    });
    const after = await invoke("update_status");
    // Kira de teste: check() devolve o último estado (o aviso simulado do cenário 20), sem rede.
    expect(after.version).toBe(before.version);
    expect(after.error ?? null).toBe(null);
    expect(await $('[data-testid="update-box"]').getText()).toContain("Procurar agora");
  });
  it("21. (QA) idioma: English nas Configurações vale no menu, na confirmação e no preview do print; Automático tira a chave; inválido não quebra", async () => {
    const hubLabel = () => $("g.center-hub").getAttribute("aria-label");
    await nav("Geral");
    console.log("[21] WebView2:", JSON.stringify(await browser.execute(() => [navigator.language, navigator.languages])));
    await pickRadio("English");
    // Vale na hora no rascunho (rótulos do próprio campo).
    await browser.waitUntil(async () => (await browser.execute(() => document.documentElement.lang)) === "en", { timeoutMsg: "rascunho não trocou o idioma" });
    await saveEn(); // 0.31.1: as Configurações também ficam em inglês
    expect(qaConfig().behavior.language).toBe("en");
    // Fatia "Desligar" na posição 1 (a confirmação nunca é aceita aqui; a trava QA vale de todo jeito).
    const cfg = await invoke("get_config");
    for (const p of cfg.profiles) p.items[0] = { id: "e2e-off", label: "Desligar", icon: "zap", action: { type: "system", cmd: "shutdown" } };
    await invoke("save_config", { config: cfg });
    expect(qaConfig().behavior.language).toBe("en");

    // Menu (config:changed): centro, busca e confirmação em inglês.
    await invoke("hide_menu");
    await invoke("qa_show_menu", { fromOrb: false });
    await toWindow("");
    await browser.waitUntil(async () => (await hubLabel()) === "Close", { timeoutMsg: "menu não ficou em inglês" });
    expect(await browser.execute(() => document.documentElement.lang)).toBe("en");
    for (const k of "zzqx") await pressKey(k, `Key${k.toUpperCase()}`);
    await $('[data-testid="hub-search"]').waitForExist({ timeout: 5000 });
    const hubText = await $('[data-testid="hub-search"]').getText();
    expect(hubText).toContain("SEARCH");
    expect(hubText).toContain("ESC CLEARS");
    await pressKey("Escape");
    await browser.waitUntil(async () => !(await $('[data-testid="hub-search"]').isExisting()), { timeoutMsg: "Esc não limpou a busca" });
    await pressKey("1", "Digit1");
    await $('[role="alertdialog"]').waitForExist({ timeout: 5000 });
    // textContent: getText devolve "" enquanto a animação de entrada ainda está transparente.
    await browser.waitUntil(async () => (await $("#confirm-title").getProperty("textContent")) === "Shut Down", { timeout: 5000, timeoutMsg: "título da confirmação não ficou em inglês" });
    expect(await $("#confirm-message").getProperty("textContent")).toBe("Are you sure you want to shut down?");
    const cancel = await $("button.confirm-btn:not(.is-danger)");
    expect(await cancel.getProperty("textContent")).toBe("Cancel");
    await browser.pause(450); // pausa anti-duplo-clique
    await cancel.click();
    await browser.waitUntil(async () => !(await $('[role="alertdialog"]').isExisting()), { timeoutMsg: "Cancel não fechou" });
    await pressKey("Escape");
    await toWindow("settings.html");
    await invoke("hide_menu");

    // Preview do print (falso) em inglês.
    await invoke("qa_fake_shot", { width: 1280, height: 720 });
    await toWindow("shot.html");
    await $('[data-testid="shot-preview"]').waitForExist({ timeout: 10000 });
    await browser.waitUntil(async () => (await $(".shot-title").getText()) === "Screenshot · 1280×720", { timeout: 5000, timeoutMsg: "preview não ficou em inglês" });
    const labels = await $$(".shot-btn").map((b) => b.getAttribute("aria-label"));
    expect(labels).toEqual(["Copy", "Save as…", "Edit", "Pin to screen"]);
    await $('.shot-head button[aria-label="Close"]').click();

    // Automático: apaga a chave e segue o idioma do WebView2.
    await nav("General");
    await pickRadio("Automatic");
    await save();
    expect("language" in qaConfig().behavior).toBe(false);
    await invoke("qa_show_menu", { fromOrb: false });
    await toWindow("");
    // Automático = lista de idiomas do usuário no Windows (qualquer pt → português).
    const sys = await invoke("system_languages");
    console.log("[21] system_languages:", JSON.stringify(sys));
    const want = sys.some((l) => /^pt\b/i.test(l)) ? "Fechar" : "Close";
    await browser.waitUntil(async () => (await hubLabel()) === want, { timeoutMsg: `automático não seguiu ${JSON.stringify(sys)}` });
    expect(await browser.execute(() => document.documentElement.lang)).toBe(want === "Fechar" ? "pt-BR" : "en");
    await pressKey("Escape");

    // Idioma inválido vindo de fora (número, "fr") não derruba o salvar nem grava a chave.
    await toWindow("settings.html");
    for (const bad of [5, "fr"]) {
      const c = await invoke("get_config");
      c.behavior.language = bad;
      await invoke("save_config", { config: c });
      expect("language" in qaConfig().behavior).toBe(false);
      expect((await invoke("get_config")).profiles.length).toBeGreaterThan(0);
    }
    // Lista do Windows limpa: sem NUL no fim e sem repetidos (sem diferenciar caixa).
    expect(sys.filter((l) => typeof l !== "string" || !l.length || l.includes("\u0000"))).toEqual([]);
    expect(new Set(sys.map((l) => l.toLowerCase())).size).toBe(sys.length);
  });
  it("22. (QA) Configurações em inglês: todas as páginas, testar ação (Discord FALSO), arrastar na pré-visualização, gravador de atalho, relógio 24 h; Automático volta ao português", async function () {
    this.timeout(180000);
    const navEn = async (label) => {
      await toWindow("settings.html");
      const b = await $(`button.nav-item*=${label}`);
      await b.waitForExist();
      await b.click();
    };
    // Itens simples para o arrasto (e uma fatia comum para testar a ação).
    await toWindow("settings.html");
    const cfg = await invoke("get_config");
    const leaf = (id) => ({ id: `e22-${id}`, label: id, icon: "code", action: { type: "media", cmd: "playpause" } });
    cfg.profiles[0].items = [leaf("A"), leaf("B"), leaf("C"), { id: "e22-S", label: "S", icon: "folder", children: [leaf("s1")] }, leaf("D")];
    cfg.behavior.language = "en";
    await invoke("save_config", { config: cfg });
    await browser.refresh();
    await toWindow("settings.html");
    await browser.waitUntil(async () => (await browser.execute(() => document.documentElement.lang)) === "en", { timeoutMsg: "Configurações não abriram em inglês" });

    // Todas as páginas abrem (sem tela de erro); restos em português só são listados (parte 0.31.2 = validate/describe/schedule/Rust).
    const PT = /[ãõçáéíóúâêôà]/i;
    const leftovers = [];
    for (const page of ["Menu items", "Shortcut", "Icon", "Profiles", "General", "Appearance", "Backup", "Discord", "Diagnostics"]) {
      await navEn(page);
      await browser.pause(150);
      const r = await browser.execute(() => {
        const main = document.querySelector("main.content");
        if (!main) return { err: "sem main" };
        const c = main.cloneNode(true);
        c.querySelectorAll('[aria-label="Idioma / Language"], option, input, textarea, select, .theme-thumb, .tree-label, .profile-picker, .backup-list, .backup-diff, .log-view, pre').forEach((n) => n.remove());
        return { err: document.querySelector(".error-fallback") ? "error-fallback" : null, text: c.innerText };
      });
      expect(r.err ?? null).toBe(null);
      expect(r.text.length).toBeGreaterThan(20);
      for (const line of r.text.split("\n")) if (PT.test(line)) leftovers.push(`${page}: ${line.trim()}`);
    }
    for (const el of [".sidebar", ".savebar"]) {
      const txt = await $(el).getText();
      for (const line of txt.split("\n")) if (PT.test(line)) leftovers.push(`${el}: ${line.trim()}`);
    }
    console.log("[22] restos em português:\n" + (leftovers.join("\n") || "(nenhum)"));

    // Testar ação: fatia B vira Discord (FALSO na Kira de teste) e "Test action" alterna o mudo, sem salvar.
    await navEn("Menu items");
    if (await $(".profile-picker select").isExisting()) await $(".profile-picker select").selectByIndex(0);
    await $$(".tree-row")[1].click();
    await $$(".action-editor select")[0].selectByAttribute("value", "discord");
    const before = (await invoke("discord_voice")).voice?.mute;
    await $("button*=Test action").click();
    await browser.waitUntil(async () => (await invoke("discord_voice")).voice?.mute === !before, { timeout: 8000, timeoutMsg: "Test action não executou (Discord FALSO)" });
    await $("button=Discard").click();
    await browser.waitUntil(async () => !(await $("button=Save").isEnabled()), { timeoutMsg: "Discard não descartou" });

    // Arrastar na pré-visualização (ponteiro só dentro da página): "Same place", depois A → posição 3.
    await $('[data-testid="preview-editor"]').waitForExist();
    const box = await browser.execute(() => {
      const r = document.querySelector('[data-testid="preview-editor"] svg').getBoundingClientRect();
      return { left: r.left, top: r.top, width: r.width };
    });
    const k = box.width / 900;
    const main = (i, n) => ({ x: Math.round(box.left + (450 + 215 * Math.cos(((-90 + (i * 360) / n) * Math.PI) / 180)) * k), y: Math.round(box.top + (450 + 215 * Math.sin(((-90 + (i * 360) / n) * Math.PI) / 180)) * k) });
    const hint = () => browser.execute(() => {
      const h = document.querySelector(".preview-drag-hint");
      return h ? { text: h.textContent, invalid: h.classList.contains("is-invalid") } : null;
    });
    const ptr = () => browser.action("pointer");
    await ptr().move({ ...main(0, 5), origin: "viewport" }).down().move({ ...main(1, 5), origin: "viewport", duration: 150 }).move({ ...main(0, 5), origin: "viewport", duration: 150 }).pause(150).perform(true);
    expect(await hint()).toEqual({ text: "Same place", invalid: false });
    await pressKey("Escape");
    await browser.waitUntil(async () => (await hint()) === null, { timeoutMsg: "Esc não cancelou o arrasto" });
    await ptr().move({ ...main(0, 5), origin: "viewport" }).up().perform();
    await ptr().move({ ...main(0, 5), origin: "viewport" }).down().move({ ...main(1, 5), origin: "viewport", duration: 150 }).move({ ...main(2, 5), origin: "viewport", duration: 150 }).pause(150).perform(true);
    expect((await hint()).text).toBe("Move to position 3");
    await ptr().move({ ...main(2, 5), origin: "viewport" }).up().perform();
    await saveEn();
    expect(qaConfig().profiles[0].items.map((i) => i.label).join(" ")).toBe("B C A S D");

    // Gravador de atalho: rótulo em inglês e combinação mostrada. NÃO recebe foco: gravar liga um
    // hook de teclado de baixo nível (keycapture) que pegaria o teclado real do usuário.
    // (A página Atalho esconde o gravador no modo Ícone, que o cenário 6 deixou ligado: usa o da fatia.)
    await navEn("Menu items");
    await $$(".tree-row")[0].click();
    const rec = await $('[aria-label="Record shortcut"]');
    await rec.waitForExist();
    const recState = await browser.execute(() => {
      const r = document.querySelector('[aria-label="Record shortcut"]');
      return { recording: r.classList.contains("is-recording"), kbd: r.querySelectorAll("kbd").length, text: r.textContent };
    });
    expect(recState.recording).toBe(false);
    expect(recState.kbd > 0 || recState.text.includes("Click to record")).toBe(true);

    // Relógio da pré-visualização: hora 24 h e data em inglês.
    const clock = await browser.execute(() => ({ time: document.querySelector(".preview .hub-time")?.textContent ?? null, date: document.querySelector(".preview .hub-date")?.textContent ?? null }));
    console.log("[22] relógio:", JSON.stringify(clock));
    if (clock.time !== null) expect(clock.time).toMatch(/^([01]\d|2[0-3]):[0-5]\d$/);
    if (clock.date !== null) expect(clock.date).toMatch(/^[A-Z]{3}, [A-Z]{3} \d{2}$/);
    // Menu e ícone com rótulos em inglês.
    await invoke("qa_show_menu", { fromOrb: false });
    await toWindow("");
    await browser.waitUntil(async () => (await $("svg.radial-canvas").getAttribute("aria-label")) === "Radial menu", { timeoutMsg: "aria-label do menu não ficou em inglês" });
    const menuClock = await browser.execute(() => ({ time: document.querySelector(".hub-time")?.textContent ?? null, date: document.querySelector(".hub-date")?.textContent ?? null }));
    console.log("[22] relógio do menu:", JSON.stringify(menuClock));
    if (menuClock.time !== null && /:/.test(menuClock.time)) expect(menuClock.time).toMatch(/^([01]\d|2[0-3]):[0-5]\d$/);
    await pressKey("Escape");
    await toWindow("settings.html");
    await invoke("hide_menu");

    // Automático: volta ao português (lista do Windows tem pt) e o salvar volta a ser "Salvar".
    await navEn("General");
    await pickRadio("Automatic");
    await save();
    expect("language" in qaConfig().behavior).toBe(false);
    await browser.waitUntil(async () => (await browser.execute(() => document.documentElement.lang)) === "pt-BR", { timeoutMsg: "Automático não voltou ao português" });
  });
  it("23. (QA) mensagens do Rust no idioma: erros de ação/salvar em inglês e português; Discord FALSO desconectado = notConnected nos dois idiomas, trocando com a Kira aberta", async () => {
    const PT = /[ãõçáéíóúâêôà]/i;
    await toWindow("settings.html");
    const original = await invoke("get_config");
    const setLangRust = async (lang) => {
      const c = await invoke("get_config");
      if (lang) c.behavior.language = lang;
      else delete c.behavior.language;
      await invoke("save_config", { config: c });
    };
    const fail = (fn) => browser.execute((f) => eval(f)().then(() => "OK", (e) => String(e)), `() => ${fn}`);
    // Só erros que acontecem antes de qualquer efeito: URL inválida (checada antes de abrir navegador),
    // desligar dentro de sequência (recusado antes de rodar) e config inválida (validação).
    const probes = async () => ({
      url: await fail(`window.__TAURI_INTERNALS__.invoke("run_action", { action: { type: "url", url: "ftp://qa.invalid" } })`),
      seq: await fail(`window.__TAURI_INTERNALS__.invoke("run_action", { action: { type: "sequence", steps: [{ type: "system", cmd: "shutdown" }, { type: "media", cmd: "next" }] } })`),
      seqStep: await fail(`window.__TAURI_INTERNALS__.invoke("run_action", { action: { type: "sequence", steps: [{ type: "url", url: "ftp://qa.invalid" }, { type: "url", url: "ftp://qa.invalid" }] } })`),
      cfg: await fail(`window.__TAURI_INTERNALS__.invoke("get_config").then((c) => { c.profiles = []; return window.__TAURI_INTERNALS__.invoke("save_config", { config: c }); })`),
    });

    await setLangRust("en");
    const en = await probes();
    console.log("[23] en:", JSON.stringify(en));
    expect(Object.entries(en).filter(([, v]) => v === "OK" || PT.test(v))).toEqual([]);
    expect(en.cfg).toContain("at least one profile is required");
    expect(en.seqStep).toMatch(/^step 1 of 2: /);

    await setLangRust("pt");
    const pt = await probes();
    console.log("[23] pt:", JSON.stringify(pt));
    expect(Object.entries(pt).filter(([, v]) => v === "OK")).toEqual([]);
    expect(pt.cfg).toContain("é necessário ao menos um perfil");
    expect(pt.seqStep).toMatch(/^passo 1 de 2: /);

    // Discord FALSO: desconectar → notConnected; o status continua certo trocando o idioma com a Kira aberta.
    await invoke("discord_disconnect");
    const v1 = await invoke("discord_voice");
    await setLangRust("en");
    const v2 = await invoke("discord_voice");
    await setLangRust("pt");
    const v3 = await invoke("discord_voice");
    console.log("[23] discord:", JSON.stringify([v1, v2, v3].map((v) => [v.status, v.message])));
    expect([v1.status, v2.status, v3.status]).toEqual(["notConnected", "notConnected", "notConnected"]);
    expect(v2.message).not.toMatch(PT);
    expect(v3.message).toMatch(PT);
    // Página Discord em inglês mostra "não conectado" em inglês.
    await setLangRust("en");
    await browser.refresh();
    await toWindow("settings.html");
    const b = await $("button.nav-item*=Discord");
    await b.waitForExist();
    await b.click();
    await $('[data-testid="discord-status"]').waitForExist();
    const st = await $('[data-testid="discord-status"]').getText();
    console.log("[23] página Discord:", st);
    expect(st).not.toMatch(PT);

    // Volta a config de antes (idioma automático).
    delete original.behavior.language;
    await invoke("save_config", { config: original });
    expect("language" in qaConfig().behavior).toBe(false);
  });
  it("24. (QA) gravador de atalho de verdade (qa_key_capture, sem hook de teclado): fatia e Atalho; recusada continua gravando; cancelar; sem gravação = erro", async () => {
    await toWindow("settings.html");
    const original = await invoke("get_config");
    const cfg = structuredClone(original);
    // Na Kira de teste o apply_hotkey não registra no Windows (v0.31.3): dá para salvar
    // modo e atalho principal; o knob fica só no rascunho.
    for (const p of cfg.profiles) for (const it of p.items) delete it.hotkey;
    await invoke("save_config", { config: cfg });
    await browser.refresh();
    await toWindow("settings.html");
    const capture = (combo) => browser.execute((c) => window.__TAURI_INTERNALS__.invoke("qa_key_capture", { combo: c }).then(() => "OK", (e) => String(e)), combo);
    const recSel = '[aria-label="Gravar atalho"]';
    const recording = () => browser.execute((s) => !!document.querySelector(s)?.classList.contains("is-recording"), recSel);
    const kbds = () => browser.execute((s) => [...document.querySelector(s).querySelectorAll("kbd")].map((k) => k.textContent), recSel);
    /** Foca o gravador e espera o backend aceitar o qa_key_capture (a gravação começa assíncrona). */
    const startRec = async () => {
      await browser.execute((s) => document.querySelector(s).focus(), recSel);
      await browser.waitUntil(recording, { timeoutMsg: "gravador não entrou em gravação" });
      await browser.pause(300);
    };

    // Sem gravação ativa: erro.
    expect(await capture("Ctrl+Alt+J")).toContain("não está gravando");

    // Fatia: grava Ctrl+Alt+K, aparece no campo e vai para o rascunho/config ao salvar.
    await nav("Itens do menu");
    if (await $(".profile-picker select").isExisting()) await $(".profile-picker select").selectByIndex(0);
    await $$(".tree-row")[0].click();
    await $(recSel).waitForExist();
    await startRec();
    expect(await capture("Ctrl+Alt+K")).toBe("OK");
    await browser.waitUntil(async () => !(await recording()), { timeoutMsg: "gravação não terminou" });
    expect(await kbds()).toEqual(["Ctrl", "Alt", "K"]);
    expect(await $("button=Salvar").isEnabled()).toBe(true);
    await save();
    expect(qaConfig().profiles[0].items[0].hotkey).toBe("Ctrl+Alt+K");
    // Depois de terminar, sem gravação de novo.
    expect(await capture("Ctrl+Alt+J")).toContain("não está gravando");

    // Cancelar (Esc): sai da gravação e não muda nada.
    await startRec();
    expect(await capture(null)).toBe("OK");
    await browser.waitUntil(async () => !(await recording()), { timeoutMsg: "cancelar não parou a gravação" });
    expect(await kbds()).toEqual(["Ctrl", "Alt", "K"]);
    expect(await $("button=Salvar").isEnabled()).toBe(false);

    // Página Atalho ("Ícone + atalho" mostra o gravador; exige modificador):
    // "K" sozinho é recusado e a gravação continua; Ctrl+Alt+M vale.
    const accelBefore = qaConfig().hotkey.accelerator;
    const modeBefore = qaConfig().launcher.mode;
    await nav("Atalho");
    await pickRadio("Ícone + atalho");
    await $(recSel).waitForExist();
    await startRec();
    expect(await capture("K")).toBe("OK");
    await browser.pause(400);
    expect(await recording()).toBe(true);
    await browser.waitUntil(async () => (await capture("Ctrl+Alt+M")) === "OK", { timeout: 5000, timeoutMsg: "a gravação não recomeçou depois da recusa" });
    await browser.waitUntil(async () => !(await recording()), { timeoutMsg: "gravação do Atalho não terminou" });
    expect(await kbds()).toEqual(["Ctrl", "Alt", "M"]);
    expect(await $("button=Salvar").isEnabled()).toBe(true);
    expect(await capture("Ctrl+Alt+J")).toContain("não está gravando");

    // Knob (mesma página, só no rascunho): ligar mostra os gravadores das teclas; grava Ctrl+Alt+F9 no 1º deles.
    const recsBefore = await browser.execute((s) => document.querySelectorAll(s).length, recSel);
    await $("label.toggle-row*=Usar o knob").click();
    await browser.waitUntil(async () => (await browser.execute((s) => document.querySelectorAll(s).length, recSel)) > recsBefore, { timeoutMsg: "gravadores do knob não apareceram" });
    await browser.execute((s, n) => document.querySelectorAll(s)[n].focus(), recSel, recsBefore);
    const knobRecording = () => browser.execute((s, n) => document.querySelectorAll(s)[n].classList.contains("is-recording"), recSel, recsBefore);
    const knobKbds = () => browser.execute((s, n) => [...document.querySelectorAll(s)[n].querySelectorAll("kbd")].map((k) => k.textContent), recSel, recsBefore);
    await browser.waitUntil(knobRecording, { timeoutMsg: "gravador do knob não entrou em gravação" });
    await browser.pause(300);
    expect(await capture("Ctrl+Alt+F9")).toBe("OK");
    await browser.waitUntil(async () => !(await knobRecording()), { timeoutMsg: "gravação do knob não terminou" });
    expect(await knobKbds()).toEqual(["Ctrl", "Alt", "F9"]);

    // Desliga o knob de novo e SALVA modo "Ícone + atalho" com Ctrl+Alt+M (em uso no Windows):
    // na Kira de teste o apply_hotkey não registra nada, então não há "HotKey already registered".
    await $("label.toggle-row*=Usar o knob").click();
    await save();
    expect(await $(".savebar").getText()).not.toContain("registrar");
    expect(qaConfig().hotkey.accelerator).toBe("Ctrl+Alt+M");
    expect(qaConfig().launcher.mode).toBe("both");
    expect(qaConfig().knob?.enabled ?? false).toBe(false);
    expect(accelBefore).not.toBe("Ctrl+Alt+M");
    expect(modeBefore).not.toBe("both");
    // Atalho inválido continua recusado (to_shortcut / validação), e a config não muda.
    const bad = await browser.execute(() =>
      window.__TAURI_INTERNALS__.invoke("get_config").then((c) => {
        c.hotkey.accelerator = "Ctrl+Nope";
        return window.__TAURI_INTERNALS__.invoke("save_config", { config: c });
      }).then(() => "OK", (e) => String(e)),
    );
    console.log("[24] atalho inválido:", bad);
    expect(bad).not.toBe("OK");
    expect(qaConfig().hotkey.accelerator).toBe("Ctrl+Alt+M");

    // Volta a config de antes.
    await invoke("save_config", { config: original });
    expect(qaConfig().hotkey.accelerator).toBe(original.hotkey.accelerator);
  });

  it("25. (QA v0.33.0) submenus VPNs (FALSA, da Kira de teste) e Projetos do VS Code (só leitura, nenhum projeto é aberto)", async () => {
    await toWindow("settings.html");
    const original = await invoke("get_config");
    const withFirst = (dynamic) => {
      const cfg = structuredClone(original);
      for (const p of cfg.profiles) {
        const it = p.items[0];
        delete it.action;
        delete it.children;
        delete it.dynamicTarget;
        delete it.dynamicTargetName;
        it.dynamic = dynamic;
      }
      return cfg;
    };
    const subLabels = () => browser.execute(() => [...document.querySelectorAll(".sub-slice")].map((s) => s.getAttribute("aria-label")));
    const runAction = (a) => browser.execute((x) => window.__TAURI_INTERNALS__.invoke("run_action", { action: x }).then(() => "ok", (e) => String(e)), a);

    // VPN: a Kira de teste só conhece a VPN fingida, desconectada no início.
    expect(await invoke("list_vpns")).toEqual([{ name: "Kira QA VPN", connected: false }]);
    await invoke("save_config", { config: withFirst("vpns") });
    await invoke("qa_show_menu", { fromOrb: false });
    await toWindow("");
    await pressKey("1", "Digit1");
    await browser.waitUntil(async () => (await subLabels())[0] === "Kira QA VPN", { timeoutMsg: "submenu VPNs não listou a VPN fingida" });
    await pressKey("1", "Digit1"); // alterna (fingido) → conectada
    await browser.waitUntil(async () => (await invoke("list_vpns"))[0]?.connected === true, { timeoutMsg: "VPN fingida não conectou" });
    // Pela ação: desconectar, conectar 2x (fica), nome desconhecido/ inválido = erro.
    await toWindow("settings.html");
    expect(await runAction({ type: "vpn", name: "Kira QA VPN", mode: "disconnect" })).toBe("ok");
    expect((await invoke("list_vpns"))[0].connected).toBe(false);
    expect(await runAction({ type: "vpn", name: "Kira QA VPN", mode: "connect" })).toBe("ok");
    expect(await runAction({ type: "vpn", name: "Kira QA VPN", mode: "connect" })).toBe("ok");
    expect((await invoke("list_vpns"))[0].connected).toBe(true);
    const unknown = await runAction({ type: "vpn", name: "VPN Real Qualquer", mode: "connect" });
    console.log("[25] VPN desconhecida:", unknown);
    expect(unknown).toContain("não encontrada");
    expect(await runAction({ type: "vpn", name: 'a"b', mode: "toggle" })).not.toBe("ok");
    expect(await runAction({ type: "vpn", name: "Kira QA VPN", mode: "liga" })).not.toBe("ok");
    expect(await runAction({ type: "vpn", name: "Kira QA VPN", mode: "disconnect" })).toBe("ok");
    // Menu reaberto mostra o estado novo (cache invalidado pela ação "vpn").
    await invoke("qa_show_menu", { fromOrb: false });
    await toWindow("");
    await pressKey("1", "Digit1");
    await browser.waitUntil(async () => (await subLabels())[0] === "Kira QA VPN", { timeoutMsg: "submenu VPNs não reabriu" });
    await pressKey("Escape");
    await pressKey("Escape");

    // VS Code: o submenu mostra exatamente o que o backend leu (sem clicar em nada).
    await toWindow("settings.html");
    const projects = await invoke("list_vscode_projects");
    console.log("[25] projetos do VS Code:", projects.length);
    expect(projects.length).toBeLessThanOrEqual(8);
    for (const p of projects) {
      expect(p.exe.toLowerCase()).toMatch(/code(?: - insiders)?\.exe$/);
      expect(p.path).not.toMatch(/^[a-z-]+:\/\//);
    }
    await invoke("save_config", { config: withFirst("vscodeProjects") });
    await invoke("qa_show_menu", { fromOrb: false });
    await toWindow("");
    await pressKey("1", "Digit1");
    await browser.waitUntil(async () => {
      const l = await subLabels();
      return l.length > 0 && l[0] !== "Carregando…";
    }, { timeoutMsg: "submenu VS Code não carregou" });
    const labels = await subLabels();
    if (projects.length === 0) expect(labels).toEqual(["Nenhum projeto"]);
    else expect(labels.length).toBe(projects.length);
    await pressKey("Escape"); // só fecha: nenhum projeto é aberto
    await pressKey("Escape");

    await toWindow("settings.html");
    await invoke("save_config", { config: original });
  });

  it("26. (QA v0.34.0) OBS (FALSO, da Kira de teste): página em pt/en, senha só cifrada, submenu de cenas troca a cena, ação com cena inválida = erro", async function () {
    this.timeout(120000);
    await toWindow("settings.html");
    const original = await invoke("get_config");
    const SECRET = "segredo-obs-e2e-QA";
    const runAction = (a) => browser.execute((x) => window.__TAURI_INTERNALS__.invoke("run_action", { action: x }).then(() => "ok", (e) => String(e)), a);
    const subLabels = () => browser.execute(() => [...document.querySelectorAll(".sub-slice")].map((s) => s.getAttribute("aria-label")));

    // Estado do OBS falso (nunca abre rede na Kira de teste).
    const st0 = await invoke("obs_state");
    expect(st0.status).toBe("ok");
    expect(st0.version).toBe("QA");
    expect(st0.scenes).toEqual(["Cena QA 1", "Cena QA 2", "Cena QA 3"]);
    expect(st0.inputs).toEqual(["Mic QA"]);

    // Página OBS em português: status do falso, salvar porta + senha.
    await nav("OBS");
    await browser.waitUntil(async () => (await $('[data-testid="obs-status"]').getText()).includes("Conectado ao OBS QA"), { timeoutMsg: "status OBS (pt) não apareceu" });
    const pw = await $('main input[type="password"]');
    await pw.setValue(SECRET);
    await $("button*=Salvar e testar").click();
    await browser.waitUntil(async () => (await invoke("obs_settings")).hasPassword === true, { timeoutMsg: "senha não salvou" });
    const view = await invoke("obs_settings");
    expect(Object.keys(view).sort()).toEqual(["hasPassword", "port"]);
    expect(JSON.stringify(view)).not.toContain(SECRET);
    expect(await pw.getValue()).toBe("");
    // Só cifrada, na pasta de TESTE; nada em config.json, log ou diagnóstico.
    expect(qaFiles()).toContain("obs.bin");
    expect(readFileSync(join(QA_DATA, "obs.bin")).includes(Buffer.from(SECRET))).toBe(false);
    expect(JSON.stringify(qaConfig())).not.toContain(SECRET);
    expect((await invoke("read_log", { lines: 500 })).join("\n")).not.toContain(SECRET);
    expect(JSON.stringify(await invoke("diagnostics"))).not.toContain(SECRET);
    // None mantém, porta inválida = erro, "" apaga.
    expect((await invoke("obs_save_settings", { port: 4460, password: null })).hasPassword).toBe(true);
    const bad = await browser.execute(() => window.__TAURI_INTERNALS__.invoke("obs_save_settings", { port: 0, password: null }).then(() => "ok", (e) => String(e)));
    expect(bad).toContain("porta inválida");
    expect(await invoke("obs_save_settings", { port: 4455, password: "" })).toEqual({ port: 4455, hasPassword: false });

    // Ação: cena inválida = erro (pt), cena válida troca; validação recusa sem cena.
    const inval = await runAction({ type: "obs", cmd: "setScene", scene: "Cena Que Nao Existe" });
    console.log("[26] cena inválida:", inval);
    expect(inval).toContain("o OBS recusou o pedido");
    expect(await runAction({ type: "obs", cmd: "explode" })).not.toBe("ok");
    expect(await runAction({ type: "obs", cmd: "toggleMute", input: "Outro" })).not.toBe("ok");
    expect(await runAction({ type: "obs", cmd: "setScene", scene: "Cena QA 3" })).toBe("ok");
    expect((await invoke("obs_state")).current).toBe("Cena QA 3");

    // Submenu automático "Cenas do OBS": ordem do OBS; clicar na 2ª troca a cena do falso.
    const cfg = structuredClone(original);
    for (const p of cfg.profiles) {
      const it = p.items[0];
      delete it.action;
      delete it.children;
      delete it.dynamicTarget;
      delete it.dynamicTargetName;
      it.dynamic = "obsScenes";
    }
    await invoke("save_config", { config: cfg });
    await invoke("qa_show_menu", { fromOrb: false });
    await toWindow("");
    await pressKey("1", "Digit1");
    await browser.waitUntil(async () => (await subLabels()).length === 3, { timeoutMsg: "submenu de cenas não listou as 3 cenas" });
    const labels = await subLabels();
    console.log("[26] submenu:", JSON.stringify(labels));
    expect(labels.map((l) => l.replace(/\s*\(.*\)$/, ""))).toEqual(["Cena QA 1", "Cena QA 2", "Cena QA 3"]);
    await pressKey("2", "Digit2");
    await toWindow("settings.html");
    await browser.waitUntil(async () => (await invoke("obs_state")).current === "Cena QA 2", { timeoutMsg: "clicar na cena não trocou" });

    // Página em inglês.
    const en = structuredClone(original);
    en.behavior.language = "en";
    await invoke("save_config", { config: en });
    await browser.refresh();
    await toWindow("settings.html");
    await browser.waitUntil(async () => (await browser.execute(() => document.documentElement.lang)) === "en", { timeoutMsg: "não abriu em inglês" });
    const b = await $("button.nav-item*=OBS");
    await b.click();
    await browser.waitUntil(async () => (await $('[data-testid="obs-status"]').getText()).includes("Connected to OBS QA"), { timeoutMsg: "status OBS (en) não apareceu" });
    await expect($("button*=Save and test")).toBeExisting();
    const invalEn = await runAction({ type: "obs", cmd: "setScene", scene: "Nope" });
    expect(invalEn).toContain("OBS rejected the request");

    await invoke("save_config", { config: original });
    await browser.refresh();
    await toWindow("settings.html");
  });
  it("27. (QA v0.35.0) texto pronto (só registra no log na Kira de teste): variáveis, calculadora '=2*35' no menu, editor em pt/en", async function () {
    this.timeout(120000);
    await toWindow("settings.html");
    const original = await invoke("get_config");
    const runAction = (a) => browser.execute((x) => window.__TAURI_INTERNALS__.invoke("run_action", { action: x }).then(() => "ok", (e) => String(e)), a);
    const logText = async () => (await invoke("read_log", { lines: 400 })).join("\n");
    const PREFIX = "Kira de teste: texto pronto expandido: ";
    const lastExpanded = async () => {
      const lines = (await invoke("read_log", { lines: 400 })).filter((l) => l.includes(PREFIX));
      return lines.length ? lines[lines.length - 1].slice(lines[lines.length - 1].indexOf(PREFIX) + PREFIX.length) : null;
    };

    // Variáveis expandidas (data/hora do Windows), desconhecida e {{ }} literais.
    const tag = `QA27-${Date.now()}`;
    expect(await runAction({ type: "text", text: `${tag} D={data} H={ Hora } {{lit}} {desconhecida}` })).toBe("ok");
    await browser.waitUntil(async () => (await logText()).includes(`${PREFIX}${tag}`), { timeoutMsg: "texto pronto não foi registrado no log" });
    const got = await lastExpanded();
    console.log("[27] expandido:", got);
    expect(got).toMatch(new RegExp(`^${tag} D=\\S*\\d\\S* H=\\S*\\d`));
    expect(got).not.toContain("{data}");
    expect(got).toContain("{lit}");
    expect(got).toContain("{desconhecida}");
    // Vazio e grande demais são recusados (pt).
    expect(await runAction({ type: "text", text: "" })).toContain("vazio");
    expect(await runAction({ type: "text", text: "x".repeat(10001) })).toContain("10000");

    // Calculadora no menu: "=2*35" → única fatia "= 70"; Enter registra "70".
    await invoke("qa_show_menu", { fromOrb: false });
    await toWindow("");
    for (const [k, c] of [["=", "Equal"], ["2", "Digit2"], ["*", "NumpadMultiply"], ["3", "Digit3"], ["5", "Digit5"]]) await pressKey(k, c);
    // asSlices completa até 3 fatias vazias; só a 1ª tem rótulo.
    const mainLabels = () => browser.execute(() => [...document.querySelectorAll(".main-slice")].map((s) => s.getAttribute("aria-label")).filter(Boolean));
    await browser.waitUntil(async () => JSON.stringify(await mainLabels()) === JSON.stringify(["= 70"]), {
      timeoutMsg: "a fatia '= 70' não apareceu",
    });
    expect(await $('[data-testid="hub-search"]').getText()).toContain("=2*35");
    await pressKey("Enter");
    await toWindow("settings.html");
    await browser.waitUntil(async () => (await lastExpanded()) === "70", { timeoutMsg: "executar '= 70' não registrou 70 no log" });
    await browser.waitUntil(async () => !(await qaState()).menuVisible, { timeoutMsg: "o menu não fechou após colar" });

    // Editor (pt): tipo Texto pronto, botão de variável, contador, toggle → config.json.
    await nav("Itens do menu");
    await $(".profile-picker select").selectByIndex(0);
    await $$(".tree-row:not(.is-child)")[0].click();
    await pickRadio("Executar ação");
    await $('.item-editor select:has(option[value="text"])').selectByAttribute("value", "text");
    const ta = await $(".item-editor textarea");
    await ta.waitForExist();
    await ta.setValue("Olá ");
    for (const b of await $$(".text-vars button")) if ((await b.getText()).trim() === "{data}") { await b.click(); break; }
    await browser.waitUntil(async () => (await ta.getValue()) === "Olá {data}", { timeoutMsg: "botão {data} não inseriu" });
    expect(await $(".item-editor").getText()).toContain("10 de 10000 caracteres");
    const restoreToggle = await $("label.toggle-row*=Devolver a área de transferência depois");
    await restoreToggle.$("input").click();
    await save();
    const item = qaConfig().profiles[0].items.find((i) => i.action?.type === "text");
    expect(item.action).toEqual({ type: "text", text: "Olá {data}", restoreClipboard: false });

    // Editor (en): botões com nomes em inglês e textos traduzidos.
    const en = structuredClone(qaConfig());
    en.behavior.language = "en";
    await invoke("save_config", { config: en });
    await browser.refresh();
    await toWindow("settings.html");
    await browser.waitUntil(async () => (await browser.execute(() => document.documentElement.lang)) === "en", { timeoutMsg: "não abriu em inglês" });
    await (await $("button.nav-item*=Menu items")).click();
    await $(".profile-picker select").selectByIndex(0);
    await $$(".tree-row:not(.is-child)")[0].click();
    await $(".item-editor textarea").waitForExist();
    const btns = await browser.execute(() => [...document.querySelectorAll(".text-vars button")].map((b) => b.textContent));
    expect(btns).toEqual(["{date}", "{longdate}", "{time}", "{datetime}", "{clipboard}"]);
    const edText = await $(".item-editor").getText();
    expect(edText).toContain("Give the clipboard back afterwards");
    expect(edText).toContain("10 of 10000 characters");
    expect(await runAction({ type: "text", text: "" })).toContain("empty");

    await invoke("save_config", { config: original });
    await browser.refresh();
    await toWindow("settings.html");
  });
  it("28. (QA v0.36.0) layout de janelas (Kira de teste nunca move nada): captura só leitura, run_action registra no log, editor pt/en, layout vazio inválido", async function () {
    this.timeout(120000);
    await toWindow("settings.html");
    expect((await qaState()).qa).toBe(true); // segurança: só na Kira de teste
    const original = await invoke("get_config");
    const runAction = (a) => browser.execute((x) => window.__TAURI_INTERNALS__.invoke("run_action", { action: x }).then(() => "ok", (e) => String(e)), a);
    const PREFIX = "Kira de teste: layout com ";
    const layoutLines = async () => (await invoke("read_log", { lines: 400 })).filter((l) => l.includes(PREFIX));

    // Captura (só leitura): formato certo, até 20; não registra títulos no console.
    const cap = await invoke("layout_capture");
    expect(Array.isArray(cap)).toBe(true);
    expect(cap.length).toBeLessThanOrEqual(20);
    for (const w of cap) {
      expect(typeof w.exe).toBe("string");
      expect(w.exe.length).toBeGreaterThan(0);
      expect(w.w > 0 && w.h > 0).toBe(true);
      expect(["normal", "maximized", "minimized"]).toContain(w.state);
      expect(Number.isInteger(w.x) && Number.isInteger(w.y)).toBe(true);
    }
    console.log("[28] capturadas:", cap.length, [...new Set(cap.map((w) => w.exe.split(/[\\/]/).pop().toLowerCase()))].join(","));

    // run_action: plano calculado e registrado, nada movido nem aberto.
    if (cap.length) {
      const before = (await layoutLines()).length;
      expect(await runAction({ type: "layout", windows: cap })).toBe("ok");
      await browser.waitUntil(async () => (await layoutLines()).length > before, { timeoutMsg: "layout não registrado no log" });
      const line = (await layoutLines()).pop();
      const m = line.match(/layout com (\d+) janelas, (\d+) encontradas \(nada foi movido\)/);
      expect(m).not.toBeNull();
      expect(Number(m[1])).toBe(cap.length);
      expect(Number(m[2])).toBeLessThanOrEqual(cap.length);
      expect(Number(m[2])).toBeGreaterThan(0);
    }
    const fake = { exe: "C:\\qa-inexistente\\qa28-nao-existe.exe", title: "QA28", x: 0, y: 0, w: 640, h: 480, state: "normal" };
    const before2 = (await layoutLines()).length;
    expect(await runAction({ type: "layout", windows: [fake], launchMissing: true })).toBe("ok");
    await browser.waitUntil(async () => (await layoutLines()).length > before2, { timeoutMsg: "layout falso não registrado" });
    expect((await layoutLines()).pop()).toContain("layout com 1 janelas, 0 encontradas (nada foi movido)");
    // Validação no Rust.
    expect(await runAction({ type: "layout", windows: [] })).toContain("1 a 20");
    expect(await runAction({ type: "layout", windows: [{ ...fake, w: 0 }] })).toContain("inválida");
    expect(await runAction({ type: "layout", windows: Array(21).fill(fake) })).toContain("1 a 20");

    // Editor (pt): layout vazio = inválido (Salvar desabilitado); capturar; tirar uma; salvar.
    await nav("Itens do menu");
    await $(".profile-picker select").selectByIndex(0);
    await $$(".tree-row:not(.is-child)")[0].click();
    await pickRadio("Executar ação");
    await $('.item-editor select:has(option[value="layout"])').selectByAttribute("value", "layout");
    await $(".item-editor").$("button*=Capturar janelas abertas agora").waitForExist();
    expect(await $(".item-editor").getText()).toContain("Nenhuma janela capturada ainda.");
    await browser.waitUntil(() => browser.execute(() => [...document.querySelectorAll(".item-editor .inline-error")].some((e) => e.textContent.includes("capture de 1 a 20"))), { timeoutMsg: "sem erro de layout vazio" });
    expect(await $("button=Salvar").isEnabled()).toBe(false);
    await (await $(".item-editor").$("button*=Capturar janelas abertas agora")).click();
    if (cap.length) {
      await browser.waitUntil(async () => (await $$(".layout-list li")).length > 0, { timeoutMsg: "lista do layout não apareceu" });
      const n = (await $$(".layout-list li")).length;
      expect(n).toBeLessThanOrEqual(20);
      await $(".item-editor").$("button*=Capturar de novo").waitForExist();
      if (n > 1) {
        await (await $$(".layout-list li button")[0]).click();
        await browser.waitUntil(async () => (await $$(".layout-list li")).length === n - 1, { timeoutMsg: "tirar do layout não funcionou" });
      }
      await (await $("label.toggle-row*=Abrir os apps que não estiverem abertos")).$("input").click();
      await save();
      const item = qaConfig().profiles[0].items.find((i) => i.action?.type === "layout");
      expect(item.action.windows.length).toBe(n > 1 ? n - 1 : n);
      expect(item.action.launchMissing).toBe(true);

      // Editor (en).
      const en = structuredClone(qaConfig());
      en.behavior.language = "en";
      await invoke("save_config", { config: en });
      await browser.refresh();
      await toWindow("settings.html");
      await browser.waitUntil(async () => (await browser.execute(() => document.documentElement.lang)) === "en", { timeoutMsg: "não abriu em inglês" });
      await (await $("button.nav-item*=Menu items")).click();
      await $(".profile-picker select").selectByIndex(0);
      await $$(".tree-row:not(.is-child)")[0].click();
      await $(".item-editor").$("button*=Capture again").waitForExist();
      const ed = await $(".item-editor").getText();
      expect(ed).toContain("Open apps that aren't running");
      expect(await runAction({ type: "layout", windows: [] })).toContain("1 to 20");
    } else {
      await browser.waitUntil(async () => (await $(".item-editor").getText()).includes("Nenhuma janela de app aberta para capturar."), { timeoutMsg: "sem aviso de nenhuma janela" });
    }

    await invoke("save_config", { config: original });
    await browser.refresh();
    await toWindow("settings.html");
  });
});
