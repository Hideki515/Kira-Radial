import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { defaultConfig } from "../shared/defaults";
import { setLang, t, type Key } from "../shared/i18n";
import { THEMES, THEME_ACCENT, THEME_GROUPS, type Theme } from "../shared/types";
import { RadialCanvas } from "./RadialCanvas";

afterEach(cleanup);

const TECH2: Theme[] = ["vector", "thermal", "crt"];

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

describe("pacote Tecnologia 3 (v0.42.0)", () => {
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
    expect(pt.map((n) => n[0])).toEqual(["Display Vetorial", "Mapa Térmico", "Glitch CRT"]);
    expect(en.map((n) => n[0])).toEqual(["Vector Display", "Thermal Map", "CRT Glitch"]);
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
      vector: ".vector-spin",
      thermal: ".thermal-heat",
      crt: ".crt-roll, .crt-glitch",
    };
    for (const [th, sel] of Object.entries(animated)) {
      const { container, unmount } = draw(th as Theme);
      const n = container.querySelectorAll(sel).length;
      expect(n, th).toBeGreaterThan(0);
      expect(n, th).toBeLessThanOrEqual(6);
      unmount();
    }
  });

  it("Mapa térmico: a fatia ativa usa o degradê quente; CRT tem varredura também por cima do anel", () => {
    const th = draw("thermal").container;
    expect(th.querySelector("#thermal-hot")).not.toBeNull();
    expect(th.querySelectorAll('[id^="thermal-blob-"]')).toHaveLength(3);
    cleanup();
    const crt = draw("crt").container;
    expect(crt.querySelector(".crt-front .crt-front-scan")).not.toBeNull();
    expect(crt.querySelector("#crt-scan")).not.toBeNull();
    cleanup();
    expect(draw("vector").container.querySelector(".crt-front")).toBeNull();
  });

  it("ficam na seção Tecnologia do seletor", () => {
    const tech = THEME_GROUPS.find((g) => g.id === "tech")!.themes;
    for (const t of TECH2) expect(tech).toContain(t);
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
