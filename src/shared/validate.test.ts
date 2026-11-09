import { describe, expect, it } from "vitest";
import { cloneConfig, defaultConfig } from "./defaults";
import { validateAction, validateConfig } from "./validate";

describe("validateConfig", () => {
  it("o padrão é válido", () => {
    expect(validateConfig(defaultConfig)).toEqual([]);
  });

  it("rejeita atalho sem modificador", () => {
    const c = cloneConfig(defaultConfig);
    c.hotkey.accelerator = "Space";
    expect(validateConfig(c).join()).toMatch(/modificador/);
  });

  it("aplica limites de fatias e subitens", () => {
    const c = cloneConfig(defaultConfig);
    c.profiles[0].items = c.profiles[0].items.slice(0, 2);
    expect(validateConfig(c).join()).toMatch(/de 3 a 10 fatias/);

    const d = cloneConfig(defaultConfig);
    const pastas = d.profiles[0].items[1];
    pastas.children = Array.from({ length: 9 }, (_, i) => ({ ...pastas.children![0], id: `x${i}` }));
    expect(validateConfig(d).join()).toMatch(/máximo de 8/);
  });

  it("valida ações", () => {
    const c = cloneConfig(defaultConfig);
    c.profiles[0].items[3].action = { type: "url", url: "javascript:alert(1)" };
    c.profiles[0].items[0].action = { type: "keys", combo: "Ctrl+Foo" };
    const errs = validateConfig(c).join("\n");
    expect(errs).toMatch(/URL deve começar/);
    expect(errs).toMatch(/combinação inválida/);
  });

  it("perfil por app exige executável", () => {
    const c = cloneConfig(defaultConfig);
    c.profiles.push({ ...cloneConfig(defaultConfig).profiles[0], id: "vs", name: "VS Code", matchExe: [] });
    expect(validateConfig(c).join()).toMatch(/executável/);
  });
});

describe("validateAction › keys.delayMs", () => {
  it("aceita 0–10000 inteiros e rejeita o resto", async () => {
    const { validateAction } = await import("./validate");
    expect(validateAction({ type: "keys", combo: "Ctrl+A", delayMs: 250 })).toBeNull();
    expect(validateAction({ type: "keys", combo: "Ctrl+A" })).toBeNull();
    expect(validateAction({ type: "keys", combo: "Ctrl+A", delayMs: -5 })).toMatch(/atraso/);
    expect(validateAction({ type: "keys", combo: "Ctrl+A", delayMs: 20000 })).toMatch(/atraso/);
    expect(validateAction({ type: "keys", combo: "Ctrl+A", delayMs: 1.5 })).toMatch(/atraso/);
  });
});

describe("validateAction › audioOutput", () => {
  it("alternar não precisa de dispositivo", () => {
    expect(validateAction({ type: "audioOutput", mode: "cycle" })).toBeNull();
  });

  it("dispositivo específico exige id ou nome", () => {
    expect(validateAction({ type: "audioOutput", mode: "set" })).toMatch(/escolha o dispositivo/);
    expect(validateAction({ type: "audioOutput", mode: "set", deviceId: " ", deviceName: "" })).toMatch(/escolha o dispositivo/);
    expect(validateAction({ type: "audioOutput", mode: "set", deviceId: "{0.0.0}.{x}" })).toBeNull();
    expect(validateAction({ type: "audioOutput", mode: "set", deviceName: "Headset" })).toBeNull();
  });
});
