import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { RadialCanvas } from "../../radial/RadialCanvas";
import {
  COLOR_KEYS,
  createTheme,
  customRef,
  defaultColors,
  exportTheme,
  findCustom,
  importTheme,
  themeVars,
} from "../../shared/customTheme";
import { cloneConfig, defaultConfig, defaultProfile } from "../../shared/defaults";
import type { Config } from "../../shared/types";
import { validateConfig } from "../../shared/validate";
import { AppearancePage } from "./SimplePages";

afterEach(cleanup);

describe("tema personalizado (lógica)", () => {
  it("cores padrão válidas, variáveis CSS e busca pela referência", () => {
    const t = createTheme("holo", "Âmbar");
    expect(Object.keys(t.colors)).toEqual([...COLOR_KEYS]);
    expect(defaultColors("fluent").backing).toBe("#f3f3f3");
    const vars = themeVars(t);
    expect(vars["--k-label"]).toBe(t.colors.label);
    expect(vars["--active"]).toBe(t.colors.accent);
    expect(findCustom(customRef(t.id), [t])).toBe(t);
    expect(findCustom("holo", [t])).toBeUndefined();
    expect(findCustom("custom:sumiu", [t])).toBeUndefined();
  });

  it("exporta e importa (id novo); rejeita lixo, cor inválida e arquivo grande", () => {
    const t = createTheme("neon", "Rosa");
    t.colors.label = "#ff00aa";
    const back = importTheme(exportTheme(t));
    expect(back.id).not.toBe(t.id);
    expect(back).toMatchObject({ name: "Rosa", base: "neon", colors: t.colors });
    expect(() => importTheme("{quebrado")).toThrow(/JSON/);
    expect(() => importTheme('{"x":1}')).toThrow(/tema da Kira/);
    const bad = JSON.parse(exportTheme(t));
    bad.colors.label = "red; } body { display:none";
    expect(() => importTheme(JSON.stringify(bad))).toThrow(/inválida/);
    bad.colors.label = "#ffffff";
    bad.base = "matrix";
    expect(() => importTheme(JSON.stringify(bad))).toThrow(/base desconhecido/);
    expect(() => importTheme(" ".repeat(5000))).toThrow(/grande/);
  });

  it("validação: tema personalizado precisa existir; apagado = erro", () => {
    const c = cloneConfig(defaultConfig);
    const t = createTheme("glass");
    c.appearance.customThemes = [t];
    c.appearance.theme = customRef(t.id);
    expect(validateConfig(c)).toEqual([]);
    c.appearance.customThemes = [];
    expect(validateConfig(c).some((e) => e.includes("Tema desconhecido"))).toBe(true);
  });

  it("menu: usa as decorações da base, aplica as variáveis e marca theme-custom", () => {
    const t = createTheme("steam", "Bronze");
    const { container } = render(
      <RadialCanvas
        items={defaultProfile.items}
        activeMain={0}
        activeSub={null}
        hubHovered={false}
        stats={null}
        appearance={{ ...defaultConfig.appearance, theme: customRef(t.id), customThemes: [t] }}
      />,
    );
    const svg = container.querySelector("svg")!;
    expect(svg.classList.contains("theme-steam")).toBe(true);
    expect(svg.classList.contains("theme-custom")).toBe(true);
    expect(svg.style.getPropertyValue("--k-slice")).toBe(t.colors.slice);
    expect(screen.getByTestId("steam-back")).toBeTruthy();
  });
});

describe("Aparência › editor de tema", () => {
  let last: Config;
  function Harness() {
    const [c, setC] = useState(() => cloneConfig(defaultConfig));
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

  it("+ Criar tema seleciona o novo tema; mudar cor e base; duplicar; excluir volta à base", () => {
    vi.spyOn(window, "confirm").mockReturnValue(true);
    render(<Harness />);
    fireEvent.click(screen.getByRole("button", { name: /Criar tema/ }));
    const id = last.appearance.customThemes![0].id;
    expect(last.appearance.theme).toBe(customRef(id));
    expect(screen.getByTestId("theme-editor")).toBeTruthy();
    fireEvent.change(screen.getByLabelText("Texto"), { target: { value: "#123456" } });
    expect(last.appearance.customThemes![0].colors.label).toBe("#123456");
    fireEvent.change(screen.getByDisplayValue("Vidro"), { target: { value: "cyber" } });
    expect(last.appearance.customThemes![0].base).toBe("cyber");
    expect(screen.getByRole("radio", { name: last.appearance.customThemes![0].name }).getAttribute("aria-checked")).toBe("true");
    fireEvent.click(screen.getByRole("button", { name: /Duplicar/ }));
    expect(last.appearance.customThemes).toHaveLength(2);
    expect(last.appearance.theme).toBe(customRef(last.appearance.customThemes![1].id));
    fireEvent.click(screen.getByRole("button", { name: /Excluir/ }));
    expect(last.appearance.customThemes).toHaveLength(1);
    expect(last.appearance.theme).toBe("cyber");
    expect(validateConfig(last)).toEqual([]);
  });

  it("importar tema válido adiciona e seleciona; inválido mostra erro", async () => {
    render(<Harness />);
    const exported = exportTheme(createTheme("terminal", "Verde"));
    fireEvent.change(screen.getByPlaceholderText(/kiraTheme/), { target: { value: exported } });
    fireEvent.click(screen.getByRole("button", { name: /Importar/ }));
    expect(last.appearance.customThemes![0].name).toBe("Verde");
    expect(last.appearance.theme).toBe(customRef(last.appearance.customThemes![0].id));
    fireEvent.change(screen.getByPlaceholderText(/kiraTheme/), { target: { value: "{lixo" } });
    await act(async () => fireEvent.click(screen.getByRole("button", { name: /Importar/ })));
    expect(screen.getByRole("status").textContent).toContain("Não foi possível importar");
  });
});

describe("tema personalizado › config editada à mão", () => {
  it("entradas quebradas não derrubam o menu nem a validação", async () => {
    const { customThemeErrors, findCustom, themeVars } = await import("../../shared/customTheme");
    const { validateConfig } = await import("../../shared/validate");
    const { cloneConfig, defaultConfig } = await import("../../shared/defaults");
    const bad = { id: "a", name: 7, base: "glass", colors: { accent: "red", slice: "#112233" } } as never;
    expect(themeVars(bad)).toEqual({ "--k-slice": "#112233" });
    expect(themeVars({ id: "b", name: "x", base: "glass" } as never)).toEqual({});
    expect(customThemeErrors(bad)).toContain("nome vazio.");
    expect(customThemeErrors(null as never)).toEqual(["formato inválido."]);
    expect(findCustom("custom:a", { a: 1 } as never)).toBeUndefined();
    expect(findCustom("custom:a", [null, bad] as never)).toBe(bad);
    const c = cloneConfig(defaultConfig);
    (c.appearance as Record<string, unknown>).customThemes = "x";
    expect(validateConfig(c)).toContain("Temas personalizados em formato inválido.");
    (c.appearance as Record<string, unknown>).customThemes = [null];
    expect(() => validateConfig(c)).not.toThrow();
  });
});
