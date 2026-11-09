import { act, cleanup, render } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
// Teste adicionado pelo QA (v0.3.1): casos-limite do recolhimento para o ícone.
import { cloneConfig, defaultConfig } from "../shared/defaults";
import type { Config } from "../shared/types";
const ipc = vi.hoisted(() => ({ config: null as unknown as Config, hideMenu: vi.fn(async () => {}), handlers: {} as Record<string, (p: unknown) => void> }));
vi.mock("../shared/ipc", async (orig) => {
  const real = await orig<typeof import("../shared/ipc")>();
  return { ...real, isTauri: () => true, getConfig: async () => ipc.config, listAudioOutputs: async () => [], runAction: vi.fn(async () => {}), hideMenu: ipc.hideMenu,
    onEvent: async (name: string, cb: (p: unknown) => void) => { ipc.handlers[name] = cb; return () => {}; } };
});
vi.mock("../shared/perf", () => ({ perfLog: () => {}, observeLongTasks: () => {}, startFrameMonitor: () => () => ({ durationMs: 0, frames: 0, maxGapMs: 0, janky: 0 }) }));
import { CLOSE_TO_ORB_MS, RadialApp } from "./RadialApp";
beforeEach(() => { vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] }); ipc.hideMenu.mockClear(); });
afterEach(() => { cleanup(); vi.useRealTimers(); });
it("menu:hide durante o recolhimento cancela o timer (sem hideMenu duplicado)", async () => {
  ipc.config = cloneConfig(defaultConfig);
  render(<RadialApp />);
  await act(async () => { await Promise.resolve(); await Promise.resolve(); });
  act(() => ipc.handlers["menu:show"]?.({ profileId: "default", cx: 300, cy: 300, originX: 400, originY: 400 }));
  act(() => void window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" })));
  act(() => ipc.handlers["menu:hide"]?.(null));
  act(() => void vi.advanceTimersByTime(CLOSE_TO_ORB_MS * 2));
  expect(ipc.hideMenu).not.toHaveBeenCalled();
  expect(document.querySelector('[data-testid="radial-root"]')).toBeNull();
});
it("entrada é ignorada durante o recolhimento: Esc duplo chama hideMenu uma vez", async () => {
  ipc.config = cloneConfig(defaultConfig);
  render(<RadialApp />);
  await act(async () => { await Promise.resolve(); await Promise.resolve(); });
  act(() => ipc.handlers["menu:show"]?.({ profileId: "default", cx: 300, cy: 300, originX: 400, originY: 400 }));
  act(() => void window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" })));
  act(() => void window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" })));
  act(() => void vi.advanceTimersByTime(CLOSE_TO_ORB_MS * 3));
  expect(ipc.hideMenu).toHaveBeenCalledTimes(1);
});
