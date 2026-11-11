import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { useState } from "react";
import { afterEach, describe, expect, it } from "vitest";
import { cloneConfig, defaultConfig } from "../shared/defaults";
import type { Config, OrbAnimation } from "../shared/types";
import { validateConfig } from "../shared/validate";
import { IconPage } from "../settings/pages/IconPage";
import { Orb } from "./Orb";

afterEach(cleanup);

const noop = () => {};
const orb = (animation?: OrbAnimation, hot = false) =>
  render(<Orb size={96} accent="#4ade9b" opacityIdle={0.85} imageSrc={null} docked={null} hot={hot} animation={animation} onActivate={noop} onDragStart={noop} />);

describe("ícone › animação", () => {
  it("classe anim-* no palco (padrão: full)", () => {
    orb();
    expect(screen.getByTestId("orb-stage").classList.contains("anim-full")).toBe(true);
    cleanup();
    orb("hover");
    expect(screen.getByTestId("orb-stage").classList.contains("anim-hover")).toBe(true);
    cleanup();
    orb("off", true);
    expect(screen.getByTestId("orb-stage").classList.contains("anim-off")).toBe(true);
    expect(screen.getByTestId("orb").classList.contains("is-hot")).toBe(true);
  });

  it("CSS: hover/off pausam as animações, exceto com CPU alta; animações limitadas por steps()", () => {
    const css = readFileSync("src/styles/orb.css", "utf8");
    expect(css).toMatch(/\.anim-hover \.orb:not\(:hover\):not\(\.is-hot\)[^{]*\{ animation-play-state: paused; \}/s);
    expect(css).toMatch(/\.anim-off \.orb:not\(\.is-hot\)/);
    // Nenhuma animação contínua do orbe a 60 quadros/s (linear/ease infinitos).
    expect(css).not.toMatch(/(linear|ease-in-out) infinite/);
    const settings = readFileSync("src/styles/settings.css", "utf8");
    expect(settings).toMatch(/\.theme-thumb \* \{ animation-play-state: paused !important; \}/);
  });

  it("Configurações › Ícone: escolher grava launcher.orb.animation; valor inválido é erro", () => {
    let cfg: Config = cloneConfig(defaultConfig);
    cfg.launcher.mode = "orb";
    function Page() {
      const [c, setC] = useState(cfg);
      const update = (fn: (c: Config) => void) => setC((p) => { const n = cloneConfig(p); fn(n); cfg = n; return n; });
      return <IconPage config={c} update={update} goToLauncher={() => {}} />;
    }
    render(<Page />);
    const pick = (t: RegExp) => fireEvent.click(screen.getAllByRole("radio").find((b) => t.test(b.textContent ?? ""))!);
    pick(/Só ao passar o mouse/);
    expect(cfg.launcher.orb.animation).toBe("hover");
    pick(/^Parado$/);
    expect(cfg.launcher.orb.animation).toBe("off");
    expect(validateConfig(cfg)).toEqual([]);
    (cfg.launcher.orb as { animation: string }).animation = "turbo";
    expect(validateConfig(cfg).some((e) => e.includes("Animação do ícone"))).toBe(true);
  });
});
