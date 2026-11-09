import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// AudioContext falso: registra o que foi criado/tocado.
const log = vi.hoisted(() => ({ created: 0, osc: 0, noise: 0, buffers: 0, decoded: 0 }));

class FakeParam {
  value = 0;
  setValueAtTime() { return this; }
  exponentialRampToValueAtTime() { return this; }
}
class FakeNode {
  gain = new FakeParam();
  frequency = new FakeParam();
  Q = new FakeParam();
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
  constructor() { log.created++; }
  resume() { return Promise.resolve(); }
  createGain() { return new FakeNode(); }
  createOscillator() { log.osc++; return new FakeNode(); }
  createBiquadFilter() { return new FakeNode(); }
  createBuffer(_c: number, len: number) { log.noise++; return { getChannelData: () => new Float32Array(len) }; }
  createBufferSource() { log.buffers++; return new FakeNode(); }
  decodeAudioData() { log.decoded++; return Promise.resolve({}); }
}

const ipc = vi.hoisted(() => ({ readSound: vi.fn(async (p: string) => `data:audio/wav;base64,${p.length}`) }));
vi.mock("./ipc", () => ({ readSound: ipc.readSound }));

import { DEFAULT_SOUNDS, playSound, soundsOf } from "./sound";

beforeEach(() => {
  (globalThis as { AudioContext?: unknown }).AudioContext = FakeAudioContext;
  Object.assign(log, { osc: 0, noise: 0, buffers: 0, decoded: 0 });
  globalThis.fetch = vi.fn(async () => ({ arrayBuffer: async () => new ArrayBuffer(4) })) as never;
});
afterEach(() => {
  delete (globalThis as { AudioContext?: unknown }).AudioContext;
  vi.clearAllMocks();
});

describe("sons", () => {
  it("padrão: desligado, hover sem som, demais embutidos", () => {
    expect(DEFAULT_SOUNDS.enabled).toBe(false);
    expect(soundsOf(undefined).events.hover.mode).toBe("off");
    expect(soundsOf({ enabled: true }).events.open.mode).toBe("builtin");
  });

  it("desligado não toca; 'force' (pré-escuta) toca mesmo assim", async () => {
    await playSound("open", undefined);
    expect(log.osc).toBe(0);
    await playSound("open", undefined, true);
    expect(log.osc).toBeGreaterThan(0);
    expect(log.noise).toBe(1); // whoosh usa ruído
  });

  it("evento 'off' nunca toca; embutido sintetiza sem ler arquivo", async () => {
    await playSound("hover", { enabled: true });
    expect(log.osc).toBe(0);
    await playSound("execute", { enabled: true });
    expect(log.osc).toBe(2); // dois tons do blip
    expect(ipc.readSound).not.toHaveBeenCalled();
  });

  it("arquivo próprio é lido uma vez (cache) e tocado; falha cai no embutido", async () => {
    const cfg = { enabled: true, volume: 0.5, events: { ...DEFAULT_SOUNDS.events, open: { mode: "file" as const, file: "C:/s/a.wav" } } };
    await playSound("open", cfg);
    await playSound("open", cfg);
    expect(ipc.readSound).toHaveBeenCalledTimes(1);
    expect(log.decoded).toBe(1);
    expect(log.buffers).toBeGreaterThanOrEqual(2);

    ipc.readSound.mockRejectedValueOnce("sumiu");
    const bad = { ...cfg, events: { ...cfg.events, open: { mode: "file" as const, file: "C:/s/sumiu.wav" } } };
    const before = log.osc;
    await playSound("open", bad);
    expect(log.osc).toBeGreaterThan(before);
  });

  it("sem Web Audio (ambiente de teste/antigo) não quebra", async () => {
    delete (globalThis as { AudioContext?: unknown }).AudioContext;
    await expect(playSound("open", { enabled: true }, true)).resolves.toBeUndefined();
  });
});
