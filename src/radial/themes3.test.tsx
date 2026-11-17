import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { defaultConfig } from "../shared/defaults";
import { THEMES, THEME_ACCENT, type Theme } from "../shared/types";
import { RadialCanvas } from "./RadialCanvas";
import { pixelCircle } from "./ThemeLayers3";

afterEach(cleanup);

const NEW: Theme[] = ["sakura", "ocean", "aurora", "magma", "pixel", "paper"];

function draw(theme: Theme) {
  return render(
    <RadialCanvas
      items={defaultConfig.profiles[0].items}
      activeMain={0}
      activeSub={null}
      hubHovered={false}
      stats={{ cpu: 40, ram: 50 }}
      appearance={{ ...defaultConfig.appearance, theme }}
    />,
  );
}

describe("temas novos (Sakura, Oceano, Aurora, Magma, Pixel, Papel)", () => {
  it("estão na lista, com cor sugerida em hex", () => {
    for (const t of NEW) {
      expect(THEMES).toContain(t);
      expect(THEME_ACCENT[t]).toMatch(/^#[0-9a-f]{6}$/i);
    }
    expect(new Set(THEMES).size).toBe(THEMES.length);
  });

  it("cada um desenha a própria camada, sem capturar o ponteiro, e mantém fatias e centro", () => {
    for (const t of NEW) {
      const { container, unmount } = draw(t);
      const svg = container.querySelector("svg.radial-canvas")!;
      expect(svg.classList.contains(`theme-${t}`), t).toBe(true);
      const layer = container.querySelector(`[data-testid="${t}-back"]`);
      expect(layer, t).not.toBeNull();
      expect(layer!.getAttribute("aria-hidden")).toBe("true");
      expect(layer!.classList.contains(t)).toBe(true); // .sakura etc. = pointer-events: none
      expect(container.querySelectorAll(".main-slice").length).toBe(defaultConfig.profiles[0].items.length);
      expect(container.querySelector(".hub-disc")).not.toBeNull();
      // Decoração do tema Vidro não aparece junto.
      expect(container.querySelector(".orbit-soft"), t).toBeNull();
      unmount();
    }
  });

  it("desenho é sempre igual (posições fixas, sem aleatório de verdade)", () => {
    for (const t of NEW) {
      const a = draw(t).container.innerHTML;
      cleanup();
      const b = draw(t).container.innerHTML;
      cleanup();
      expect(a === b, t).toBe(true);
    }
  });

  it("círculo em pixels: linhas alinhadas à grade e dentro do raio", () => {
    const d = pixelCircle(100, 100, 30, 6);
    const rows = d.split(" Z").filter((s) => s.trim());
    expect(rows.length).toBe(10);
    for (const r of rows) {
      const [, x, y, w] = /M(-?[\d.]+) (-?[\d.]+) h([\d.]+)/.exec(r)!.map(Number);
      expect((y - 70) % 6).toBe(0);
      expect(w % 12).toBe(0);
      expect(x).toBeGreaterThanOrEqual(70);
    }
  });
});
