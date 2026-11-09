import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { afterEach, describe, expect, it } from "vitest";
import { cloneConfig, defaultConfig, withDefaults } from "../../shared/defaults";
import type { Config } from "../../shared/types";
import { validateConfig } from "../../shared/validate";
import { HotkeyPage } from "./SimplePages";

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
  return <HotkeyPage config={c} update={update} />;
}

describe("Abrir o menu por (atalho / ícone / ambos)", () => {
  it("padrão é Atalho; Ícone desliga o gravador; Ícone + atalho volta a mostrá-lo", () => {
    let last: Config | null = null;
    render(<Harness onChange={(c) => (last = c)} />);
    expect(screen.getByRole("radio", { name: "Atalho" }).getAttribute("aria-checked")).toBe("true");
    expect(screen.queryByTestId("hotkey-off")).toBeNull();

    fireEvent.click(screen.getByRole("radio", { name: "Ícone" }));
    expect(last!.launcher.mode).toBe("orb");
    expect(screen.getByTestId("hotkey-off")).toBeTruthy();
    expect(screen.queryByRole("radio", { name: "Segurar e soltar" })).toBeNull();

    fireEvent.click(screen.getByRole("radio", { name: "Ícone + atalho" }));
    expect(last!.launcher.mode).toBe("both");
    expect(screen.queryByTestId("hotkey-off")).toBeNull();
    expect(screen.getByRole("radio", { name: "Segurar e soltar" })).toBeTruthy();
  });
});

describe("validação do lançador", () => {
  it("modo só ícone aceita atalho inválido; com atalho, não", () => {
    const c = cloneConfig(defaultConfig);
    c.hotkey.accelerator = "nada";
    expect(validateConfig(c).some((e) => e.includes("Atalho inválido"))).toBe(true);
    c.launcher.mode = "orb";
    expect(validateConfig(c)).toEqual([]);
    c.launcher.mode = "both";
    expect(validateConfig(c).some((e) => e.includes("Atalho inválido"))).toBe(true);
  });

  it("limites de tamanho/opacidade e modo desconhecido", () => {
    const c = cloneConfig(defaultConfig);
    c.launcher.orb.size = 10;
    c.launcher.orb.opacityIdle = 0.1;
    (c.launcher as { mode: string }).mode = "telepatia";
    const errs = validateConfig(c);
    expect(errs.some((e) => e.includes("Tamanho do ícone"))).toBe(true);
    expect(errs.some((e) => e.includes("Opacidade do ícone"))).toBe(true);
    expect(errs.some((e) => e.includes("Modo de abertura"))).toBe(true);
  });

  it("config antiga sem launcher ganha os padrões e continua válida", () => {
    const old = cloneConfig(defaultConfig) as Partial<Config>;
    delete old.launcher;
    const c = withDefaults(old as Config);
    expect(c.launcher).toEqual(defaultConfig.launcher);
    expect(validateConfig(c)).toEqual([]);
    // Parcial: mantém o que veio e completa o resto.
    const partial = withDefaults({ ...(old as Config), launcher: { mode: "both", orb: { size: 120 } } as unknown as Config["launcher"] });
    expect(partial.launcher.mode).toBe("both");
    expect(partial.launcher.orb.size).toBe(120);
    expect(partial.launcher.orb.opacityIdle).toBe(defaultConfig.launcher.orb.opacityIdle);
  });
});
