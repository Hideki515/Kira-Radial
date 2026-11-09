import { act, cleanup, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cloneConfig, defaultConfig } from "../shared/defaults";
import type { Config } from "../shared/types";

// Menu aberto pelo ícone flutuante: nasce do ícone (is-from-orb) e, ao fechar,
// recolhe para ele antes de esconder a janela. Pelo atalho, nada muda.

const ipc = vi.hoisted(() => ({
  config: null as unknown as Config,
  hideMenu: vi.fn(async () => {}),
  handlers: {} as Record<string, (p: unknown) => void>,
}));

vi.mock("../shared/ipc", async (orig) => {
  const real = await orig<typeof import("../shared/ipc")>();
  return {
    ...real,
    isTauri: () => true,
    getConfig: async () => ipc.config,
    listAudioOutputs: async () => [],
    runAction: vi.fn(async () => {}),
    hideMenu: ipc.hideMenu,
    onEvent: async (name: string, cb: (p: unknown) => void) => {
      ipc.handlers[name] = cb;
      return () => {
        if (ipc.handlers[name] === cb) delete ipc.handlers[name];
      };
    },
  };
});

vi.mock("../shared/perf", () => ({
  perfLog: () => {},
  observeLongTasks: () => {},
  startFrameMonitor: () => () => ({ durationMs: 0, frames: 0, maxGapMs: 0, janky: 0 }),
}));

import { CLOSE_TO_ORB_MS, RadialApp } from "./RadialApp";

const root = () => document.querySelector<HTMLElement>('[data-testid="radial-root"]');
const C = { x: 337.5, y: 337.5 };

async function mount() {
  ipc.config = cloneConfig(defaultConfig);
  render(<RadialApp />);
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}
const show = (extra: Record<string, unknown> = {}) =>
  act(() => ipc.handlers["menu:show"]?.({ profileId: "default", cx: C.x, cy: C.y, ...extra }));
const esc = () => act(() => void window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true })));

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
  ipc.hideMenu.mockClear();
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("RadialApp › aberto pelo ícone", () => {
  it("nasce do ícone: classe is-from-orb com deslocamento e escala do ícone", async () => {
    await mount();
    show({ originX: 337.5 + 100, originY: 337.5 - 40 });
    const r = root()!;
    expect(r.classList.contains("is-from-orb")).toBe(true);
    expect(r.style.getPropertyValue("--from-x")).toBe("100px");
    expect(r.style.getPropertyValue("--from-y")).toBe("-40px");
    const s = Number(r.style.getPropertyValue("--from-s"));
    expect(s).toBeCloseTo(defaultConfig.launcher.orb.size / (900 * defaultConfig.appearance.scale), 5);
    // fatias recebem o índice para a sequência horária
    const slices = r.querySelectorAll<SVGGElement>('[data-testid="main-slice"]');
    expect(slices[2].style.getPropertyValue("--i")).toBe("2");
  });

  it("Esc recolhe para o ícone e só depois esconde a janela", async () => {
    await mount();
    show({ originX: 400, originY: 400 });
    esc();
    expect(root()!.classList.contains("is-closing")).toBe(true);
    expect(ipc.hideMenu).not.toHaveBeenCalled();
    act(() => void vi.advanceTimersByTime(CLOSE_TO_ORB_MS));
    expect(ipc.hideMenu).toHaveBeenCalledTimes(1);
    expect(root()).toBeNull();
  });

  it("reabrir durante o recolhimento cancela o fechamento", async () => {
    await mount();
    show({ originX: 400, originY: 400 });
    esc();
    show({ originX: 400, originY: 400 });
    act(() => void vi.advanceTimersByTime(CLOSE_TO_ORB_MS * 2));
    expect(ipc.hideMenu).not.toHaveBeenCalled();
    expect(root()!.classList.contains("is-closing")).toBe(false);
  });

  it("desmontar durante o recolhimento não deixa timer pendente nem chama hideMenu depois", async () => {
    await mount();
    show({ originX: 400, originY: 400 });
    esc();
    cleanup();
    expect(vi.getTimerCount()).toBe(0);
    act(() => void vi.advanceTimersByTime(CLOSE_TO_ORB_MS * 2));
    expect(ipc.hideMenu).not.toHaveBeenCalled();
  });

  it("pelo atalho (sem origem) abre e fecha como antes, sem animação de ícone", async () => {
    await mount();
    show({ originX: null, originY: null });
    expect(root()!.classList.contains("is-from-orb")).toBe(false);
    esc();
    expect(ipc.hideMenu).toHaveBeenCalledTimes(1);
    expect(root()).toBeNull();
  });
});
