// Testes do QA (v0.15.0, editor de tema): compatibilidade com configs antigas,
// rejeição de tema malicioso e seletor dos 9 temas embutidos depois de um personalizado.
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { afterEach, describe, expect, it } from "vitest";
import { RadialCanvas } from "../../radial/RadialCanvas";
import { MAX_CUSTOM_THEMES, createTheme, customRef, exportTheme, importTheme } from "../../shared/customTheme";
import { cloneConfig, defaultConfig, defaultProfile } from "../../shared/defaults";
import { THEMES, THEME_ACCENT, type Config } from "../../shared/types";
import { validateConfig } from "../../shared/validate";
import { AppearancePage, applyTheme } from "./SimplePages";

afterEach(cleanup);

describe("QA v0.15.0 — tema personalizado", () => {
  it("config antiga (tema embutido, sem customThemes) continua válida e o menu não ganha theme-custom nem estilo inline", () => {
    for (const theme of [undefined, ...THEMES]) {
      const c = cloneConfig(defaultConfig);
      delete c.appearance.customThemes;
      c.appearance.theme = theme;
      expect(validateConfig(c)).toEqual([]);
      const { container, unmount } = render(
        <RadialCanvas items={defaultProfile.items} activeMain={0} activeSub={null} hubHovered={false} stats={null} appearance={c.appearance} />,
      );
      const svg = container.querySelector("svg")!;
      expect(svg.classList.contains(`theme-${theme ?? "glass"}`)).toBe(true);
      expect(svg.classList.contains("theme-custom")).toBe(false);
      expect(svg.getAttribute("style")).toBeNull();
      unmount();
    }
  });

  it("validateConfig rejeita tema com CSS no lugar da cor, base desconhecida, nome longo e mais de 20 temas", () => {
    const c = cloneConfig(defaultConfig);
    const t = createTheme("glass", "Mau");
    t.colors.backing = "#000; } svg { display:none";
    c.appearance.customThemes = [t];
    c.appearance.theme = customRef(t.id);
    expect(validateConfig(c).some((e) => e.includes("inválida"))).toBe(true);
    const t2 = createTheme("glass", "x".repeat(41));
    (t2 as { base: string }).base = "matrix";
    c.appearance.customThemes = [t2];
    c.appearance.theme = customRef(t2.id);
    const errs = validateConfig(c);
    expect(errs.some((e) => e.includes("40 caracteres"))).toBe(true);
    expect(errs.some((e) => e.includes("base desconhecido"))).toBe(true);
    c.appearance.customThemes = Array.from({ length: MAX_CUSTOM_THEMES + 1 }, () => createTheme("glass"));
    c.appearance.theme = "glass";
    expect(validateConfig(c).some((e) => e.includes(`No máximo ${MAX_CUSTOM_THEMES}`))).toBe(true);
  });

  it("importTheme: JSON de 4 KB+ (mesmo válido), url()/var() na cor, kiraTheme errado e cores faltando são rejeitados", () => {
    const t = createTheme("neon", "Ok");
    const big = JSON.parse(exportTheme(t));
    big.pad = "x".repeat(5000);
    expect(() => importTheme(JSON.stringify(big))).toThrow(/grande/);
    for (const evil of ["url(javascript:alert(1))", "var(--x)", "#fff", "#ffffffff", "#gggggg", " #ffffff"]) {
      const o = JSON.parse(exportTheme(t));
      o.colors.accent = evil;
      expect(() => importTheme(JSON.stringify(o))).toThrow(/inválida/);
    }
    const v2 = JSON.parse(exportTheme(t));
    v2.kiraTheme = 2;
    expect(() => importTheme(JSON.stringify(v2))).toThrow(/tema da Kira/);
    const noColors = JSON.parse(exportTheme(t));
    delete noColors.colors;
    expect(() => importTheme(JSON.stringify(noColors))).toThrow(/inválida/);
    expect(() => importTheme("null")).toThrow(/tema da Kira/);
    // Campos extras não passam para o tema importado.
    const extra = JSON.parse(exportTheme(t));
    extra.id = "fixo";
    extra.css = "body{}";
    const back = importTheme(JSON.stringify(extra));
    expect(back.id).not.toBe("fixo");
    expect(Object.keys(back).sort()).toEqual(["base", "colors", "id", "name"]);
  });

  it("applyTheme: de um personalizado para cada um dos 9 embutidos troca o tema e mantém a cor global", () => {
    for (const b of THEMES) {
      const c = cloneConfig(defaultConfig);
      const t = createTheme("holo");
      c.appearance.customThemes = [t];
      c.appearance.accent = "#123456";
      applyTheme(c, customRef(t.id));
      expect(c.appearance.theme).toBe(customRef(t.id));
      expect(c.appearance.accent).toBe("#123456");
      applyTheme(c, b);
      expect(c.appearance.theme).toBe(b);
      expect(c.appearance.accent).toBe("#123456");
      expect(validateConfig(c)).toEqual([]);
    }
    // Entre embutidos a sugestão de cor continua valendo.
    const c = cloneConfig(defaultConfig);
    c.appearance.theme = "glass";
    c.appearance.accent = THEME_ACCENT.glass;
    applyTheme(c, "terminal");
    expect(c.appearance.accent).toBe(THEME_ACCENT.terminal);
  });

  it("seletor da Aparência: os 9 cartões embutidos selecionam o tema; '+ Criar tema' some ao chegar a 20", () => {
    let last!: Config;
    function Harness({ init }: { init: Config }) {
      const [c, setC] = useState(init);
      last = c;
      const update = (fn: (c: Config) => void) =>
        setC((prev) => {
          const next = cloneConfig(prev);
          fn(next);
          last = next;
          return next;
        });
      return <AppearancePage config={c} update={update} />;
    }
    const { unmount } = render(<Harness init={cloneConfig(defaultConfig)} />);
    const radios = screen.getAllByRole("radio");
    expect(radios.length).toBe(THEMES.length);
    radios.forEach((r, i) => {
      fireEvent.click(r);
      // Padrão sem tema = "glass" (clicar no Vidro não grava nada).
      expect(last.appearance.theme ?? "glass").toBe(THEMES[i]);
      expect(r.getAttribute("aria-checked")).toBe("true");
    });
    unmount();
    const full = cloneConfig(defaultConfig);
    full.appearance.customThemes = Array.from({ length: MAX_CUSTOM_THEMES }, (_, i) => createTheme("glass", `T${i}`));
    render(<Harness init={full} />);
    expect((screen.getByRole("button", { name: /Criar tema/ }) as HTMLButtonElement).disabled).toBe(true);
  });
});
