import { act, cleanup, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cloneConfig, defaultConfig } from "../shared/defaults";
import type { Action, Config } from "../shared/types";
import { knobPress, knobStep, type RingState } from "./navigation";

// Knob (controle dedicado): os eventos knob:step / knob:press do backend movem a seleção e executam.

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
const emit = (name: string, p: unknown = null) => act(async () => ipc.handlers.get(name)!(p));

function cfg(): Config {
  const c = cloneConfig(defaultConfig);
  c.profiles[0].items = [
    { id: "a", label: "A", icon: "play", action: { type: "media", cmd: "playpause" } },
    {
      id: "b",
      label: "B",
      icon: "music",
      children: [
        { id: "b1", label: "B1", icon: "play", action: { type: "media", cmd: "next" } },
        { id: "b2", label: "B2", icon: "play", action: { type: "media", cmd: "prev" } },
      ],
    },
    { id: "c", label: "C", icon: "lock", action: { type: "system", cmd: "lock" } },
  ];
  return c;
}

const activeLabel = () => document.querySelector(".main-slice.is-active, .sub-slice.is-active")?.getAttribute("aria-label") ?? null;

beforeEach(async () => {
  ipc.handlers.clear();
  ipc.runAction.mockClear();
  ipc.config = cfg();
  render(<RadialApp />);
  await flush();
});
afterEach(cleanup);

describe("knob no menu aberto", () => {
  it("girar passa as fatias e apertar executa a escolhida", async () => {
    expect(ipc.handlers.has("knob:step") && ipc.handlers.has("knob:press")).toBe(true);
    await emit("knob:step", 1);
    await emit("knob:step", 1);
    await emit("knob:step", 1);
    await emit("knob:press");
    expect(ipc.runAction).toHaveBeenCalledWith({ type: "system", cmd: "lock" });
  });

  it("apertar numa fatia com submenu abre o sub-anel; girar até Voltar e apertar volta", async () => {
    await emit("knob:step", -1);
    await emit("knob:step", -1); // C → B
    await emit("knob:press"); // abre o sub-anel em B1
    expect(document.querySelectorAll(".sub-slice").length).toBe(2);
    await emit("knob:step", 1); // B2
    await emit("knob:step", 1); // Voltar (centro)
    await emit("knob:press");
    expect(document.querySelectorAll(".sub-slice").length).toBe(0);
    expect(ipc.runAction).not.toHaveBeenCalled();
    await emit("knob:press"); // abre de novo, B1 escolhido
    await emit("knob:press");
    expect(ipc.runAction).toHaveBeenCalledWith({ type: "media", cmd: "next" });
  });

  it("apertar sem fatia escolhida fecha sem executar", async () => {
    expect(activeLabel()).toBeNull();
    await emit("knob:press");
    expect(ipc.runAction).not.toHaveBeenCalled();
  });
});

describe("contas do knob (puras)", () => {
  const ring = (p: Partial<RingState>): RingState => ({ openMain: null, activeMain: null, activeSub: null, mainCount: 3, subCount: 0, ...p });

  it("anel principal: começa na primeira/última e dá a volta", () => {
    expect(knobStep(ring({}), 1)).toEqual({ activeMain: 0, activeSub: null });
    expect(knobStep(ring({}), -1)).toEqual({ activeMain: 2, activeSub: null });
    expect(knobStep(ring({ activeMain: 2 }), 1)).toEqual({ activeMain: 0, activeSub: null });
    expect(knobStep(ring({ mainCount: 0 }), 1)).toEqual({ activeMain: null, activeSub: null });
  });

  it("sub-anel tem a posição Voltar (null) entre o último e o primeiro", () => {
    const sub = ring({ openMain: 1, activeMain: 1, subCount: 2 });
    expect(knobStep({ ...sub, activeSub: null }, 1).activeSub).toBe(0);
    expect(knobStep({ ...sub, activeSub: 1 }, 1).activeSub).toBeNull();
    expect(knobStep({ ...sub, activeSub: null }, -1).activeSub).toBe(1);
    expect(knobStep({ ...sub, activeSub: 0 }, -1).activeSub).toBeNull();
  });

  it("apertar: fechar, voltar, abrir submenu ou executar", () => {
    expect(knobPress(ring({}), false)).toEqual({ kind: "close" });
    expect(knobPress(ring({ activeMain: 1 }), true)).toEqual({ kind: "openSub", index: 1 });
    expect(knobPress(ring({ activeMain: 0 }), false)).toEqual({ kind: "execute" });
    expect(knobPress(ring({ openMain: 1, activeMain: 1, subCount: 2 }), false)).toEqual({ kind: "back" });
    expect(knobPress(ring({ openMain: 1, activeMain: 1, subCount: 2, activeSub: 0 }), false)).toEqual({ kind: "execute" });
  });
});
