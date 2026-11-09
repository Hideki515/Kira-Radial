import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { afterEach, describe, expect, it } from "vitest";
import { cloneConfig, defaultConfig } from "../../shared/defaults";
import { HOLO_ACCENT, SCALE_LIMITS, type Config } from "../../shared/types";
import { validateConfig } from "../../shared/validate";
import { AppearancePage, applyTheme } from "./SimplePages";

afterEach(cleanup);

function Harness({ onChange }: { onChange: (c: Config) => void }) {
  const [c, setC] = useState(() => cloneConfig(defaultConfig));
  const update = (fn: (c: Config) => void) =>
    setC((prev) => {
      const next = cloneConfig(prev);
      fn(next);
      onChange(next);
      return next;
    });
  return <AppearancePage config={c} update={update} />;
}

describe("Aparência › tema", () => {
  it("padrão é Vidro; escolher Holográfico troca tema e cor âmbar", () => {
    let last: Config | null = null;
    render(<Harness onChange={(c) => (last = c)} />);
    expect(screen.getByRole("radio", { name: "Vidro" }).getAttribute("aria-checked")).toBe("true");
    fireEvent.click(screen.getByRole("radio", { name: "Holográfico" }));
    expect(last!.appearance.theme).toBe("holo");
    expect(last!.appearance.accent).toBe(HOLO_ACCENT);
    expect(screen.getByRole("radio", { name: "Holográfico" }).getAttribute("aria-checked")).toBe("true");
    fireEvent.click(screen.getByRole("radio", { name: "Vidro" }));
    expect(last!.appearance.theme).toBe("glass");
    expect(last!.appearance.accent).toBe(defaultConfig.appearance.accent);
  });

  it("não sobrescreve cor personalizada", () => {
    const c = cloneConfig(defaultConfig);
    c.appearance.accent = "#43c7d9";
    applyTheme(c, "holo");
    expect(c.appearance.theme).toBe("holo");
    expect(c.appearance.accent).toBe("#43c7d9");
  });

  it("validação aceita temas conhecidos e config antiga sem tema", () => {
    const c = cloneConfig(defaultConfig);
    expect(validateConfig(c)).toEqual([]);
    c.appearance.theme = "holo";
    expect(validateConfig(c)).toEqual([]);
    (c.appearance as { theme: string }).theme = "matrix";
    expect(validateConfig(c).some((e) => e.includes("Tema"))).toBe(true);
  });

  it("controle de tamanho cobre exatamente a faixa aceita pela validação", () => {
    render(<Harness onChange={() => {}} />);
    const slider = screen.getByLabelText(/Tamanho:/) as HTMLInputElement;
    expect(Number(slider.min)).toBe(SCALE_LIMITS.min);
    expect(Number(slider.max)).toBe(SCALE_LIMITS.max);
    const c = cloneConfig(defaultConfig);
    c.appearance.scale = SCALE_LIMITS.max;
    expect(validateConfig(c)).toEqual([]);
    c.appearance.scale = SCALE_LIMITS.max + 0.05;
    expect(validateConfig(c).some((e) => e.includes("Tamanho do menu"))).toBe(true);
  });
});
