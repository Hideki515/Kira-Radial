// QA (v0.6.0): config antiga sem docked/cpuAlert continua válida; bordas aceitas pela validação.
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Orb } from "./Orb";
import defaults from "../shared/default-config.json";
import type { Config } from "../shared/types";
import { validateConfig } from "../shared/validate";

describe("QA v0.6.0 ícone encaixado / alerta de CPU", () => {
  it("padrão: sem encaixe e alerta ligado; config antiga sem os campos é válida", () => {
    const c = structuredClone(defaults) as unknown as Config;
    expect(c.launcher.orb.docked).toBeNull();
    expect(c.launcher.orb.cpuAlert).toBe(true);
    expect(validateConfig(c)).toEqual([]);
    delete c.launcher.orb.docked;
    delete c.launcher.orb.cpuAlert;
    expect(validateConfig(c)).toEqual([]);
  });

  it("todas as bordas encaixadas são válidas", () => {
    for (const e of ["left", "right", "top", "bottom"] as const) {
      const c = structuredClone(defaults) as unknown as Config;
      c.launcher.orb.docked = e;
      expect(validateConfig(c)).toEqual([]);
    }
  });

  it("reset (config:changed com docked = null) tira a classe dock-* sem remontar", () => {
    const base = { size: 96, accent: "#ffb03a", opacityIdle: 0.85, onActivate: () => {}, onDragStart: () => {} };
    const { rerender } = render(<Orb {...base} docked="left" />);
    expect(screen.getByTestId("orb-stage").className).toContain("dock-left");
    rerender(<Orb {...base} docked={null} />);
    expect(screen.getByTestId("orb-stage").className).not.toContain("dock-");
  });
});
