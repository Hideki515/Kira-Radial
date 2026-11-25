import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { defaultConfig } from "../shared/defaults";
import { setLang, t, type Key } from "../shared/i18n";
import { THEMES, THEME_ACCENT, THEME_GROUPS, type Theme } from "../shared/types";
import { RadialCanvas } from "./RadialCanvas";

afterEach(cleanup);

const TECH2: Theme[] = ["silicon", "plasma", "satellite"];

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

describe("pacote Tecnologia 5 (v0.44.0)", () => {
  it("estão na lista com cor sugerida e nome/dica nos dois idiomas", () => {
    for (const th of TECH2) {
      expect(THEMES).toContain(th);
      expect(THEME_ACCENT[th]).toMatch(/^#[0-9a-f]{6}$/i);
    }
    const names = (lang: "pt" | "en") => {
      setLang(lang);
      return TECH2.map((th) => [t(`theme.${th}.label` as Key), t(`theme.${th}.hint` as Key)]);
    };
    const pt = names("pt");
    const en = names("en");
    setLang("pt");
    expect(pt.map((n) => n[0])).toEqual(["Silício", "Plasma", "Satélite"]);
    expect(en.map((n) => n[0])).toEqual(["Silicon", "Plasma", "Satellite"]);
    for (const [label, hint] of [...pt, ...en]) {
      expect(label).not.toMatch(/^theme\./);
      expect(hint.length).toBeGreaterThan(20);
    }
  });

  it("cada um desenha a própria camada (aria-hidden), com fatias e centro, sem a decoração do Vidro", () => {
    for (const th of TECH2) {
      const { container, unmount } = draw(th);
      expect(container.querySelector("svg")!.classList.contains(`theme-${th}`), th).toBe(true);
      const layer = container.querySelector(`[data-testid="${th}-back"]`);
      expect(layer, th).not.toBeNull();
      expect(layer!.getAttribute("aria-hidden")).toBe("true");
      expect(container.querySelectorAll(".main-slice").length).toBe(defaultConfig.profiles[0].items.length);
      expect(container.querySelector(".hub-disc")).not.toBeNull();
      expect(container.querySelector(".orbit-soft"), th).toBeNull();
      unmount();
    }
  });

  it("poucas animações por tema: elementos agrupados (≤ 6 grupos animados)", () => {
    const animated: Record<string, string> = {
      plasma: ".plasma-flicker",
      satellite: ".sat-spin",
    };
    for (const [th, sel] of Object.entries(animated)) {
      const { container, unmount } = draw(th as Theme);
      const n = container.querySelectorAll(sel).length;
      expect(n, th).toBeGreaterThan(0);
      expect(n, th).toBeLessThanOrEqual(6);
      unmount();
    }
  });

  it("Plasma: o raio aponta para a fatia ativa e some sem fatia; Silício não tem animação", () => {
    const withActive = draw("plasma").container;
    expect(withActive.querySelector('[data-testid="plasma-strike"]')).not.toBeNull();
    cleanup();
    const { container } = render(
      <RadialCanvas items={defaultConfig.profiles[0].items} activeMain={null} activeSub={null} hubHovered={false} stats={null} appearance={{ ...defaultConfig.appearance, theme: "plasma" }} />,
    );
    expect(container.querySelector('[data-testid="plasma-strike"]')).toBeNull();
    cleanup();
    const si = draw("silicon").container;
    expect(si.querySelectorAll(".silicon-trace")).toHaveLength(3);
    expect(si.querySelectorAll(".silicon-pads rect")).toHaveLength(40);
    expect(si.querySelector('[class*="spin"], [class*="flicker"]')).toBeNull();
    cleanup();
    expect(draw("satellite").container.querySelectorAll(".sat-craft")).toHaveLength(3);
  });

  it("ficam na seção Tecnologia do seletor", () => {
    const tech = THEME_GROUPS.find((g) => g.id === "tech")!.themes;
    for (const t of TECH2) expect(tech).toContain(t);
  });

  it("desenho determinístico (igual a cada abertura)", () => {
    // Hora congelada: o relógio do centro mostra HH:MM, e o minuto virar entre os dois
    // desenhos mudava o HTML (teste instável sob carga). O que se testa é o tema.
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date(2026, 0, 1, 12, 0, 30));
    try {
      for (const th of TECH2) {
        const a = draw(th).container.innerHTML;
        cleanup();
        const b = draw(th).container.innerHTML;
        cleanup();
        expect(a === b, th).toBe(true);
      }
    } finally {
      vi.useRealTimers();
    }
  });
});
