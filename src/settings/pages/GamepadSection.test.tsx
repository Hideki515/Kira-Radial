import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { afterEach, describe, expect, it } from "vitest";
import { cloneConfig, defaultConfig } from "../../shared/defaults";
import { DEFAULT_GAMEPAD, gamepadOf, type Config } from "../../shared/types";
import { validateConfig } from "../../shared/validate";
import { GamepadSection } from "./GamepadSection";

afterEach(cleanup);

describe("Configurações: controle de videogame (v0.45.0)", () => {
  it("desligado por padrão; ligar mostra a combinação e grava a escolha", () => {
    expect(gamepadOf(defaultConfig)).toEqual(DEFAULT_GAMEPAD);
    expect(DEFAULT_GAMEPAD.enabled).toBe(false);
    let last: Config | null = null;
    function H() {
      const [c, setC] = useState(() => cloneConfig(defaultConfig));
      const update = (fn: (c: Config) => void) =>
        setC((p) => {
          const n = cloneConfig(p);
          fn(n);
          last = n;
          return n;
        });
      return <GamepadSection config={c} update={update} />;
    }
    render(<H />);
    expect(screen.queryByRole("radio", { name: "LB + RB" })).toBeNull();
    fireEvent.click(screen.getByRole("checkbox", { name: "Usar o controle" }));
    expect(last!.gamepad).toEqual({ enabled: true, combo: "lbRb" });
    fireEvent.click(screen.getByRole("radio", { name: "View + Menu" }));
    expect(last!.gamepad).toEqual({ enabled: true, combo: "viewStart" });
    expect(validateConfig(last!)).toEqual([]);
  });

  it("validação recusa combinação desconhecida", () => {
    const c = cloneConfig(defaultConfig);
    c.gamepad = { enabled: true, combo: "abxy" as never };
    expect(validateConfig(c)).toContain("Controle: combinação para abrir o menu desconhecida.");
  });
});
