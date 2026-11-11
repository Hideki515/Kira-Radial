import { act, cleanup, fireEvent, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cloneConfig, defaultConfig } from "../shared/defaults";
import type { Action, Config } from "../shared/types";

// Executar brilho/plano/rádio pelo menu esquece a leitura guardada daquele submenu.

const ipc = vi.hoisted(() => ({ config: null as unknown as Config, runAction: vi.fn(async () => {}) }));
vi.mock("../shared/ipc", async (orig) => {
  const real = await orig<typeof import("../shared/ipc")>();
  return { ...real, getConfig: async () => ipc.config, runAction: ipc.runAction };
});
const dyn = vi.hoisted(() => ({ invalidate: vi.fn() }));
vi.mock("./useDynamicSources", async (orig) => {
  const real = await orig<typeof import("./useDynamicSources")>();
  return { ...real, invalidateDynamic: dyn.invalidate };
});

import { RadialApp } from "./RadialApp";

async function runFirst(action: Action) {
  const cfg = cloneConfig(defaultConfig);
  cfg.profiles[0].items[0] = { id: "x", label: "X", icon: "sun", action };
  ipc.config = cfg;
  render(<RadialApp />);
  await act(async () => { await Promise.resolve(); await Promise.resolve(); });
  fireEvent.keyDown(window, { key: "ArrowRight" });
  await act(async () => {
    fireEvent.keyDown(window, { key: "Enter" });
    await Promise.resolve();
    await Promise.resolve();
  });
  expect(ipc.runAction).toHaveBeenCalledWith(action);
}

beforeEach(() => {
  ipc.runAction.mockClear();
  dyn.invalidate.mockClear();
});
afterEach(cleanup);

describe("RadialApp › invalida o cache dos submenus após a ação", () => {
  it("brilho → relê o submenu de brilho", async () => {
    await runFirst({ type: "brightness", mode: "up" });
    expect(dyn.invalidate).toHaveBeenCalledWith("brightness");
  });

  it("plano de energia → relê os planos", async () => {
    await runFirst({ type: "powerPlan", guid: "abc" });
    expect(dyn.invalidate).toHaveBeenCalledWith("powerPlans");
  });

  it("ação que não muda nenhum submenu não invalida; falha também não", async () => {
    await runFirst({ type: "url", url: "https://exemplo.com" });
    expect(dyn.invalidate).not.toHaveBeenCalled();
    cleanup();
    ipc.runAction.mockRejectedValueOnce(new Error("sem DDC"));
    await runFirst({ type: "brightness", mode: "down" });
    expect(dyn.invalidate).not.toHaveBeenCalled();
  });
});
