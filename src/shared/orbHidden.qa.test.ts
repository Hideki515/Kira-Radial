import { describe, expect, it } from "vitest";
import { cloneConfig, defaultConfig, withDefaults } from "./defaults";
import type { Config } from "./types";
import { validateConfig } from "./validate";

// QA v0.3.5 (0.2): configs gravadas antes de existir launcher.orb.hidden continuam válidas.
describe("QA › config antiga sem launcher.orb.hidden", () => {
  it("withDefaults completa hidden=false e a validação aceita", () => {
    const c = cloneConfig(defaultConfig);
    delete (c.launcher.orb as Partial<Config["launcher"]["orb"]>).hidden;
    expect(validateConfig(c)).toEqual([]);
    const full = withDefaults(c);
    expect(full.launcher.orb.hidden).toBe(false);
    expect(validateConfig(full)).toEqual([]);
  });

  it("hidden=true salvo é preservado por withDefaults", () => {
    const c = cloneConfig(defaultConfig);
    c.launcher.orb.hidden = true;
    expect(withDefaults(c).launcher.orb.hidden).toBe(true);
  });
});
