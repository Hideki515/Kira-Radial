import { cleanup, render } from "@testing-library/react";
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { LAYOUT, horizontalRoom, insideSector, textBand, type Sector } from "./geometry";
import { fitLabel, splitTwo, type Measure, type Room } from "./labelFit";
import { SliceContent } from "./SliceContent";

afterEach(cleanup);

const C = LAYOUT.size / 2;
/** Sub-anel: item de 38° numa diagonal (como "Microfone mutado" no canto superior esquerdo). */
const diag: Sector = { cx: C, cy: C, rIn: LAYOUT.subInner, rOut: LAYOUT.subOuter, a0: -154, a1: -116, gap: LAYOUT.subGap };
/** Fatia principal no topo (8 fatias). */
const top: Sector = { cx: C, cy: C, rIn: LAYOUT.mainInner, rOut: LAYOUT.mainOuter, a0: -112.5, a1: -67.5, gap: LAYOUT.mainGap };

describe("espaço livre dentro da fatia", () => {
  it("fora da fatia é 0; dentro é simétrico e menor que a fatia", () => {
    expect(insideSector(top, C, C - 220, 6)).toBe(true);
    expect(insideSector(top, C, C - 100, 6)).toBe(false); // no centro (hub)
    expect(horizontalRoom(top, C, C - 100)).toBe(0);
    const wTop = horizontalRoom(top, C, C - 240);
    expect(wTop).toBeGreaterThan(100);
    expect(wTop).toBeLessThan(2 * 240 * Math.tan((22.5 * Math.PI) / 180));
  });

  it("fatia na diagonal do sub-anel tem pouco espaço na horizontal", () => {
    const a = (-135 * Math.PI) / 180;
    const r = (LAYOUT.subInner + LAYOUT.subOuter) / 2;
    const room = horizontalRoom(diag, C + r * Math.cos(a), C + r * Math.sin(a) + 18);
    expect(room).toBeGreaterThan(20);
    expect(room).toBeLessThan(110);
  });
});

describe("faixa do texto na fatia inclinada", () => {
  it("desloca o centro para o trecho livre e ganha largura", () => {
    const a = (-135 * Math.PI) / 180;
    const r = (LAYOUT.subInner + LAYOUT.subOuter) / 2;
    const x = C + r * Math.cos(a);
    const y = C + r * Math.sin(a) + 18;
    const band = textBand(diag, x, y - 9, y + 1);
    expect(band.dx).not.toBe(0);
    expect(Math.abs(band.dx)).toBeLessThanOrEqual(18);
    expect(band.width).toBeGreaterThan(Math.min(horizontalRoom(diag, x, y - 9), horizontalRoom(diag, x, y + 1)));
  });
});

describe("escolha do ajuste", () => {
  // Fonte de mentira: 7 px por letra × escala.
  const measure: Measure = (t, s) => t.length * 7 * s;
  const room = (w: number): Room => () => w;

  it("cabe → igual; pouco maior → fonte menor; muito maior → duas linhas; sem espaço → reticências", () => {
    expect(fitLabel("DEV", measure, room(100))).toEqual({ lines: ["DEV"], scale: 1 });
    expect(fitLabel("ENSURDECIDO", measure, room(70))).toEqual({ lines: ["ENSURDECIDO"], scale: 0.88 });
    expect(fitLabel("MICROFONE MUTADO", measure, room(70))).toEqual({ lines: ["MICROFONE", "MUTADO"], scale: 0.9 });
    const cut = fitLabel("SUPERCALIFRAGILISTICO", measure, room(60));
    expect(cut.lines).toHaveLength(1);
    expect(cut.lines[0].endsWith("…")).toBe(true);
    expect(measure(cut.lines[0], cut.scale)).toBeLessThanOrEqual(60);
  });

  it("divide no espaço mais equilibrado", () => {
    expect(splitTwo("MICROFONE MUTADO")).toEqual(["MICROFONE", "MUTADO"]);
    expect(splitTwo("ABRIR A PASTA DE DOWNLOADS")).toEqual(["ABRIR A PASTA", "DE DOWNLOADS"]);
    expect(splitTwo("SOZINHO")).toBeNull();
  });
});

