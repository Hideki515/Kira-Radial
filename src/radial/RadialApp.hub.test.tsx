import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cloneConfig, defaultConfig, defaultProfile } from "../shared/defaults";
import type { NowPlaying } from "../shared/ipc";
import type { Config } from "../shared/types";
import { RadialCanvas } from "./RadialCanvas";

// "Tocando agora" no centro e roda do mouse sobre o centro ajustando o volume.

const ipc = vi.hoisted(() => ({
  config: null as unknown as Config,
  runAction: vi.fn(async () => {}),
  getVolume: vi.fn(async () => ({ level: 0.6, muted: false })),
  nowPlaying: vi.fn(async (): Promise<NowPlaying | null> => null),
}));

vi.mock("../shared/ipc", async (orig) => {
  const real = await orig<typeof import("../shared/ipc")>();
  return {
    ...real,
    getConfig: async () => ipc.config,
    runAction: ipc.runAction,
    getVolume: ipc.getVolume,
    nowPlaying: ipc.nowPlaying,
    listAudioOutputs: async () => [],
  };
});

import { RadialApp } from "./RadialApp";

const song: NowPlaying = { title: "Back in Black", artist: "AC/DC", app: "Spotify", playing: true, thumb: "data:image/jpeg;base64,AAA" };
const base = { items: defaultProfile.items, hubHovered: false, stats: { cpu: 85, ram: 50 }, appearance: defaultConfig.appearance };

const settle = () => act(async () => { await Promise.resolve(); await Promise.resolve(); await Promise.resolve(); });

beforeEach(() => {
  ipc.runAction.mockClear();
  ipc.getVolume.mockClear();
  ipc.nowPlaying.mockReset().mockResolvedValue(null);
});
afterEach(cleanup);

describe("CenterHub › tocando agora", () => {
  it("com mídia mostra capa, título e artista no lugar da CPU", () => {
    render(<RadialCanvas {...base} activeMain={null} activeSub={null} nowPlaying={song} />);
    expect(screen.getByTestId("hub-media")).toBeTruthy();
    expect(screen.getByTestId("hub-cover").getAttribute("href")).toBe(song.thumb);
    expect(screen.getByText("Back in Black")).toBeTruthy();
    expect(screen.getByText("AC/DC")).toBeTruthy();
    expect(screen.queryByText("85%")).toBeNull();
    expect(screen.queryByText("❚❚")).toBeNull();
  });

  it("pausado mostra o símbolo de pausa; sem artista usa o app", () => {
    render(<RadialCanvas {...base} activeMain={null} activeSub={null} nowPlaying={{ ...song, playing: false, artist: "", thumb: null }} />);
    expect(screen.getByText("❚❚")).toBeTruthy();
    expect(screen.getByText("Spotify")).toBeTruthy();
    expect(screen.queryByTestId("hub-cover")).toBeNull();
  });

  it("opção desligada mantém CPU/relógio mesmo com mídia", () => {
    render(<RadialCanvas {...base} appearance={{ ...base.appearance, showMedia: false }} activeMain={null} activeSub={null} nowPlaying={song} />);
    expect(screen.queryByTestId("hub-media")).toBeNull();
    expect(screen.getByText("85%")).toBeTruthy();
  });

  it("volume aparece como arco + VOL %", () => {
    render(<RadialCanvas {...base} activeMain={null} activeSub={null} volume={0.42} />);
    expect(screen.getByTestId("hub-volume")).toBeTruthy();
    expect(screen.getByText("VOL 42%")).toBeTruthy();
  });
});

describe("RadialApp › roda no centro e mídia", () => {
  it("lê a mídia ao abrir e mostra no centro", async () => {
    ipc.nowPlaying.mockResolvedValue(song);
    ipc.config = cloneConfig(defaultConfig);
    render(<RadialApp />);
    await settle();
    expect(ipc.nowPlaying).toHaveBeenCalled();
    expect(screen.getByText("Back in Black")).toBeTruthy();
  });

  it("roda para cima sobre o centro aumenta o volume e mostra o arco; fora do centro gira a seleção", async () => {
    ipc.config = cloneConfig(defaultConfig);
    render(<RadialApp />);
    await settle();
    const cx = window.innerWidth / 2;
    const cy = window.innerHeight / 2;
    await act(async () => {
      window.dispatchEvent(new WheelEvent("wheel", { deltaY: -100, clientX: cx, clientY: cy }));
    });
    await settle();
    expect(ipc.runAction).toHaveBeenCalledWith({ type: "media", cmd: "volup" });
    expect(screen.getByText("VOL 60%")).toBeTruthy();

    ipc.runAction.mockClear();
    await act(async () => {
      window.dispatchEvent(new WheelEvent("wheel", { deltaY: 100, clientX: cx + 200, clientY: cy }));
    });
    expect(ipc.runAction).not.toHaveBeenCalled();
    expect(document.querySelector(".main-slice.is-active")).not.toBeNull();
  });
});
