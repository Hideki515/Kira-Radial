import { describe, expect, it } from "vitest";
import { comboFromEvent, formatCombo, parseCombo } from "./keys";

describe("parseCombo", () => {
  it("normaliza aliases e ordem dos modificadores", () => {
    expect(formatCombo(parseCombo("shift + ctrl + escape")!)).toBe("Ctrl+Shift+Esc");
    expect(formatCombo(parseCombo("win+d")!)).toBe("Win+D");
    expect(formatCombo(parseCombo("Alt+F4")!)).toBe("Alt+F4");
  });
  it("aceita Win sozinho", () => {
    expect(parseCombo("Win")).toEqual({ mods: [], key: "Win" });
  });
  it("rejeita inválidos", () => {
    expect(parseCombo("Ctrl+Shift")).toBeNull();
    expect(parseCombo("Ctrl+A+B")).toBeNull();
    expect(parseCombo("Ctrl+")).toBeNull();
    expect(parseCombo("Ctrl+Foo")).toBeNull();
  });
});

describe("comboFromEvent", () => {
  it("ignora tecla só de modificador", () => {
    expect(comboFromEvent({ key: "Control", ctrlKey: true, altKey: false, shiftKey: false, metaKey: false })).toBeNull();
  });
  it("usa a tecla física (ABNT2: Ctrl+Alt vira AltGr, Shift muda o caractere)", () => {
    const altGr = comboFromEvent({ key: "/", code: "KeyQ", ctrlKey: true, altKey: true, shiftKey: false, metaKey: false });
    expect(altGr && formatCombo(altGr)).toBe("Ctrl+Alt+Q");
    const shifted = comboFromEvent({ key: "!", code: "Digit1", ctrlKey: true, altKey: false, shiftKey: true, metaKey: false });
    expect(shifted && formatCombo(shifted)).toBe("Ctrl+Shift+1");
    const f = comboFromEvent({ key: "F5", code: "F5", ctrlKey: false, altKey: true, shiftKey: false, metaKey: false });
    expect(f && formatCombo(f)).toBe("Alt+F5");
  });
  it("ignora AltGraph e modificadores pelo code", () => {
    expect(comboFromEvent({ key: "AltGraph", code: "AltRight", ctrlKey: true, altKey: true, shiftKey: false, metaKey: false })).toBeNull();
  });
  it("captura combinação", () => {
    const c = comboFromEvent({ key: " ", ctrlKey: false, altKey: true, shiftKey: false, metaKey: false });
    expect(c && formatCombo(c)).toBe("Alt+Space");
  });
});