describe("rótulo dentro da fatia (SVG)", () => {
  beforeAll(() => {
    // jsdom não mede texto nem aplica o CSS ao SVG (a fonte "do tema" vem 16 px): ~7 px por
    // letra na escala 1, proporcional à fonte inline.
    (SVGElement.prototype as unknown as { getComputedTextLength: () => number }).getComputedTextLength = function (this: SVGElement) {
      const fs = parseFloat((this as SVGElement & { style: CSSStyleDeclaration }).style.fontSize) || 11.5;
      return (this.textContent ?? "").length * fs * 0.45;
    };
  });

  function draw(label: string, sector: Sector, size: "main" | "sub" = "sub") {
    const a = (((sector.a0 + sector.a1) / 2) * Math.PI) / 180;
    const r = (sector.rIn + sector.rOut) / 2;
    return render(
      <svg className="radial-canvas theme-glass">
        <style>{".slice-label--sub{font-size:11.5px}.slice-label--main{font-size:13.5px}"}</style>
        <SliceContent x={C + r * Math.cos(a)} y={C + r * Math.sin(a)} icon="mic" label={label} size={size} sector={sector} />
      </svg>,
    );
  }

  it("texto curto fica igual; texto longo na diagonal vira duas linhas com tspan", () => {
    const short = draw("Dev", top, "main").container.querySelector(".slice-label:not([visibility])")!;
    expect(short.textContent).toBe("DEV");
    expect(short.getAttribute("data-fit")).toBe("1:1");
    cleanup();
    const long = draw("Microfone mutado", diag).container.querySelector(".slice-label:not([visibility])")!;
    const spans = [...long.querySelectorAll("tspan")].map((t) => t.textContent);
    expect(spans).toEqual(["MICROFONE", "MUTADO"]);
  });

  it("sem ajuste possível corta com … e guarda o nome inteiro na dica", () => {
    const el = draw("Superintendenciaregional", diag).container.querySelector(".slice-label:not([visibility])")!;
    expect(el.textContent!.includes("…")).toBe(true);
    expect(el.querySelector("title")!.textContent).toBe("SUPERINTENDENCIAREGIONAL");
  });
});

describe("deslocamento mínimo", () => {
  it("cabe centrado (com tolerância) → 0; senão só o necessário, para o lado mais largo, com limite", async () => {
    const { minimalShift } = await import("./SliceContent");
    expect(minimalShift(40, 30, 50)).toBe(0);
    // Tolerância de 1,5 px: "quase cabe" não desloca; senão desloca só o que falta.
    expect(minimalShift(62, 30, 50)).toBe(0);
    expect(minimalShift(70, 30, 50)).toBe(3.5);
    expect(minimalShift(70, 50, 30)).toBe(-3.5);
    expect(minimalShift(200, 10, 300)).toBe(18);
  });
});

describe("pré-cálculo e cache", () => {
  it("a mesma classe de tema do RadialCanvas; prewarm sem canvas (jsdom) não faz nada", async () => {
    const { themeClassOf, prewarmLabels } = await import("./labelLayout");
    expect(themeClassOf({ theme: "terminal" } as never)).toBe("radial-canvas theme-terminal");
    expect(themeClassOf({ theme: "nao-existe" } as never)).toBe("radial-canvas theme-glass");
    expect(prewarmLabels("radial-canvas theme-glass", [{ items: [] }])).toBe(0);
  });

  it("posições do pré-cálculo batem com as fatias desenhadas", async () => {
    const { mainPlacement, subPlacement } = await import("./labelLayout");
    const m = mainPlacement(0, 8);
    expect(m.sector.a0).toBeCloseTo(-112.5);
    expect(m.x).toBeCloseTo(C);
    const s = subPlacement(-90, 0, 2);
    expect(s.sector.rIn).toBe(LAYOUT.subInner);
    expect(s.sector.a1 - s.sector.a0).toBeCloseTo(38);
  });
});
