import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cloneConfig, defaultConfig } from "../shared/defaults";
import type { Action, Config } from "../shared/types";

// Teste adicionado pelo QA (v0.28.0): a busca por digitação não muda o menu sem busca
// (espaço = Enter, 1–9 escolhem, Esc/Backspace antigos), números/espaço só entram depois de
// começar, fatias vazias não executam, reabrir limpa a busca e o índice não é refeito por abertura.

const ipc = vi.hoisted(() => ({
  config: null as unknown as Config,
  handlers: new Map<string, (p: unknown) => void>(),
  runAction: vi.fn(async (_a: Action) => {}),
}));

vi.mock("../shared/ipc", async (orig) => ({
  ...(await orig<typeof import("../shared/ipc")>()),
  getConfig: async () => ipc.config,
  runAction: ipc.runAction,
  onEvent: async (name: string, cb: (p: unknown) => void) => {
    ipc.handlers.set(name, cb);
    return () => ipc.handlers.delete(name);
  },
}));

const spy = vi.hoisted(() => ({ buildIndex: 0 }));
vi.mock("./search", async (orig) => {
  const real = await orig<typeof import("./search")>();
  return { ...real, buildIndex: (...a: Parameters<typeof real.buildIndex>) => { spy.buildIndex++; return real.buildIndex(...a); } };
});

import { RadialApp } from "./RadialApp";

const flush = () => act(async () => { for (let i = 0; i < 4; i++) await Promise.resolve(); });
const key = (k: string) =>
  fireEvent.keyDown(window, { key: k, code: /^\d$/.test(k) ? `Digit${k}` : k === " " ? "Space" : k.length === 1 ? `Key${k.toUpperCase()}` : k });
const hub = () => screen.queryByTestId("hub-search");
const submenu = () => document.querySelector('[data-testid="submenu"]');
const root = () => document.querySelector(".radial-root");
const labels = () => [...document.querySelectorAll(".main-slice")].map((s) => s.getAttribute("aria-label"));

const TERM: Action = { type: "launch", path: "wt.exe" };

beforeEach(async () => {
  ipc.handlers.clear();
  ipc.runAction.mockClear();
  spy.buildIndex = 0;
  const c = cloneConfig(defaultConfig);
  c.profiles = [{
    id: "default",
    name: "Padrão",
    items: [
      { id: "grp", label: "Grupo", icon: "folder", children: [
        { id: "a", label: "Alfa 1", icon: "zap", action: { type: "openSettings" } },
        { id: "b", label: "Beta", icon: "zap", action: { type: "openSettings" } },
      ] },
      { id: "term", label: "Terminal", icon: "code", action: TERM },
      { id: "cfg", label: "Configurar", icon: "code", action: { type: "openSettings" } },
    ],
  }];
  ipc.config = c;
  render(<RadialApp />);
  await flush();
});
afterEach(cleanup);

describe("busca › sem regressão no menu sem busca (QA v0.28.0)", () => {
  it("espaço sem busca age como Enter (abre o sub-anel da fatia destacada) e não começa busca", async () => {
    key("ArrowRight"); // destaca "Grupo"
    key(" ");
    expect(hub()).toBeNull();
    expect(submenu()).not.toBeNull();
    key(" "); // Enter no sub-anel sem subitem escolhido escolhe o 1º
    key(" "); // executa
    await flush();
    expect(ipc.runAction).toHaveBeenCalledWith({ type: "openSettings" });
    expect(hub()).toBeNull();
  });

  it("1–9 sem busca escolhem a fatia e não começam busca; Esc vazio fecha o menu", async () => {
    key("1");
    expect(hub()).toBeNull();
    expect(submenu()).not.toBeNull();
    key("Backspace"); // busca vazia: Backspace volta ao principal, como antes
    expect(submenu()).toBeNull();
    expect(root()).not.toBeNull();
    key("Escape");
    expect(root()).toBeNull();
  });

  it("depois de começar, números e espaço entram no texto; Backspace apaga um de cada vez", async () => {
    key("a");
    key("l");
    key(" ");
    key("1");
    expect(hub()!.textContent).toContain("al 1");
    expect(ipc.runAction).not.toHaveBeenCalled();
    key("Backspace");
    key("Backspace");
    expect(hub()!.textContent).toContain("al");
    key("Backspace");
    key("Backspace");
    expect(hub()).toBeNull();
    expect(root()).not.toBeNull(); // apagar até o fim não fecha o menu
  });

  it("digitar com o sub-anel aberto fecha o sub-anel e filtra; Ctrl+letra não entra na busca", async () => {
    key("1");
    expect(submenu()).not.toBeNull();
    fireEvent.keyDown(window, { key: "t", code: "KeyT", ctrlKey: true });
    expect(hub()).toBeNull();
    key("t");
    expect(submenu()).toBeNull();
    expect(labels()[0]).toBe("Terminal");
  });

  it("fatia vazia (completa até 3) não executa; Enter no 1º executa", async () => {
    for (const k of "termi") key(k);
    expect(labels()).toEqual(["Terminal", "", ""]);
    key("ArrowRight");
    key("Enter");
    await flush();
    expect(ipc.runAction).not.toHaveBeenCalled();
    key("ArrowLeft");
    key("Enter");
    await flush();
    expect(ipc.runAction).toHaveBeenCalledWith(TERM);
  });

  it("soltar o atalho (modo segurar) executa o resultado escolhido", async () => {
    for (const k of "conf") key(k);
    await act(async () => ipc.handlers.get("menu:release")!(null));
    await flush();
    expect(ipc.runAction).toHaveBeenCalledWith({ type: "openSettings" });
  });

  it("reabrir o menu limpa a busca e não refaz o índice", async () => {
    const built = spy.buildIndex;
    expect(built).toBeGreaterThan(0);
    key("t");
    expect(hub()).not.toBeNull();
    for (let i = 0; i < 3; i++) {
      act(() => ipc.handlers.get("menu:hide")!(null)); await flush();
      act(() => ipc.handlers.get("menu:show")!({ cx: 300, cy: 300, profileId: "default" })); await flush();
      expect(hub()).toBeNull();
      expect(labels()).toEqual(["Grupo", "Terminal", "Configurar"]);
    }
    expect(spy.buildIndex).toBe(built);
  });
});
