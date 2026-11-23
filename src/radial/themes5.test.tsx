import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { defaultConfig } from "../shared/defaults";
import { setLang, t, type Key } from "../shared/i18n";
import { THEMES, THEME_ACCENT, type Theme } from "../shared/types";
import { RadialCanvas } from "./RadialCanvas";

afterEach(cleanup);

const TECH2: Theme[] = ["scope", "fiber", "nixie"];

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

describe("pacote Tecnologia 2 (v0.32.0)", () => {
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
    expect(pt.map((n) => n[0])).toEqual(["Osciloscópio", "Fibra Óptica", "Válvulas Nixie"]);
    expect(en.map((n) => n[0])).toEqual(["Oscilloscope", "Fiber Optics", "Nixie Tubes"]);
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
      scope: ".scope-spin, .scope-echo",
      fiber: ".fiber-pulses",
      nixie: ".nixie-flicker",
    };
    for (const [th, sel] of Object.entries(animated)) {
      const { container, unmount } = draw(th as Theme);
      const n = container.querySelectorAll(sel).length;
      expect(n, th).toBeGreaterThan(0);
      expect(n, th).toBeLessThanOrEqual(6);
      unmount();
    }
  });

  it("Nixie: 16 tubos com um dígito cada, em volta do anel", () => {
    const { container } = draw("nixie");
    const digits = [...container.querySelectorAll(".nixie-digit")].map((d) => d.textContent);
    expect(digits).toHaveLength(16);
    for (const d of digits) expect(d).toMatch(/^[0-9]$/);
  });

  it("desenho determinístico (igual a cada abertura)", () => {
    for (const th of TECH2) {
      const a = draw(th).container.innerHTML;
      cleanup();
      const b = draw(th).container.innerHTML;
      cleanup();
      expect(a === b, th).toBe(true);
    }
  });
});
