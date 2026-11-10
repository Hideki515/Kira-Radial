// Cenários de ponta a ponta na Kira de teste (pasta de dados de teste limpa no início).
import { invoke, nav, pickRadio, pressKey, qaConfig, qaFiles, qaState, save, toWindow } from "../helpers.mjs";

describe("Kira de teste — ponta a ponta", () => {
  it("1. Configurações abrem e mostram a versão certa", async () => {
    await toWindow("settings.html");
    const { version, qa } = await qaState();
    expect(qa).toBe(true);
    await expect($(".sidebar-foot")).toHaveText(`v${version}`);
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
});
