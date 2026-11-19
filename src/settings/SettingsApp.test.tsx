import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cloneConfig, defaultConfig } from "../shared/defaults";
import type { Config } from "../shared/types";

// Janela de Configurações: rascunho × salvo, Salvar/Descartar/Ctrl+S, erros e aviso do atalho.

const ipc = vi.hoisted(() => ({
  config: null as unknown as Config,
  hotkeyError: null as string | null,
  save: vi.fn(async (_c: unknown) => {}),
}));
vi.mock("../shared/ipc", async (orig) => {
  const real = await orig<typeof import("../shared/ipc")>();
  return {
    ...real,
    getConfig: async () => structuredClone(ipc.config),
    getHotkeyError: async () => ipc.hotkeyError,
    saveConfig: ipc.save,
  };
});

import { SettingsApp } from "./SettingsApp";

const settle = () => act(async () => { for (let i = 0; i < 4; i++) await Promise.resolve(); });
const btn = (name: RegExp) => screen.getByRole("button", { name }) as HTMLButtonElement;

async function mount(cfg: Config = cloneConfig(defaultConfig)) {
  ipc.config = cfg;
  render(<SettingsApp />);
  await settle();
}

async function renameProfile(to: string) {
  fireEvent.click(btn(/Perfis/));
  fireEvent.change(screen.getByDisplayValue(ipc.config.profiles[0].name), { target: { value: to } });
  await settle();
}

beforeEach(() => {
  ipc.hotkeyError = null;
  ipc.save.mockReset().mockResolvedValue(undefined);
});
afterEach(cleanup);

describe("SettingsApp", () => {
  it("abre com tudo salvo: Salvar e Descartar desligados", async () => {
    await mount();
    expect(screen.getByText("Tudo salvo")).toBeTruthy();
    expect(btn(/Salvar/).disabled).toBe(true);
    expect(btn(/Descartar/).disabled).toBe(true);
  });

  it("mudar algo marca 'não salvo'; Descartar volta ao salvo", async () => {
    await mount();
    await renameProfile("Trabalho");
    expect(screen.getByText("Alterações não salvas")).toBeTruthy();
    expect(screen.getByText("Pré-visualização · Trabalho")).toBeTruthy();
    fireEvent.click(btn(/Descartar/));
    await settle();
    expect(screen.getByText("Tudo salvo")).toBeTruthy();
    expect(screen.getByDisplayValue(ipc.config.profiles[0].name)).toBeTruthy();
    expect(ipc.save).not.toHaveBeenCalled();
  });

  it("Salvar grava o rascunho e avisa; depois disso está tudo salvo", async () => {
    await mount();
    await renameProfile("Trabalho");
    await act(async () => { fireEvent.click(btn(/Salvar/)); });
    await settle();
    expect(ipc.save).toHaveBeenCalledTimes(1);
    expect((ipc.save.mock.calls[0][0] as Config).profiles[0].name).toBe("Trabalho");
    expect(screen.getByText("Configurações salvas e aplicadas.")).toBeTruthy();
    expect(btn(/Salvar/).disabled).toBe(true);
  });

  it("Ctrl+S salva; sem mudança ou com erro de validação não salva", async () => {
    await mount();
    fireEvent.keyDown(window, { key: "s", ctrlKey: true });
    await settle();
    expect(ipc.save).not.toHaveBeenCalled(); // nada mudou: igual ao botão desligado
    await renameProfile("   ");
    expect(screen.getByText(/problema\(s\) impedem salvar/)).toBeTruthy();
    expect(btn(/Salvar/).disabled).toBe(true);
    fireEvent.keyDown(window, { key: "S", ctrlKey: true });
    await settle();
    expect(ipc.save).not.toHaveBeenCalled();
    fireEvent.change(screen.getByDisplayValue("   ", { normalizer: (v) => v }), { target: { value: "Casa" } });
    await settle();
    await act(async () => { fireEvent.keyDown(window, { key: "s", ctrlKey: true }); });
    await settle();
    expect(ipc.save).toHaveBeenCalledTimes(1);
  });

  it("falha ao salvar mostra o erro e mantém o rascunho", async () => {
    ipc.save.mockRejectedValueOnce("disco cheio");
    await mount();
    await renameProfile("Trabalho");
    await act(async () => { fireEvent.click(btn(/Salvar/)); });
    await settle();
    expect(screen.getByText("disco cheio")).toBeTruthy();
    expect(btn(/Salvar/).disabled).toBe(false);
    expect(screen.getByDisplayValue("Trabalho")).toBeTruthy();
  });

  it("atalho que não registrou: aviso com link para a página Atalho", async () => {
    ipc.hotkeyError = "Ctrl+Alt+Q já está em uso";
    await mount();
    expect(screen.getByRole("alert").textContent).toContain("Ctrl+Alt+Q já está em uso");
    fireEvent.click(screen.getByRole("alert").querySelector("button.link")!);
    expect(document.querySelector(".nav-item.is-on")!.textContent).toContain("Atalho");
  });

  it("página Ícone só aparece no menu lateral quando o modo usa o ícone", async () => {
    const cfg = cloneConfig(defaultConfig);
    cfg.launcher.mode = "hotkey";
    await mount(cfg);
    expect(screen.queryByRole("button", { name: /^Ícone$/ })).toBeNull();
    cleanup();
    const both = cloneConfig(defaultConfig);
    both.launcher.mode = "both";
    await mount(both);
    expect(screen.getByRole("button", { name: /^Ícone$/ })).toBeTruthy();
  });

  it("idioma: escolher English troca na hora e 'Automático' tira a chave", async () => {
    await mount();
    fireEvent.click(btn(/^Geral/));
    fireEvent.click(screen.getByRole("radio", { name: "English" }));
    await settle();
    expect(document.documentElement.lang).toBe("en");
    expect(screen.getByRole("radio", { name: "Automatic" }).getAttribute("aria-checked")).toBe("false");
    fireEvent.click(btn(/Salvar/));
    await settle();
    expect((ipc.save.mock.calls[0][0] as Config).behavior.language).toBe("en");
    fireEvent.click(screen.getByRole("radio", { name: "Automatic" }));
    await settle();
    expect(document.documentElement.lang).toBe("pt-BR");
    fireEvent.click(btn(/Salvar/));
    await settle();
    expect("language" in (ipc.save.mock.calls[1][0] as Config).behavior).toBe(false);
  });
});
