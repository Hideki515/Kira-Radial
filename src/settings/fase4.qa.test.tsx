// QA v0.7.0 (Fase 4): compatibilidade de configs antigas e tema desconhecido.
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cloneConfig, defaultConfig } from "../shared/defaults";
import { THEME_ACCENT, type Config } from "../shared/types";
import { validateConfig } from "../shared/validate";
import { DEFAULT_SOUNDS, playSound, soundsOf } from "../shared/sound";
import { AppearancePage, applyTheme } from "./pages/SimplePages";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("QA v0.7.0", () => {
  it("config antiga (glass/holo, sem sounds) continua válida e sem som", async () => {
    for (const theme of [undefined, "glass", "holo"] as const) {
      const c = cloneConfig(defaultConfig);
      delete (c.appearance as { sounds?: unknown }).sounds;
      if (theme) c.appearance.theme = theme;
      else delete (c.appearance as { theme?: unknown }).theme;
      expect(validateConfig(c)).toEqual([]);
      expect(soundsOf(c.appearance.sounds).enabled).toBe(false);
    }
    expect(DEFAULT_SOUNDS.enabled).toBe(false);
    const AC = vi.fn();
    vi.stubGlobal("AudioContext", AC);
    await playSound("open", undefined);
    await playSound("hover", { enabled: true, volume: 1 } as never);
    expect(AC).not.toHaveBeenCalled();
  });

  it("volume fora de 0–1 é rejeitado", () => {
    const c = cloneConfig(defaultConfig);
    c.appearance.sounds = { ...DEFAULT_SOUNDS, volume: 1.5 };
    expect(validateConfig(c).some((e) => e.includes("Volume"))).toBe(true);
    c.appearance.sounds.volume = 0;
    expect(validateConfig(c)).toEqual([]);
  });

  it("applyTheme a partir de tema desconhecido não quebra", () => {
    const c = cloneConfig(defaultConfig);
    (c.appearance as { theme: string }).theme = "matrix";
    expect(() => applyTheme(c, "reactor")).not.toThrow();
    expect(c.appearance.theme).toBe("reactor");
  });

  it("Aparência com tema desconhecido renderiza e permite escolher um válido", () => {
    let c: Config = cloneConfig(defaultConfig);
    (c.appearance as { theme: string }).theme = "matrix";
    const update = (fn: (c: Config) => void) => {
      const n = cloneConfig(c);
      fn(n);
      c = n;
    };
    render(<AppearancePage config={c} update={update} />);
    expect(() => fireEvent.click(screen.getByRole("radio", { name: "Terminal" }))).not.toThrow();
    expect(c.appearance.theme).toBe("terminal");
    expect(THEME_ACCENT.terminal).toBe("#39ff6a");
  });
});
