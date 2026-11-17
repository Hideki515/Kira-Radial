import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cloneConfig, defaultConfig } from "../shared/defaults";
import type { Action, Config } from "../shared/types";

// Desligar/reiniciar/encerrar sessão pedem confirmação num diálogo próprio (não window.confirm).

const ipc = vi.hoisted(() => ({
  config: null as unknown as Config,
  handlers: new Map<string, (p: unknown) => void>(),
  runAction: vi.fn(async (_a: Action) => {}),
}));

vi.mock("../shared/ipc", async (orig) => {
  const real = await orig<typeof import("../shared/ipc")>();
  return {
    ...real,
    getConfig: async () => ipc.config,
    runAction: ipc.runAction,
    onEvent: async (name: string, cb: (p: unknown) => void) => {
      ipc.handlers.set(name, cb);
      return () => ipc.handlers.delete(name);
    },
  };
});

import { RadialApp } from "./RadialApp";

const flush = () => act(async () => { for (let i = 0; i < 4; i++) await Promise.resolve(); });
const key = (k: string, extra: Partial<KeyboardEventInit> = {}) => fireEvent.keyDown(window, { key: k, ...extra });
const SHUTDOWN: Action = { type: "system", cmd: "shutdown" };

beforeEach(async () => {
  ipc.handlers.clear();
  ipc.runAction.mockClear();
  const c = cloneConfig(defaultConfig);
  c.profiles[0].items = [
    { id: "off", label: "Desligar", icon: "zap", action: SHUTDOWN },
    { id: "rst", label: "Reiniciar", icon: "zap", action: { type: "system", cmd: "restart" } },
    { id: "lock", label: "Bloquear", icon: "lock", action: { type: "system", cmd: "lock" } },
  ];
  ipc.config = c;
  vi.spyOn(window, "confirm");
  now = 1000;
  vi.spyOn(performance, "now").mockImplementation(() => now);
  render(<RadialApp />);
  await flush();
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

/** Escolhe a fatia e espera a pausa de segurança do diálogo passar. */
const choose = async (digit: string, wait = true) => {
  key(digit, { code: `Digit${digit}` });
  await flush();
  if (wait) now += 500;
};
let now = 0;

describe("confirmação de desligar/reiniciar", () => {
  it("abre o diálogo (sem window.confirm) e só desliga ao clicar em Desligar", async () => {
    await choose("1");
    expect(window.confirm).not.toHaveBeenCalled();
    expect(ipc.runAction).not.toHaveBeenCalled();
    const dlg = screen.getByRole("alertdialog");
    expect(dlg.textContent).toContain("Tem certeza que deseja desligar o computador?");
    fireEvent.click(screen.getByRole("button", { name: "Desligar" }));
    await flush();
    expect(ipc.runAction).toHaveBeenCalledWith(SHUTDOWN);
    expect(screen.queryByRole("alertdialog")).toBeNull();
  });

  it("Cancelar, Esc e clique fora fecham sem agir", async () => {
    await choose("1");
    fireEvent.click(screen.getByRole("button", { name: "Cancelar" }));
    expect(screen.queryByRole("alertdialog")).toBeNull();
    await choose("2");
    expect(screen.getByRole("alertdialog").textContent).toContain("reiniciar");
    key("Escape");
    expect(screen.queryByRole("alertdialog")).toBeNull();
    await choose("1");
    fireEvent.pointerDown(screen.getByTestId("confirm-backdrop"));
    expect(screen.queryByRole("alertdialog")).toBeNull();
    expect(ipc.runAction).not.toHaveBeenCalled();
  });

  it("teclado: Enter confirma o destacado (Desligar), setas trocam para Cancelar; Enter segurado não confirma", async () => {
    await choose("1");
    key("Enter", { repeat: true });
    expect(ipc.runAction).not.toHaveBeenCalled();
    key("ArrowRight");
    expect(screen.getByRole("button", { name: "Cancelar" }).className).toContain("is-selected");
    key("Enter");
    expect(screen.queryByRole("alertdialog")).toBeNull();
    expect(ipc.runAction).not.toHaveBeenCalled();
    await choose("1");
    expect(screen.getByRole("button", { name: "Desligar" }).className).toContain("is-selected");
    key("Enter");
    await flush();
    expect(ipc.runAction).toHaveBeenCalledWith(SHUTDOWN);
  });

  it("knob: girar troca o botão, apertar escolhe", async () => {
    await choose("1");
    await act(async () => ipc.handlers.get("knob:step")!(1));
    await act(async () => ipc.handlers.get("knob:press")!(null));
    expect(screen.queryByRole("alertdialog")).toBeNull();
    expect(ipc.runAction).not.toHaveBeenCalled();
    await choose("1");
    await act(async () => ipc.handlers.get("knob:press")!(null));
    await flush();
    expect(ipc.runAction).toHaveBeenCalledWith(SHUTDOWN);
  });

  it("com o diálogo aberto, o menu não reage (outras teclas, soltar o atalho)", async () => {
    await choose("1");
    await choose("3");
    await act(async () => ipc.handlers.get("menu:release")!(null));
    expect(ipc.runAction).not.toHaveBeenCalled();
    expect(screen.getByRole("alertdialog")).toBeTruthy();
  });

  it("duplo clique / Enter apressado: confirmar logo depois de abrir é ignorado", async () => {
    await choose("1", false);
    fireEvent.click(screen.getByRole("button", { name: "Desligar" }));
    key("Enter");
    await act(async () => ipc.handlers.get("knob:press")!(null));
    await flush();
    expect(ipc.runAction).not.toHaveBeenCalled();
    expect(screen.getByRole("alertdialog")).toBeTruthy();
    now += 450;
    fireEvent.click(screen.getByRole("button", { name: "Desligar" }));
    await flush();
    expect(ipc.runAction).toHaveBeenCalledWith(SHUTDOWN);
  });

  it("ponteiro parado em cima do Cancelar não muda o destaque; mover muda; setas seguem a direção", async () => {
    await choose("1");
    const cancel = screen.getByRole("button", { name: "Cancelar" });
    fireEvent.pointerEnter(cancel);
    expect(screen.getByRole("button", { name: "Desligar" }).className).toContain("is-selected");
    fireEvent.pointerMove(cancel);
    expect(cancel.className).toContain("is-selected");
    key("ArrowRight");
    expect(cancel.className).toContain("is-selected");
    key("ArrowLeft");
    expect(screen.getByRole("button", { name: "Desligar" }).className).toContain("is-selected");
  });

  it("comandos sem risco (bloquear) não pedem confirmação", async () => {
    await choose("3");
    expect(screen.queryByRole("alertdialog")).toBeNull();
    expect(ipc.runAction).toHaveBeenCalledWith({ type: "system", cmd: "lock" });
  });
});
