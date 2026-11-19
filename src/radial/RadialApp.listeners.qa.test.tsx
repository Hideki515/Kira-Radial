import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cloneConfig, defaultConfig } from "../shared/defaults";
import type { Action, Config } from "../shared/types";

// Teste adicionado pelo QA (v0.25.3): depois de dividir o RadialApp em hooks (useMenuInput,
// useKnobInput, useConfirm), os ouvintes globais e os eventos do backend continuam registrados
// uma vez só — renderizar de novo (seleção, diálogo, toast) não os registra outra vez.

const ipc = vi.hoisted(() => ({
  config: null as unknown as Config,
  handlers: new Map<string, (p: unknown) => void>(),
  listens: [] as string[],
  runAction: vi.fn(async (_a: Action) => {}),
}));

vi.mock("../shared/ipc", async (orig) => {
  const real = await orig<typeof import("../shared/ipc")>();
  return {
    ...real,
    getConfig: async () => ipc.config,
    runAction: ipc.runAction,
    onEvent: async (name: string, cb: (p: unknown) => void) => {
      ipc.listens.push(name);
      ipc.handlers.set(name, cb);
      return () => ipc.handlers.delete(name);
    },
  };
});

import { RadialApp } from "./RadialApp";

const flush = () => act(async () => { for (let i = 0; i < 4; i++) await Promise.resolve(); });
const key = (k: string, extra: Partial<KeyboardEventInit> = {}) => fireEvent.keyDown(window, { key: k, ...extra });
const WATCHED = ["pointermove", "pointerup", "keydown", "wheel", "contextmenu", "blur"];

let added: string[] = [];
let now = 1000;

beforeEach(async () => {
  ipc.handlers.clear();
  ipc.listens = [];
  ipc.runAction.mockClear();
  added = [];
  const realAdd = window.addEventListener.bind(window);
  vi.spyOn(window, "addEventListener").mockImplementation(((type: string, l: EventListenerOrEventListenerObject, o?: boolean | AddEventListenerOptions) => {
    added.push(type);
    realAdd(type, l, o);
  }) as typeof window.addEventListener);
  vi.spyOn(performance, "now").mockImplementation(() => now);
  const c = cloneConfig(defaultConfig);
  c.profiles[0].items = [
    { id: "off", label: "Desligar", icon: "zap", action: { type: "system", cmd: "shutdown" } },
    { id: "vol", label: "Volume +", icon: "volume-2", action: { type: "media", cmd: "volup" } },
    { id: "grp", label: "Grupo", icon: "folder", children: [
      { id: "a", label: "A", icon: "zap", action: { type: "media", cmd: "playpause" } },
      { id: "b", label: "B", icon: "zap", action: { type: "media", cmd: "next" } },
    ] },
  ];
  ipc.config = c;
  render(<RadialApp />);
  await flush();
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const count = (list: string[]) => Object.fromEntries([...new Set(list)].map((t) => [t, list.filter((x) => x === t).length]));

describe("RadialApp › ouvintes registrados uma vez (QA v0.25.3)", () => {
  it("navegar, abrir sub-anel, diálogo de confirmação, toast e knob não registram ouvintes de novo", async () => {
    const before = count(added.filter((t) => WATCHED.includes(t)));
    const listensBefore = count(ipc.listens);
    for (const t of WATCHED) expect(before[t]).toBe(1);
    for (const e of ["menu:show", "menu:hide", "menu:release", "knob:step", "knob:press"]) expect(listensBefore[e]).toBe(1);

    // Muitas renderizações: setas, sub-anel, volta, toast de mídia, diálogo e escolhas dentro dele.
    for (let i = 0; i < 5; i++) { key("ArrowRight"); await flush(); }
    key("3", { code: "Digit3" }); await flush(); // abre o sub-anel
    key("Backspace"); await flush();
    key("2", { code: "Digit2" }); await flush(); // mídia: toast
    key("1", { code: "Digit1" }); await flush(); // diálogo de confirmação
    expect(screen.getByRole("alertdialog")).toBeTruthy();
    key("ArrowRight"); await flush();
    key("Tab"); await flush();
    act(() => ipc.handlers.get("knob:step")!(1)); await flush();
    key("Escape"); await flush();
    act(() => ipc.handlers.get("knob:step")!(1)); await flush();
    act(() => ipc.handlers.get("menu:show")!({ cx: 300, cy: 300, profileId: "default" })); await flush();
    act(() => ipc.handlers.get("menu:hide")!(null)); await flush();
    act(() => ipc.handlers.get("menu:show")!({ cx: 200, cy: 200, profileId: "default" })); await flush();

    expect(count(added.filter((t) => WATCHED.includes(t)))).toEqual(before);
    expect(count(ipc.listens)).toEqual(listensBefore);
    expect(ipc.handlers.size).toBe(Object.keys(listensBefore).length);
    // Comportamento: o diálogo foi cancelado sem executar o desligar.
    expect(ipc.runAction).not.toHaveBeenCalledWith({ type: "system", cmd: "shutdown" });
  });
});
