import { act, cleanup, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cloneConfig, defaultConfig } from "../shared/defaults";
import type { Action, Config } from "../shared/types";
import { aimTarget, nearest } from "./useGamepadInput";

// Controle de videogame (v0.45.0): gamepad:aim aponta, knob:press (A) escolhe, gamepad:back (B) volta.

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

describe("controle de videogame no menu aberto (v0.45.0)", () => {
  it("o analógico aponta a fatia pelo ângulo e A executa", async () => {
    expect(ipc.handlers.has("gamepad:aim") && ipc.handlers.has("gamepad:back") && ipc.handlers.has("gamepad:close")).toBe(true);
    await emit("gamepad:aim", 150); // C (embaixo à esquerda)
    expect(activeLabel()).toBe("C");
    await emit("gamepad:aim", 275); // A (topo)
    expect(activeLabel()).toBe("A");
    await emit("knob:press");
    expect(ipc.runAction).toHaveBeenCalledWith({ type: "media", cmd: "playpause" });
  });

  it("no sub-anel o analógico escolhe o subitem; B volta e, no anel principal, fecha", async () => {
    await emit("gamepad:aim", 30); // B
    await emit("knob:press"); // abre o sub-anel
    expect(document.querySelectorAll(".sub-slice").length).toBe(2);
    await emit("gamepad:aim", 50); // lado do B2
    expect(document.querySelector(".sub-slice.is-active")?.getAttribute("aria-label")).toBe("B2");
    await emit("gamepad:back");
    expect(document.querySelectorAll(".sub-slice").length).toBe(0);
    expect(ipc.runAction).not.toHaveBeenCalled();
    await emit("gamepad:back"); // fecha o menu
    await emit("gamepad:aim", 150); // fechado: ignora
    expect(document.querySelector(".main-slice.is-active")).toBeNull();
  });
});

describe("contas do controle (puras)", () => {
  it("nearest dá a volta em 360° e lista vazia = null", () => {
    expect(nearest([-90, 30, 150], 300)).toBe(0); // 300° fica a 30° de -90°
    expect(nearest([-90, 30, 150], 355)).toBe(1);
    expect(nearest([-90, 30, 150], 100)).toBe(2);
    expect(nearest([], 10)).toBeNull();
  });

  it("aimTarget: anel principal, sub-anel aberto e menu vazio", () => {
    expect(aimTarget({ openMain: null, mainCount: 4, subCount: 0 }, 0)).toEqual({ activeMain: 1, activeSub: null });
    expect(aimTarget({ openMain: 1, mainCount: 4, subCount: 3 }, 0)).toEqual({ activeMain: 1, activeSub: 1 });
    expect(aimTarget({ openMain: null, mainCount: 0, subCount: 0 }, 0)).toBeNull();
  });
});
