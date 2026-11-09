// Teste adicionado pelo QA (v0.7.0): a janela do radial limpa o cache de sons quando
// appearance.sounds muda (e só nesse caso).
import { act, cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cloneConfig, defaultConfig } from "../shared/defaults";
import { DEFAULT_SOUNDS } from "../shared/sound";
import type { Config } from "../shared/types";

const ipc = vi.hoisted(() => ({ config: null as unknown as Config }));
vi.mock("../shared/ipc", async (orig) => {
  const real = await orig<typeof import("../shared/ipc")>();
  return { ...real, getConfig: async () => ipc.config, runAction: vi.fn(async () => {}) };
});
const snd = vi.hoisted(() => ({ clear: vi.fn() }));
vi.mock("../shared/sound", async (orig) => {
  const real = await orig<typeof import("../shared/sound")>();
  return { ...real, clearSoundCache: snd.clear, playSound: vi.fn(async () => {}) };
});

import { RadialApp } from "./RadialApp";

const flush = () => act(async () => { await Promise.resolve(); await Promise.resolve(); });
async function reload(c: Config) {
  ipc.config = c;
  window.dispatchEvent(new Event("kira:config-changed"));
  await flush();
}

afterEach(cleanup);

describe("QA RadialApp › cache de sons", () => {
  it("limpa ao mudar sounds; não limpa se só outra coisa mudou", async () => {
    const c1 = cloneConfig(defaultConfig);
    ipc.config = c1;
    render(<RadialApp />);
    await flush();
    const base = snd.clear.mock.calls.length;
    expect(base).toBeGreaterThanOrEqual(1);

    const c2 = cloneConfig(c1);
    c2.appearance.scale = 1.2;
    await reload(c2);
    expect(snd.clear.mock.calls.length).toBe(base);

    const c3 = cloneConfig(c2);
    c3.appearance.sounds = { ...DEFAULT_SOUNDS, enabled: true, events: { ...DEFAULT_SOUNDS.events, open: { mode: "file", file: "C:/s/a.wav" } } };
    await reload(c3);
    expect(snd.clear.mock.calls.length).toBe(base + 1);
  });
});
