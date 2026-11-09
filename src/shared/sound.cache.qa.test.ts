// Teste adicionado pelo QA (v0.7.0): falha de leitura não fica em cache; clearSoundCache relê.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

class FakeNode {
  gain = { value: 0, setValueAtTime() { return this; }, exponentialRampToValueAtTime() { return this; } };
  frequency = { value: 0, setValueAtTime() { return this; }, exponentialRampToValueAtTime() { return this; } };
  Q = { value: 0 };
  type = "";
  buffer: unknown = null;
  connect(n: unknown) { return n; }
  start() {}
  stop() {}
}
class FakeAudioContext {
  state = "running";
  currentTime = 0;
  sampleRate = 8000;
  destination = new FakeNode();
  resume() { return Promise.resolve(); }
  createGain() { return new FakeNode(); }
  createOscillator() { return new FakeNode(); }
  createBiquadFilter() { return new FakeNode(); }
  createBuffer(_c: number, len: number) { return { getChannelData: () => new Float32Array(len) }; }
  createBufferSource() { return new FakeNode(); }
  decodeAudioData() { return Promise.resolve({}); }
}

const ipc = vi.hoisted(() => ({ readSound: vi.fn(async (p: string) => `data:audio/wav;base64,${p.length}`) }));
vi.mock("./ipc", () => ({ readSound: ipc.readSound }));

import { DEFAULT_SOUNDS, clearSoundCache, playSound } from "./sound";

const cfg = (file: string) => ({ enabled: true, volume: 0.5, events: { ...DEFAULT_SOUNDS.events, open: { mode: "file" as const, file } } });

beforeEach(() => {
  (globalThis as { AudioContext?: unknown }).AudioContext = FakeAudioContext;
  globalThis.fetch = vi.fn(async () => ({ arrayBuffer: async () => new ArrayBuffer(4) })) as never;
  clearSoundCache();
  ipc.readSound.mockClear();
});
afterEach(() => {
  delete (globalThis as { AudioContext?: unknown }).AudioContext;
});

describe("QA cache de sons", () => {
  it("falha de leitura não fica guardada: próxima tentativa relê", async () => {
    ipc.readSound.mockRejectedValueOnce("sumiu");
    await playSound("open", cfg("C:/s/x.wav"));
    await playSound("open", cfg("C:/s/x.wav"));
    expect(ipc.readSound).toHaveBeenCalledTimes(2);
    await playSound("open", cfg("C:/s/x.wav")); // agora ok e em cache
    expect(ipc.readSound).toHaveBeenCalledTimes(2);
  });

  it("clearSoundCache força nova leitura do mesmo caminho", async () => {
    await playSound("open", cfg("C:/s/y.wav"));
    await playSound("open", cfg("C:/s/y.wav"));
    expect(ipc.readSound).toHaveBeenCalledTimes(1);
    clearSoundCache();
    await playSound("open", cfg("C:/s/y.wav"));
    expect(ipc.readSound).toHaveBeenCalledTimes(2);
  });
});
