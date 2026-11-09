import { act, cleanup, fireEvent, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cloneConfig, defaultConfig } from "../shared/defaults";
import type { Config } from "../shared/types";

// Teste adicionado pelo QA: navegação por teclado/Enter com o submenu de áudio gerado na hora.

const ipc = vi.hoisted(() => ({
  config: null as unknown as Config,
  listAudioOutputs: vi.fn(),
  runAction: vi.fn(async () => {}),
}));

vi.mock("../shared/ipc", async (orig) => {
  const real = await orig<typeof import("../shared/ipc")>();
  return {
    ...real,
    getConfig: async () => ipc.config,
    listAudioOutputs: ipc.listAudioOutputs,
    runAction: ipc.runAction,
  };
});

import { RadialApp } from "./RadialApp";

const devices = [
  { id: "nv", name: "Monitor (NVIDIA High Definition Audio)", isDefault: true },
  { id: "rt", name: "Speakers (Realtek(R) Audio)", isDefault: false },
];

const key = (k: string) => fireEvent.keyDown(window, { key: k });

async function mount(cfg: Config) {
  ipc.config = cfg;
  render(<RadialApp />);
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

beforeEach(() => {
  ipc.listAudioOutputs.mockReset().mockResolvedValue(devices);
  ipc.runAction.mockClear();
});
afterEach(cleanup);

describe("RadialApp › submenu dinâmico de áudio", () => {
  it("Enter abre os filhos gerados e executa a troca para o dispositivo escolhido", async () => {
    const cfg = cloneConfig(defaultConfig);
    cfg.profiles[0].items[0] = { id: "audio", label: "Áudio", icon: "volume-2", dynamic: "audioOutputs" };
    await mount(cfg);
    expect(ipc.listAudioOutputs).toHaveBeenCalledTimes(1);

    key("ArrowRight"); // seleciona a fatia 0 (áudio)
    key("Enter"); // entra no sub-anel (filho 0)
    key("ArrowRight"); // filho 1 = Speakers
    key("Enter");
    expect(ipc.runAction).toHaveBeenCalledWith({
      type: "audioOutput", mode: "set", deviceId: "rt", deviceName: "Speakers (Realtek(R) Audio)",
    });
  });

  it("perfil sem fatia dinâmica não lista saídas e navega como antes", async () => {
    const cfg = cloneConfig(defaultConfig);
    await mount(cfg);
    expect(ipc.listAudioOutputs).not.toHaveBeenCalled();
    const first = cfg.profiles[0].items[0];
    key("ArrowRight");
    key("Enter");
    if (first.action) expect(ipc.runAction).toHaveBeenCalledWith(first.action);
    else expect(ipc.runAction).not.toHaveBeenCalled();
  });

  it("falha ao listar vira 'Sem saídas' sem ação", async () => {
    ipc.listAudioOutputs.mockRejectedValue(new Error("x"));
    const cfg = cloneConfig(defaultConfig);
    cfg.profiles[0].items[0] = { id: "audio", label: "Áudio", icon: "volume-2", dynamic: "audioOutputs" };
    await mount(cfg);
    key("ArrowRight");
    key("Enter");
    key("Enter");
    expect(ipc.runAction).not.toHaveBeenCalled();
  });
});

describe("RadialApp › sub-anel abre com clique e Esc volta", () => {
  const pastas = () => cloneConfig(defaultConfig).profiles[0].items.findIndex((i) => i.id === "pastas");
  const submenu = () => document.querySelector('[data-testid="submenu"]');
  const root = () => document.querySelector(".radial-root");

  it("destacar a fatia não abre o sub-anel; Enter abre", async () => {
    await mount(cloneConfig(defaultConfig));
    for (let i = 0; i <= pastas(); i++) key("ArrowRight");
    expect(submenu()).toBeNull();
    key("Enter");
    expect(submenu()).not.toBeNull();
  });

  it("Esc no sub-anel volta ao principal; segundo Esc fecha o menu", async () => {
    await mount(cloneConfig(defaultConfig));
    for (let i = 0; i <= pastas(); i++) key("ArrowRight");
    key("Enter");
    key("Escape");
    expect(submenu()).toBeNull();
    expect(root()).not.toBeNull();
    // A fatia-pai continua destacada: Enter reabre o mesmo sub-anel.
    key("Enter");
    expect(submenu()).not.toBeNull();
    key("Escape");
    key("Escape");
    expect(root()).toBeNull();
  });

  it("Backspace também volta ao principal", async () => {
    await mount(cloneConfig(defaultConfig));
    for (let i = 0; i <= pastas(); i++) key("ArrowRight");
    key("Enter");
    key("Backspace");
    expect(submenu()).toBeNull();
    expect(root()).not.toBeNull();
  });
});
