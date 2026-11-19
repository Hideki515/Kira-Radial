import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cloneConfig, defaultConfig } from "../shared/defaults";
import type { Config, MenuItem } from "../shared/types";

// QA v0.27.0: atalho global por fatia nas Configurações (DOM, sem teclado do Windows).
// Gravar pelo campo, "A" sozinho bloqueia salvar com a mensagem, selo na lista, pausa do atalho global.

const ipc = vi.hoisted(() => ({
  config: null as unknown as Config,
  save: vi.fn(async (_c: unknown) => {}),
  paused: vi.fn(async (_p: boolean) => {}),
}));
vi.mock("../shared/ipc", async (orig) => {
  const real = await orig<typeof import("../shared/ipc")>();
  return {
    ...real,
    getConfig: async () => structuredClone(ipc.config),
    getHotkeyError: async () => null,
    getHotkeysError: async () => null,
    saveConfig: ipc.save,
    setHotkeyPaused: ipc.paused,
  };
});

import { SettingsApp } from "./SettingsApp";

const settle = () => act(async () => { for (let i = 0; i < 4; i++) await Promise.resolve(); });
const open = (id: string): MenuItem => ({ id, label: id, icon: "code", action: { type: "openSettings" } });

async function mount() {
  const c = cloneConfig(defaultConfig);
  c.hotkey.accelerator = "Ctrl+Alt+Q";
  c.launcher.mode = "hotkey";
  c.profiles[0].items = [open("Alfa"), open("Beta"), open("Gama")];
  ipc.config = c;
  render(<SettingsApp />);
  await settle();
}

function record(init: KeyboardEventInit & { key: string; code: string }) {
  expect(screen.getByText("Atalho global (opcional)")).toBeTruthy();
  const boxes = screen.getAllByRole("button", { name: "Gravar atalho" });
  expect(boxes).toHaveLength(1); // na página Itens, só o campo da fatia
  const box = boxes[0];
  fireEvent.focus(box);
  fireEvent.keyDown(box, init);
  fireEvent.blur(box);
}

beforeEach(() => {
  ipc.save.mockReset().mockResolvedValue(undefined);
  ipc.paused.mockClear();
});
afterEach(cleanup);

describe("QA v0.27.0 atalho de fatia nas Configurações", () => {
  it("gravar Ctrl+Alt+K: pausa o atalho global durante a gravação, mostra o selo e salva", async () => {
    await mount();
    record({ key: "k", code: "KeyK", ctrlKey: true, altKey: true });
    await settle();
    expect(ipc.paused.mock.calls.map((c) => c[0])).toEqual([true, false]);
    expect(document.querySelector(".tree-hotkey")?.textContent).toBe("Ctrl+Alt+K");
    const save = screen.getByRole("button", { name: /Salvar/ }) as HTMLButtonElement;
    expect(save.disabled).toBe(false);
    fireEvent.click(save);
    await settle();
    expect(ipc.save).toHaveBeenCalledTimes(1);
    expect((ipc.save.mock.calls[0][0] as Config).profiles[0].items[0].hotkey).toBe("Ctrl+Alt+K");
  });

  it("'A' sozinho bloqueia salvar com a mensagem; remover o atalho libera", async () => {
    await mount();
    record({ key: "a", code: "KeyA" });
    await settle();
    expect(document.querySelector(".tree-hotkey")?.textContent).toBe("A");
    const save = screen.getByRole("button", { name: /Salvar/ }) as HTMLButtonElement;
    expect(save.disabled).toBe(true);
    expect(screen.getByText(/problema\(s\) impedem salvar/)).toBeTruthy();
    expect(screen.getByText(/Atalho de "Alfa": "A" inválido/)).toBeTruthy();
    fireEvent.keyDown(window, { key: "s", code: "KeyS", ctrlKey: true });
    await settle();
    expect(ipc.save).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Remover atalho" }));
    await settle();
    expect(document.querySelector(".tree-hotkey")).toBeNull();
    expect(screen.queryByText(/impedem salvar/)).toBeNull();
  });
});
