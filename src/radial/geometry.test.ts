import { describe, expect, it } from "vitest";
import {
  LAYOUT, angleDiff, donutSlicePath, hitTest, normalizeAngle, polar, sliceAngle, submenuAngles,
} from "./geometry";

describe("ângulos", () => {
  it("normaliza", () => {
    expect(normalizeAngle(-90)).toBe(270);
    expect(normalizeAngle(720)).toBe(0);
  });
  it("angleDiff pega o menor caminho", () => {
    expect(angleDiff(350, 10)).toBe(20);
    expect(angleDiff(10, 350)).toBe(-20);
  });
  it("fatia 0 fica no topo e as demais seguem sentido horário", () => {
    expect(sliceAngle(0, 8)).toBe(-90);
    expect(sliceAngle(1, 8)).toBe(-45);
    expect(sliceAngle(2, 8)).toBe(0);
  });
  it("polar", () => {
    const p = polar(0, 0, 10, -90);
    expect(p.x).toBeCloseTo(0);
    expect(p.y).toBeCloseTo(-10);
  });
});

describe("donutSlicePath", () => {
  it("gera path fechado com dois arcos", () => {
    const d = donutSlicePath(450, 450, 140, 287, -112.5, -67.5, 10);
    expect(d.startsWith("M")).toBe(true);
    expect(d.match(/A/g)).toHaveLength(2);
    expect(d.endsWith("Z")).toBe(true);
  });
});

describe("submenuAngles", () => {
  it("centraliza no ângulo do pai", () => {
    const a = submenuAngles(-45, 3, 38);
    expect(a).toHaveLength(3);
    expect(a[1]).toBeCloseTo(-45);
    expect(a[0]).toBeCloseTo(-83);
    expect(a[2]).toBeCloseTo(-7);
  });
  it("reduz o espaçamento quando há muitos itens", () => {
    const a = submenuAngles(0, 10, 38);
    expect(a[1] - a[0]).toBeCloseTo(32);
  });
});

describe("hitTest", () => {
  const dz = 120;
  it("zona morta = centro", () => {
    expect(hitTest(10, 10, 8, dz)).toEqual({ ring: "center" });
  });
  it("seleciona por ângulo no anel principal", () => {
    expect(hitTest(0, -200, 8, dz)).toEqual({ ring: "main", index: 0 }); // topo
    expect(hitTest(200, 0, 8, dz)).toEqual({ ring: "main", index: 2 }); // direita
    expect(hitTest(0, 200, 8, dz)).toEqual({ ring: "main", index: 4 }); // baixo
    expect(hitTest(-200, 0, 8, dz)).toEqual({ ring: "main", index: 6 }); // esquerda
  });
  it("funciona além do anel (gesto)", () => {
    expect(hitTest(0, -800, 8, dz)).toEqual({ ring: "main", index: 0 });
  });
  it("detecta item do sub-anel quando aberto", () => {
    const sub = { parentAngle: -45, count: 3 };
    const p = polar(0, 0, 330, -45);
    expect(hitTest(p.x, p.y, 8, dz, sub)).toEqual({ ring: "sub", index: 1 });
    const q = polar(0, 0, 330, -83);
    expect(hitTest(q.x, q.y, 8, dz, sub)).toEqual({ ring: "sub", index: 0 });
  });
  it("fora do arco do sub-anel volta para o anel principal", () => {
    const sub = { parentAngle: -45, count: 3 };
    const p = polar(0, 0, 330, 90);
    expect(hitTest(p.x, p.y, 8, dz, sub)).toEqual({ ring: "main", index: 4 });
  });
  it("no anel principal ignora o sub-anel", () => {
    const sub = { parentAngle: -45, count: 3 };
    const p = polar(0, 0, LAYOUT.mainInner + 20, -45);
    expect(hitTest(p.x, p.y, 8, dz, sub)).toEqual({ ring: "main", index: 1 });
  });
});
