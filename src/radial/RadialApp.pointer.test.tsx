import { act, cleanup, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cloneConfig, defaultConfig } from "../shared/defaults";
import type { Config } from "../shared/types";
import { LAYOUT, polar, sliceAngle, submenuAngles } from "./geometry";

// Teste adicionado pelo QA: navegação do sub-anel por ponteiro (hover só destaca, clique abre/fecha/troca,
// hub volta, filho executa, hit-test pelo sub-anel aberto) e o evento menu:release do modo "segurar".

const ipc = vi.hoisted(() => ({
  config: null as unknown as Config,
  runAction: vi.fn(async () => {}),
  handlers: {} as Record<string, (p: unknown) => void>,
}));

vi.mock("../shared/ipc", async (orig) => {
  const real = await orig<typeof import("../shared/ipc")>();
  return {
    ...real,
    getConfig: async () => ipc.config,
    listAudioOutputs: async () => [],
    runAction: ipc.runAction,
    onEvent: async (name: string, cb: (p: unknown) => void) => {
      ipc.handlers[name] = cb;
      return () => {
        if (ipc.handlers[name] === cb) delete ipc.handlers[name];
      };
    },
  };
});

import { RadialApp } from "./RadialApp";

const cfg = () => cloneConfig(defaultConfig);
const items = () => cfg().profiles[0].items;
const idx = (id: string) => items().findIndex((i) => i.id === id);
const n = () => items().length;
const scale = () => defaultConfig.appearance.scale;
const center = () => ({ x: window.innerWidth / 2, y: window.innerHeight / 2 });

/** Ponto (coordenadas de tela) no meio do anel principal sobre a fatia i. */
function mainPoint(i: number) {
  const p = polar(0, 0, ((LAYOUT.mainInner + LAYOUT.mainOuter) / 2) * scale(), sliceAngle(i, n()));
  return { x: center().x + p.x, y: center().y + p.y };
}
/** Ponto no sub-anel aberto a partir da fatia `parent`, sobre o filho k. */
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
const move = (pt: { x: number; y: number }) => ptr("pointermove", pt);
const click = (pt: { x: number; y: number }) => {
  move(pt);
  ptr("pointerup", pt);
};

const submenu = () => document.querySelector('[data-testid="submenu"]');
const subLabels = () => [...document.querySelectorAll(".sub-slice")].map((g) => g.getAttribute("aria-label"));
const root = () => document.querySelector(".radial-root");
const activeLabel = () => document.querySelector(".main-slice.is-active")?.getAttribute("aria-label") ?? null;
const labelOf = (id: string) => items()[idx(id)].label;
const childLabels = (id: string) => items()[idx(id)].children!.map((c) => c.label);

async function mount() {
  ipc.config = cfg();
  render(<RadialApp />);
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

beforeEach(() => {
  ipc.runAction.mockClear();
});
afterEach(cleanup);

describe("RadialApp › sub-anel por ponteiro", () => {
  it("passar o mouse destaca a fatia sem abrir o sub-anel", async () => {
    await mount();
    move(mainPoint(idx("pastas")));
    expect(activeLabel()).toBe(labelOf("pastas"));
    expect(submenu()).toBeNull();
  });

  it("clique na fatia abre; clique de novo na mesma fecha e mantém destaque", async () => {
    await mount();
    click(mainPoint(idx("pastas")));
    expect(subLabels()).toEqual(childLabels("pastas"));
    click(mainPoint(idx("pastas")));
    expect(submenu()).toBeNull();
    expect(root()).not.toBeNull();
    expect(activeLabel()).toBe(labelOf("pastas"));
    expect(ipc.runAction).not.toHaveBeenCalled();
  });

  it("clique em outra fatia com filhos troca o sub-anel", async () => {
    await mount();
    click(mainPoint(idx("pastas")));
    click(mainPoint(idx("dev")));
    expect(subLabels()).toEqual(childLabels("dev"));
    expect(activeLabel()).toBe(labelOf("dev"));
  });

  it("clique no hub com sub aberto volta ao principal; sem sub fecha o menu", async () => {
    await mount();
    click(mainPoint(idx("pastas")));
    click(center());
    expect(submenu()).toBeNull();
    expect(root()).not.toBeNull();
    click(center());
    expect(root()).toBeNull();
  });

  it("clique num filho executa a ação dele", async () => {
    await mount();
    click(mainPoint(idx("pastas")));
    click(subPoint(idx("pastas"), 1));
    expect(ipc.runAction).toHaveBeenCalledWith(items()[idx("pastas")].children![1].action);
  });

  it("hit-test do sub-anel usa a fatia aberta, não a destacada", async () => {
    await mount();
    click(mainPoint(idx("pastas")));
    move(mainPoint(idx("dev"))); // destaca outra fatia sem trocar o sub-anel
    expect(activeLabel()).toBe(labelOf("dev"));
    expect(subLabels()).toEqual(childLabels("pastas"));
    click(subPoint(idx("pastas"), 1));
    expect(ipc.runAction).toHaveBeenCalledTimes(1);
    expect(ipc.runAction).toHaveBeenCalledWith(items()[idx("pastas")].children![1].action);
  });

  it("clique em fatia com ação executa; clique bem fora fecha", async () => {
    await mount();
    click(mainPoint(idx("browser")));
    expect(ipc.runAction).toHaveBeenCalledWith(items()[idx("browser")].action);
    const r = (LAYOUT.subOuter + 100) * scale();
    click({ x: center().x + r, y: center().y });
    expect(root()).toBeNull();
  });
});

describe("RadialApp › modo segurar (menu:release)", () => {
  const release = () => act(() => ipc.handlers["menu:release"]?.(null));

  it("registra o handler", async () => {
    await mount();
    expect(typeof ipc.handlers["menu:release"]).toBe("function");
  });

  it("soltar sobre fatia com filhos abre o sub-anel em vez de fechar", async () => {
    await mount();
    move(mainPoint(idx("pastas")));
    release();
    expect(root()).not.toBeNull();
    expect(subLabels()).toEqual(childLabels("pastas"));
    expect(ipc.runAction).not.toHaveBeenCalled();
  });

  it("soltar sobre um filho executa", async () => {
    await mount();
    click(mainPoint(idx("dev")));
    move(subPoint(idx("dev"), 2));
    release();
    expect(ipc.runAction).toHaveBeenCalledWith(items()[idx("dev")].children![2].action);
  });

  it("soltar sobre fatia com ação executa", async () => {
    await mount();
    move(mainPoint(idx("terminal")));
    release();
    expect(ipc.runAction).toHaveBeenCalledWith(items()[idx("terminal")].action);
  });

  it("soltar sem nada selecionado fecha", async () => {
    await mount();
    release();
    expect(root()).toBeNull();
  });
});
