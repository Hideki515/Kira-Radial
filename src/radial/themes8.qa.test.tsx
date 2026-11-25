// QA v0.44.0: raio do Plasma segue a fatia ativa; manchas do Térmico recortadas pelo campo.
import { readFileSync } from "node:fs";
import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { defaultConfig } from "../shared/defaults";
import type { Theme } from "../shared/types";
import { LAYOUT, sliceAngle } from "./geometry";
import { RadialCanvas } from "./RadialCanvas";

afterEach(cleanup);

const items = defaultConfig.profiles[0].items;
const C = LAYOUT.size / 2;

function draw(theme: Theme, activeMain: number | null) {
  return render(
    <RadialCanvas items={items} activeMain={activeMain} activeSub={null} hubHovered={false} stats={null}
      appearance={{ ...defaultConfig.appearance, theme }} />,
  ).container;
}

/** Ângulo (graus, 0..360) do último ponto do raio, visto do centro. */
function tipAngle(d: string): number {
  const pts = [...d.matchAll(/[ML](-?[\d.]+) (-?[\d.]+)/g)].map((m) => [Number(m[1]), Number(m[2])]);
  const [x, y] = pts[pts.length - 1];
  return ((Math.atan2(y - C, x - C) * 180) / Math.PI + 360) % 360;
}

describe("QA v0.44.0 Plasma e Térmico", () => {
  it("Plasma: o raio aponta para a fatia ativa e muda ao trocar de fatia", () => {
    const ds: string[] = [];
    for (const i of [0, 2, items.length - 1]) {
      const strike = draw("plasma", i).querySelector('[data-testid="plasma-strike"] .plasma-bolt');
      expect(strike, `fatia ${i}`).not.toBeNull();
      const d = strike!.getAttribute("d")!;
      const want = ((sliceAngle(i, items.length) % 360) + 360) % 360;
      const diff = Math.abs(((tipAngle(d) - want + 540) % 360) - 180);
      expect(diff, `fatia ${i}`).toBeLessThan(0.5);
      ds.push(d);
      cleanup();
    }
    expect(new Set(ds).size).toBe(3);
  });

  it("Térmico: as manchas de calor ficam dentro do clipPath do campo (r = subOuter + 78)", () => {
    const c = draw("thermal", 0);
    const clip = c.querySelector("clipPath#thermal-clip circle");
    expect(clip).not.toBeNull();
    expect(Number(clip!.getAttribute("r"))).toBe(LAYOUT.subOuter + 78);
    const heat = c.querySelector(".thermal-heat")!;
    expect(heat.closest('[clip-path="url(#thermal-clip)"]')).not.toBeNull();
  });

  it("themes8.css: animações a 15 quadros/s, reduced-motion e classes sat-* sem colidir com orbit-* do Vidro", () => {
    const css = readFileSync("src/styles/themes8.css", "utf8");
    const rate = (sel: string) => {
      const esc = sel.replace(/[.-]/g, (ch) => "\\" + ch);
      const m = css.match(new RegExp(esc + String.raw`\s*\{[^}]*animation:\s*[\w-]+\s+([\d.]+)s\s+steps\((\d+)\)`));
      expect(m, sel).not.toBeNull();
      return Number(m![2]) / Number(m![1]);
    };
    expect(rate(".sat-spin--a")).toBeCloseTo(15);
    expect(rate(".sat-spin--b")).toBeCloseTo(15);
    expect(rate(".sat-spin--c")).toBeCloseTo(15);
    expect(css).toMatch(/\.plasma-flicker\s*\{\s*animation:\s*plasma-flicker 0\.8s steps\(1\)/);
    const reduced = css.slice(css.indexOf("prefers-reduced-motion"));
    expect(reduced).toMatch(/\.plasma-flicker,\s*\.sat-spin\s*\{\s*animation:\s*none/);
    expect(css).not.toMatch(/\.orbit-/);
    expect(css).not.toMatch(/@keyframes\s+holo-spin/);
    const sat = draw("satellite", 0);
    expect(sat.querySelectorAll(".sat-spin")).toHaveLength(3);
    expect(sat.querySelector('[data-testid="satellite-back"] [class*="orbit-"]')).toBeNull();
  });

  it("Plasma: sem fatia ativa (ou sem itens) não há raio; a camada continua", () => {
    const c = draw("plasma", null);
    expect(c.querySelector('[data-testid="plasma-back"]')).not.toBeNull();
    expect(c.querySelector('[data-testid="plasma-strike"]')).toBeNull();
    expect(c.querySelectorAll(".plasma-flicker")).toHaveLength(2);
    cleanup();
    const e = render(
      <RadialCanvas items={[]} activeMain={0} activeSub={null} hubHovered={false} stats={null}
        appearance={{ ...defaultConfig.appearance, theme: "plasma" }} />,
    ).container;
    expect(e.querySelector('[data-testid="plasma-strike"]')).toBeNull();
  });
});
