import { describe, expect, it } from "vitest";
import { digitIndex, stepIndex, wheelIndex } from "./navigation";

describe("navegação do menu (contas)", () => {
  it("setas: dão a volta e, sem seleção, começam do primeiro (→) ou do último (←)", () => {
    expect(stepIndex(null, 1, 6)).toBe(0);
    expect(stepIndex(null, -1, 6)).toBe(5);
    expect(stepIndex(5, 1, 6)).toBe(0);
    expect(stepIndex(0, -1, 6)).toBe(5);
    expect(stepIndex(2, 1, 6)).toBe(3);
    expect(stepIndex(null, 1, 0)).toBe(0); // sem itens não quebra
  });

  it("roda: anel principal parte do 0; sub-anel parte de -1", () => {
    expect(wheelIndex(null, 1, 6, 0)).toBe(1);
    expect(wheelIndex(null, -1, 6, 0)).toBe(5);
    expect(wheelIndex(null, 1, 4, -1)).toBe(0);
    expect(wheelIndex(3, 1, 4, -1)).toBe(0);
    expect(wheelIndex(null, 1, 0, 0)).toBe(0);
  });

  it("teclas 1–9 (linha e teclado numérico), sem modificadores", () => {
    const k = (code: string, mods: Partial<KeyboardEvent> = {}) => ({ code, ctrlKey: false, altKey: false, metaKey: false, ...mods });
    expect(digitIndex(k("Digit1"))).toBe(0);
    expect(digitIndex(k("Numpad9"))).toBe(8);
    expect(digitIndex(k("Digit0"))).toBeNull();
    expect(digitIndex(k("KeyA"))).toBeNull();
    expect(digitIndex(k("Digit3", { ctrlKey: true }))).toBeNull();
    expect(digitIndex(k("Digit3", { altKey: true }))).toBeNull();
  });
});
