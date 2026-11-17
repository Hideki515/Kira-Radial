import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { defaultConfig } from "../shared/defaults";
import { THEMES, THEME_ACCENT, type Theme } from "../shared/types";
import { RadialCanvas } from "./RadialCanvas";

afterEach(cleanup);

const TECH: Theme[] = ["circuit", "radar", "quantum", "blueprint", "datacenter", "neural"];

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

describe("temas tecnológicos (v0.24.0)", () => {
  it("estão na lista com cor sugerida", () => {
    for (const t of TECH) {
      expect(THEMES).toContain(t);
      expect(THEME_ACCENT[t]).toMatch(/^#[0-9a-f]{6}$/i);
    }
  });

  it("cada um desenha a própria camada (aria-hidden), com fatias e centro, sem a decoração do Vidro", () => {
    for (const t of TECH) {
      const { container, unmount } = draw(t);
      expect(container.querySelector("svg")!.classList.contains(`theme-${t}`), t).toBe(true);
      const layer = container.querySelector(`[data-testid="${t}-back"]`);
      expect(layer, t).not.toBeNull();
      expect(layer!.getAttribute("aria-hidden")).toBe("true");
      expect(container.querySelectorAll(".main-slice").length).toBe(defaultConfig.profiles[0].items.length);
      expect(container.querySelector(".hub-disc")).not.toBeNull();
      expect(container.querySelector(".orbit-soft"), t).toBeNull();
      unmount();
    }
  });

  it("poucas animações por tema: elementos agrupados (≤ 6 grupos animados)", () => {
    const animated: Record<string, string> = {
      circuit: ".circuit-vias",
      radar: ".radar-spin, .radar-blips",
      quantum: ".quantum-spin",
      datacenter: ".dc-leds",
      neural: ".neural-edges, .neural-nodes",
    };
    for (const [t, sel] of Object.entries(animated)) {
      const { container, unmount } = draw(t as Theme);
      const n = container.querySelectorAll(sel).length;
      expect(n, t).toBeGreaterThan(0);
      expect(n, t).toBeLessThanOrEqual(6);
      unmount();
    }
  });

  it("desenho determinístico (igual a cada abertura)", () => {
    for (const t of TECH) {
      const a = draw(t).container.innerHTML;
      cleanup();
      const b = draw(t).container.innerHTML;
      cleanup();
      expect(a === b, t).toBe(true);
    }
  });
});
