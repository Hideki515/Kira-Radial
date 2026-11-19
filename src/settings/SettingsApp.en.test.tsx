import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cloneConfig, defaultConfig } from "../shared/defaults";
import type { Config } from "../shared/types";

// Configurações em inglês: nenhuma página pode sobrar com texto em português.

const ipc = vi.hoisted(() => ({ config: null as unknown as Config }));
vi.mock("../shared/ipc", async (orig) => ({
  ...(await orig<typeof import("../shared/ipc")>()),
  getConfig: async () => structuredClone(ipc.config),
  getHotkeyError: async () => null,
  saveConfig: async () => {},
}));

import { SettingsApp } from "./SettingsApp";

const settle = () => act(async () => { for (let i = 0; i < 6; i++) await Promise.resolve(); });

/** Letras que só aparecem no português (o inglês não usa acentos). */
const PT_MARKS = /[ãõçáéíóúâêôà]/i;

/** Texto visível de uma área, sem o seletor de idioma (que mostra "Português" de propósito). */
function visibleText(el: Element): string {
  const clone = el.cloneNode(true) as Element;
  // Miniaturas dos temas desenham as fatias do usuário (nomes em português na config padrão).
  clone.querySelectorAll('[aria-label="Idioma / Language"], option, input, textarea, .theme-thumb').forEach((n) => n.remove());
  // Atributos lidos por leitor de tela também contam.
  const attrs = [...el.querySelectorAll("[title],[aria-label],[placeholder]")]
    .filter((n) => !n.closest(".theme-thumb"))
    .flatMap((n) => ["title", "aria-label", "placeholder"].map((a) => n.getAttribute(a) ?? ""))
    .filter((a) => a !== "Idioma / Language");
  return [clone.textContent ?? "", ...attrs].join(" | ");
}

afterEach(cleanup);

describe("Configurações em inglês", () => {
  it("todas as páginas (e a moldura) sem português", async () => {
    const cfg = cloneConfig(defaultConfig);
    cfg.behavior.language = "en";
    cfg.launcher.mode = "both"; // mostra a página Ícone
    cfg.profiles[0].name = "Default"; // nome do perfil é do usuário
    ipc.config = cfg;
    render(<SettingsApp />);
    await settle();

    const pages = ["Shortcut", "Icon", "Profiles", "General", "Appearance", "Backup", "Discord", "Diagnostics", "Menu items"];
    for (const name of pages) {
      fireEvent.click(screen.getByRole("button", { name: new RegExp(`^ ?${name}$`) }));
      await settle();
      const main = document.querySelector("main.content")!;
      // Na página Itens, os nomes das fatias são do usuário (a config padrão vem em português).
      const area = name === "Menu items" ? main.querySelector(".item-editor")! : main;
      const text = visibleText(area);
      expect(text.match(PT_MARKS) ? `${name}: ${text}` : "", name).toBe("");
    }
    const frame = [document.querySelector(".sidebar")!, document.querySelector(".savebar")!, document.querySelector(".preview-hotkey")!];
    for (const el of frame) expect(visibleText(el)).not.toMatch(PT_MARKS);
    expect(screen.getByText("All saved")).toBeTruthy();
    // Data do centro do menu (pré-visualização) também no idioma: sem "QUI., 19 DE NOV.".
    expect(document.querySelector(".preview .hub-date")?.textContent ?? "").not.toMatch(PT_MARKS);
  });

  it("os textos de ações e opções seguem o idioma", async () => {
    const cfg = cloneConfig(defaultConfig);
    cfg.behavior.language = "en";
    ipc.config = cfg;
    render(<SettingsApp />);
    await settle();
    const opts = [...document.querySelectorAll(".action-editor select option")].map((o) => o.textContent ?? "");
    expect(opts).toContain("Open program / file");
    expect(opts.join(" ")).not.toMatch(PT_MARKS);
  });
});
