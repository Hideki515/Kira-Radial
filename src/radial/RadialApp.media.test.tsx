import { act, cleanup, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cloneConfig, defaultConfig } from "../shared/defaults";
import type { Config } from "../shared/types";
import { LAYOUT, polar, sliceAngle, submenuAngles } from "./geometry";

// Teste adicionado pelo QA: ações de mídia não fecham o menu (no Tauri) — cliques repetidos executam
// de novo, a seleção permanece e aparece um toast com o rótulo da mídia. Demais ações não mostram toast.

const ipc = vi.hoisted(() => ({
  config: null as unknown as Config,
  runAction: vi.fn(async () => {}),
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
    runAction: ipc.runAction,
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

import { RadialApp, TOAST_MS } from "./RadialApp";

const cfg = () => cloneConfig(defaultConfig);
const items = () => cfg().profiles[0].items;
const idx = (id: string) => items().findIndex((i) => i.id === id);
const n = () => items().length;
const scale = () => defaultConfig.appearance.scale;
const center = () => ({ x: Math.round(window.innerWidth / 2), y: Math.round(window.innerHeight / 2) });

function mainPoint(i: number) {
  const p = polar(0, 0, ((LAYOUT.mainInner + LAYOUT.mainOuter) / 2) * scale(), sliceAngle(i, n()));
  return { x: center().x + p.x, y: center().y + p.y };
}
function subPoint(parent: number, k: number) {
  const count = items()[parent].children!.length;
  const a = submenuAngles(sliceAngle(parent, n()), count)[k];
  const p = polar(0, 0, ((LAYOUT.subInner + LAYOUT.subOuter) / 2) * scale(), a);
  return { x: center().x + p.x, y: center().y + p.y };
}
function ptr(type: "pointermove" | "pointerup", pt: { x: number; y: number }) {
  act(() => {
    window.dispatchEvent(new MouseEvent(type, { clientX: pt.x, clientY: pt.y, button: 0, bubbles: true }));
  });
}
const click = async (pt: { x: number; y: number }) => {
  ptr("pointermove", pt);
  ptr("pointerup", pt);
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
};

const root = () => document.querySelector(".radial-root");
const submenu = () => document.querySelector('[data-testid="submenu"]');
const toast = () => document.querySelector(".toast")?.textContent ?? null;
const activeSubLabel = () => document.querySelector(".sub-slice.is-active")?.getAttribute("aria-label") ?? null;

async function mountAndShow() {
  ipc.config = cfg();
  render(<RadialApp />);
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
  expect(root()).toBeNull(); // no Tauri começa escondido
  act(() => ipc.handlers["menu:show"]?.({ profileId: ipc.config.profiles[0].id, cx: center().x, cy: center().y }));
  expect(root()).not.toBeNull();
}

beforeEach(() => {
  ipc.runAction.mockClear();
  ipc.hideMenu.mockClear();
});
afterEach(cleanup);

describe("RadialApp › mídia mantém o menu aberto (Tauri)", () => {
  it("clique em volume + executa, mantém menu/sub-anel/seleção e mostra toast; segundo clique executa de novo", async () => {
    await mountAndShow();
    const midia = idx("midia");
    const k = items()[midia].children!.findIndex((c) => c.id === "volup");
    const volup = items()[midia].children![k];
    await click(mainPoint(midia));
    expect(submenu()).not.toBeNull();

    await click(subPoint(midia, k));
    expect(ipc.runAction).toHaveBeenCalledTimes(1);
    expect(ipc.runAction).toHaveBeenLastCalledWith({ type: "media", cmd: "volup" });
    expect(root()).not.toBeNull();
    expect(submenu()).not.toBeNull();
    expect(activeSubLabel()).toBe(volup.label);
    expect(toast()).toBe(`${volup.label}: volume +`);
    expect(ipc.hideMenu).not.toHaveBeenCalled();

    await click(subPoint(midia, k));
    expect(ipc.runAction).toHaveBeenCalledTimes(2);
    expect(root()).not.toBeNull();
    expect(ipc.hideMenu).not.toHaveBeenCalled();
  });

  it("Enter repetido num item de mídia também executa várias vezes sem fechar", async () => {
    await mountAndShow();
    const midia = idx("midia");
    await click(mainPoint(midia));
    const k = items()[midia].children!.findIndex((c) => c.id === "next");
    await click(subPoint(midia, k));
    for (let i = 0; i < 2; i++) {
      act(() => {
        window.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
      });
      await act(async () => {
        await Promise.resolve();
      });
    }
    expect(ipc.runAction).toHaveBeenCalledTimes(3);
    expect(root()).not.toBeNull();
    expect(toast()).toContain("próxima faixa");
  });

  it("ação que não é mídia não mostra toast no Tauri (o backend esconde o menu)", async () => {
    await mountAndShow();
    await click(mainPoint(idx("browser")));
    expect(ipc.runAction).toHaveBeenCalledWith(items()[idx("browser")].action);
    expect(toast()).toBeNull();
  });

  it("modo segurar: soltar o atalho depois de clicar na mídia só fecha, não repete", async () => {
    await mountAndShow();
    const midia = idx("midia");
    const k = items()[midia].children!.findIndex((c) => c.id === "volup");
    await click(mainPoint(midia));
    await click(subPoint(midia, k));
    expect(ipc.runAction).toHaveBeenCalledTimes(1);
    act(() => ipc.handlers["menu:release"]?.(null));
    await act(async () => {
      await Promise.resolve();
    });
    expect(ipc.runAction).toHaveBeenCalledTimes(1);
    expect(ipc.hideMenu).toHaveBeenCalledTimes(1);
  });

  it("modo segurar: soltar sobre um item NÃO clicado continua executando", async () => {
    await mountAndShow();
    const midia = idx("midia");
    const k = items()[midia].children!.findIndex((c) => c.id === "next");
    await click(mainPoint(midia));
    ptr("pointermove", subPoint(midia, k));
    act(() => ipc.handlers["menu:release"]?.(null));
    await act(async () => {
      await Promise.resolve();
    });
    expect(ipc.runAction).toHaveBeenCalledWith({ type: "media", cmd: "next" });
  });

  it("toast fica TOAST_MS após o ÚLTIMO clique, não o primeiro", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    try {
      await mountAndShow();
      const midia = idx("midia");
      const k = items()[midia].children!.findIndex((c) => c.id === "volup");
      await click(mainPoint(midia));
      await click(subPoint(midia, k));
      act(() => void vi.advanceTimersByTime(TOAST_MS - 400));
      await click(subPoint(midia, k));
      act(() => void vi.advanceTimersByTime(TOAST_MS - 400));
      expect(toast()).not.toBeNull(); // 1º clique já passou de TOAST_MS, mas o 2º renovou
      act(() => void vi.advanceTimersByTime(500));
      expect(toast()).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });
});

const key = (code: string, extra: KeyboardEventInit = {}) =>
  act(() => void window.dispatchEvent(new KeyboardEvent("keydown", { code, key: code.slice(-1), bubbles: true, ...extra })));
const settle = () => act(async () => { await Promise.resolve(); await Promise.resolve(); });

describe("RadialApp › teclas 1–9", () => {
  it("número de fatia com ação executa direto", async () => {
    await mountAndShow();
    const b = idx("browser");
    key(`Digit${b + 1}`);
    await settle();
    expect(ipc.runAction).toHaveBeenCalledWith(items()[b].action);
  });

  it("número de fatia com submenu abre o sub-anel; depois o teclado numérico escolhe o subitem", async () => {
    await mountAndShow();
    const m = idx("midia");
    key(`Digit${m + 1}`);
    expect(submenu()).not.toBeNull();
    expect(ipc.runAction).not.toHaveBeenCalled();
    key("Numpad1");
    await settle();
    expect(ipc.runAction).toHaveBeenCalledWith(items()[m].children![0].action);
  });

  it("número sem fatia correspondente e Ctrl+número são ignorados", async () => {
    await mountAndShow();
    key("Digit9");
    key("Digit1", { ctrlKey: true });
    await settle();
    if (n() < 9) expect(ipc.runAction).not.toHaveBeenCalled();
    expect(root()).not.toBeNull();
  });
});
