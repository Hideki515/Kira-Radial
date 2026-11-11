import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { MenuItem } from "../shared/types";

const ipc = vi.hoisted(() => ({ displays: vi.fn(async () => [{ id: "lcd", name: "Tela", level: 50 }]), windows: vi.fn(async () => []) }));
vi.mock("../shared/ipc", async (orig) => {
  const real = await orig<typeof import("../shared/ipc")>();
  return { ...real, listDisplays: ipc.displays, listWindows: ipc.windows };
});
vi.mock("../shared/perf", () => ({ perfLog: vi.fn() }));

import { describeOpenStats, openTimeMs } from "../shared/ipc";
import { CACHE_MS, invalidateDynamic, isFresh, kindChangedBy, useDynamicSources } from "./useDynamicSources";

const items: MenuItem[] = [
  { id: "b", label: "Brilho", icon: "sun", dynamic: "brightness" },
  { id: "w", label: "Janelas", icon: "app-window", dynamic: "windows" },
];

beforeEach(() => {
  invalidateDynamic();
  ipc.displays.mockClear();
  ipc.windows.mockClear();
});
afterEach(cleanup);

const flush = () => act(async () => { await Promise.resolve(); await Promise.resolve(); });

describe("submenus automáticos › cache das leituras lentas", () => {
  it("brilho é lido 1 vez dentro do prazo; janelas a cada abertura; invalidar força nova leitura", async () => {
    const { result, rerender } = renderHook(({ k }) => useDynamicSources(items, true, k), { initialProps: { k: 1 } });
    await flush();
    expect(result.current.displays).toHaveLength(1);
    rerender({ k: 2 }); // reabriu o menu
    await flush();
    rerender({ k: 3 });
    await flush();
    expect(ipc.displays).toHaveBeenCalledTimes(1);
    expect(ipc.windows).toHaveBeenCalledTimes(3);
    invalidateDynamic(kindChangedBy({ type: "brightness", mode: "up" }));
    rerender({ k: 4 });
    await flush();
    expect(ipc.displays).toHaveBeenCalledTimes(2);
  });

  it("falha na leitura não fica guardada (tenta de novo na próxima abertura)", async () => {
    ipc.displays.mockRejectedValueOnce(new Error("DDC"));
    const { result, rerender } = renderHook(({ k }) => useDynamicSources(items, true, k), { initialProps: { k: 1 } });
    await flush();
    expect(result.current.displays).toEqual([]);
    rerender({ k: 2 });
    await flush();
    expect(ipc.displays).toHaveBeenCalledTimes(2);
    expect(result.current.displays).toHaveLength(1);
  });

  it("leitura que chega depois de o menu fechar não conta como recente (relê na próxima abertura)", async () => {
    const { result, rerender } = renderHook(({ k, on }) => useDynamicSources(items, on, k), { initialProps: { k: 1, on: true } });
    await flush(); // 1ª abertura: nível 50 guardado
    invalidateDynamic("brightness"); // ex.: mudou o brilho pelo menu
    let finish!: (v: { id: string; name: string; level: number }[]) => void;
    ipc.displays.mockImplementationOnce(() => new Promise((r) => (finish = r)));
    rerender({ k: 2, on: true }); // 2ª abertura começa a ler...
    rerender({ k: 2, on: false }); // ...e fecha antes da resposta
    await act(async () => finish([{ id: "lcd", name: "Tela", level: 10 }]));
    ipc.displays.mockResolvedValueOnce([{ id: "lcd", name: "Tela", level: 10 }]);
    rerender({ k: 3, on: true });
    await flush();
    expect(ipc.displays).toHaveBeenCalledTimes(3); // não reaproveitou o nível 50 antigo
    expect(result.current.displays?.[0]).toMatchObject({ level: 10 });
  });

  it("prazo por tipo e ações que invalidam", () => {
    expect(isFresh("brightness", 1000, 1000 + CACHE_MS.brightness! - 1)).toBe(true);
    expect(isFresh("brightness", 1000, 1000 + CACHE_MS.brightness!)).toBe(false);
    expect(isFresh("windows", 1000, 1001)).toBe(false); // sem cache
    expect(isFresh("powerPlans", undefined, 5)).toBe(false);
    expect(kindChangedBy({ type: "powerPlan", guid: "x" })).toBe("powerPlans");
    expect(kindChangedBy({ type: "radio", kind: "wifi", mode: "toggle" })).toBe("radios");
    expect(kindChangedBy({ type: "url", url: "https://a.b" })).toBeUndefined();
    expect(kindChangedBy(undefined)).toBeUndefined();
  });
});

describe("tempo de abertura do menu", () => {
  it("soma o tempo do Rust e o do evento até o quadro; sem sentAt = sem medida", () => {
    expect(openTimeMs({ sentAt: 1000, prepMs: 7.5 }, 1030)).toBe(37.5);
    expect(openTimeMs({ sentAt: 1000 }, 1012)).toBe(12);
    expect(openTimeMs({ sentAt: 1000, prepMs: -3 }, 990)).toBe(0); // relógio andou para trás
    expect(openTimeMs({}, 5)).toBeNull();
  });

  it("descrição para o Diagnóstico", () => {
    expect(describeOpenStats(undefined)).toMatch(/ainda não foi aberto/);
    expect(describeOpenStats({ count: 0, avgMs: 0, p90Ms: 0, maxMs: 0, lastMs: 0 })).toMatch(/ainda não foi aberto/);
    expect(describeOpenStats({ count: 1, avgMs: 41.6, p90Ms: 41.6, maxMs: 41.6, lastMs: 41.6 })).toBe(
      "média 42 ms · 90% abaixo de 42 ms · pior 42 ms · última 42 ms (1 abertura)",
    );
    expect(describeOpenStats({ count: 12, avgMs: 30, p90Ms: 55, maxMs: 120, lastMs: 25 })).toContain("(12 aberturas)");
  });
});
