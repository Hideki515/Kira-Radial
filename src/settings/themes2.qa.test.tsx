// QA v0.8.0: cinco temas novos (neon, cyber, steam, fluent, minimal).
import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { cloneConfig, defaultConfig, defaultProfile } from "../shared/defaults";
import { THEMES, THEME_ACCENT, type Theme } from "../shared/types";
import { validateConfig } from "../shared/validate";
import { applyTheme } from "./pages/SimplePages";
import { RadialCanvas } from "../radial/RadialCanvas";

afterEach(cleanup);

const NEW: Theme[] = ["neon", "cyber", "steam", "fluent", "minimal"];

describe("QA v0.8.0 temas novos", () => {
  it("THEMES tem 9 temas únicos e todos têm cor sugerida", () => {
    expect(THEMES.length).toBe(9);
    expect(new Set(THEMES).size).toBe(9);
    for (const t of NEW) expect(THEMES).toContain(t);
    for (const t of THEMES) expect(THEME_ACCENT[t]).toMatch(/^#[0-9a-f]{6}$/i);
  });

  it("validate aceita todos os temas, rejeita desconhecidos e configs antigas seguem válidas", () => {
    for (const t of THEMES) {
      const c = cloneConfig(defaultConfig);
      c.appearance.theme = t;
      expect(validateConfig(c)).toEqual([]);
    }
    for (const bad of ["Neon", "synthwave", "", "fluent "]) {
      const c = cloneConfig(defaultConfig);
      (c.appearance as { theme?: string }).theme = bad;
      expect(validateConfig(c).some((e) => e.includes("Tema desconhecido"))).toBe(true);
    }
    const old = cloneConfig(defaultConfig);
    delete (old.appearance as { theme?: unknown }).theme;
    expect(validateConfig(old)).toEqual([]);
  });

  it("applyTheme entre todos os pares: segue a cor sugerida e preserva cor personalizada", () => {
    for (const a of THEMES)
      for (const b of THEMES) {
        const c = cloneConfig(defaultConfig);
        c.appearance.theme = a;
        c.appearance.accent = THEME_ACCENT[a];
        applyTheme(c, b);
        expect(c.appearance.theme).toBe(b);
        expect(c.appearance.accent).toBe(THEME_ACCENT[b]);

        const p = cloneConfig(defaultConfig);
        p.appearance.theme = a;
        p.appearance.accent = "#123456";
        applyTheme(p, b);
        expect(p.appearance.theme).toBe(b);
        expect(p.appearance.accent).toBe("#123456");
      }
  });

  it("canvas renderiza cada tema com a classe certa e camadas decorativas aria-hidden", () => {
    for (const t of THEMES) {
      const c = cloneConfig(defaultConfig);
      c.appearance.theme = t;
      const { container, unmount } = render(
        <RadialCanvas items={defaultProfile.items} activeMain={null} activeSub={null} hubHovered={false} stats={null} appearance={c.appearance} />,
      );
      const svg = container.querySelector("svg.radial-canvas")!;
      expect(svg.classList.contains(`theme-${t}`)).toBe(true);
      for (const cls of ["neon", "cyber", "steam"]) {
        const layers = container.querySelectorAll(`g.${cls}`);
        if (t === cls) {
          expect(layers.length).toBeGreaterThan(0);
          layers.forEach((g) => expect(g.getAttribute("aria-hidden")).toBe("true"));
        } else expect(layers.length).toBe(0);
      }
      expect(container.querySelectorAll(".fluent-shadow").length).toBe(t === "fluent" ? 1 : 0);
      unmount();
    }
  });
});
