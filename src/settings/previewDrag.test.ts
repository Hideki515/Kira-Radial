import { describe, expect, it } from "vitest";
import type { MenuItem, Profile } from "../shared/types";
import { moveError, moveItem } from "./previewDrag";

const a = (id: string, extra: Partial<MenuItem> = {}): MenuItem => ({ id, label: id, icon: "x", action: { type: "openSettings" }, ...extra });
const sub = (id: string, kids: string[]): MenuItem => ({ id, label: id, icon: "x", children: kids.map((k) => a(k)) });

function profile(): Profile {
  return { id: "p", name: "P", items: [a("A"), sub("S", ["s1", "s2"]), a("B"), a("C"), { id: "D", label: "D", icon: "x", dynamic: "radios" }] };
}
const ids = (p: Profile) => p.items.map((i) => i.id + (i.children ? `[${i.children.map((c) => c.id).join(",")}]` : ""));

describe("arrastar na pré-visualização", () => {
  it("fatia → outra posição do anel", () => {
    const p = profile();
    expect(moveItem(p, { main: 0, child: null }, { main: 2, child: null })).toEqual({ main: 2, child: null });
    expect(ids(p)).toEqual(["S[s1,s2]", "B", "A", "C", "D"]);
  });

  it("subitem reordena no mesmo submenu", () => {
    const p = profile();
    expect(moveItem(p, { main: 1, child: 0 }, { main: 1, child: 1 })).toEqual({ main: 1, child: 1 });
    expect(ids(p)[1]).toBe("S[s2,s1]");
  });

  it("fatia sem filhos → dentro de um submenu (índice da fatia-mãe se ajusta)", () => {
    const p = profile();
    expect(moveItem(p, { main: 0, child: null }, { main: 1, child: 2 })).toEqual({ main: 0, child: 2 });
    expect(ids(p)).toEqual(["S[s1,s2,A]", "B", "C", "D"]);
    const q = profile();
    expect(moveItem(q, { main: 3, child: null }, { main: 1, child: 0 })).toEqual({ main: 1, child: 0 });
    expect(ids(q)[1]).toBe("S[C,s1,s2]");
  });

  it("subitem → anel principal (vira fatia)", () => {
    const p = profile();
    expect(moveItem(p, { main: 1, child: 1 }, { main: 0, child: null })).toEqual({ main: 0, child: null });
    expect(ids(p)).toEqual(["s2", "A", "S[s1]", "B", "C", "D"]);
  });

  it("regras: sem aninhar, sem submenu automático, limites de fatias e subitens", () => {
    const p = profile();
    expect(moveError(p, { main: 1, child: null }, { main: 1, child: 0 })).toContain("próprio submenu");
    const nested = profile();
    nested.items.push(sub("T", ["t1"]));
    expect(moveError(nested, { main: 5, child: null }, { main: 1, child: 0 })).toContain("submenu dentro de submenu");
    expect(moveError(p, { main: 0, child: null }, { main: 4, child: 0 })).toContain("não é um submenu");
    const three: Profile = { id: "p", name: "P", items: [a("A"), sub("S", []), a("B")] };
    expect(moveError(three, { main: 0, child: null }, { main: 1, child: 0 })).toContain("pelo menos 3");
    const full = profile();
    full.items[1].children = Array.from({ length: 8 }, (_, i) => a(`k${i}`));
    expect(moveError(full, { main: 0, child: null }, { main: 1, child: 0 })).toContain("8 itens");
    const ten: Profile = { id: "p", name: "P", items: [sub("S", ["s1"]), ...Array.from({ length: 9 }, (_, i) => a(`m${i}`))] };
    expect(moveError(ten, { main: 0, child: 0 }, { main: 1, child: null })).toContain("10 fatias");
    expect(moveError(p, { main: 0, child: null }, { main: 0, child: null })).toBe("mesmo lugar");
    expect(moveItem(p, { main: 0, child: null }, { main: 0, child: null })).toBeNull();
  });
});
