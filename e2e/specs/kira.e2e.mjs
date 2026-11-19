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
});
