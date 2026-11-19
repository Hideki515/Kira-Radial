import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { defaultConfig } from "../shared/defaults";
import type { MenuItem } from "../shared/types";
import {
  cachedFit, canvasMeasure, clearLabelCaches, computeFit, fitKey, fontOf, mainPlacement, prewarmLabels,
  setMeasureContextForTests, subPlacement, themeClassOf, type LabelFont,
} from "./labelLayout";

/** Canvas falso: 7 px por letra a 11,5 px (proporcional à fonte), tinta = largura − 1. */
function fakeCtx(opts: { letterSpacing?: boolean; ink?: boolean } = {}) {
  const ctx: Record<string, unknown> = { font: "" };
  if (opts.letterSpacing !== false) ctx.letterSpacing = "0px";
  ctx.measureText = (t: string) => {
    const size = parseFloat(/(\d+(?:\.\d+)?)px/.exec(ctx.font as string)?.[1] ?? "11.5");
    const spacing = parseFloat(String(ctx.letterSpacing ?? "0")) || 0;
    const width = t.length * (7 * (size / 11.5) + spacing);
    return opts.ink === false
      ? { width, actualBoundingBoxLeft: NaN, actualBoundingBoxRight: NaN }
      : { width, actualBoundingBoxLeft: width / 2, actualBoundingBoxRight: width / 2 - 1 };
  };
  return ctx as unknown as CanvasRenderingContext2D;
}

const font: LabelFont = { css: "normal 700 {SIZE}px Segoe UI", size: 11.5, spacing: 0 };

beforeEach(() => clearLabelCaches());
afterEach(() => setMeasureContextForTests(undefined));

describe("medida pelo canvas", () => {
  it("usa a tinta quando há actualBoundingBox; senão a largura de avanço", () => {
    setMeasureContextForTests(fakeCtx());
    expect(canvasMeasure(font)!("ABCDE", 1)).toBeCloseTo(34);
    setMeasureContextForTests(fakeCtx({ ink: false }));
    expect(canvasMeasure(font)!("ABCDE", 1)).toBeCloseTo(35);
  });

  it("letter-spacing: nativo no canvas ou somado à mão", () => {
    const f = { ...font, spacing: 2 };
    setMeasureContextForTests(fakeCtx({ ink: false }));
    expect(canvasMeasure(f)!("AB", 1)).toBeCloseTo(18); // (7+2)×2
    setMeasureContextForTests(fakeCtx({ ink: false, letterSpacing: false }));
    expect(canvasMeasure(f)!("AB", 1)).toBeCloseTo(18);
  });

  it("sem canvas devolve null", () => {
    setMeasureContextForTests(null);
    expect(canvasMeasure(font)).toBeNull();
  });
});

describe("cache e pré-cálculo", () => {
  it("computeFit guarda e reaproveita pelo mesmo key", () => {
    setMeasureContextForTests(fakeCtx());
    const p = mainPlacement(0, 8);
    const key = fitKey("radial-canvas theme-glass", "main", "DEV", p.x, p.y, p.sector);
    expect(cachedFit(key)).toBeUndefined();
    const a = computeFit(key, "DEV", "main", p.x, p.y, p.sector, font, canvasMeasure(font)!);
    expect(a).toEqual({ lines: ["DEV"], scale: 1, base: 11.5, dx: [0] });
    expect(cachedFit(key)).toBe(a);
    // Mesma chave: devolve o guardado, sem medir de novo.
    expect(computeFit(key, "DEV", "main", p.x, p.y, p.sector, font, () => 9999)).toBe(a);
  });

  it("fontOf lê o estilo uma vez por tema e tamanho", () => {
    const el = document.createElementNS("http://www.w3.org/2000/svg", "text");
    el.setAttribute("style", "font-size: 13px; letter-spacing: 1px");
    document.body.appendChild(el);
    const f = fontOf("radial-canvas theme-x", "main", el);
    expect(f.size).toBe(13);
    expect(f.spacing).toBe(1);
    el.setAttribute("style", "font-size: 30px");
    expect(fontOf("radial-canvas theme-x", "main", el)).toBe(f);
    el.remove();
  });

  it("prewarmLabels calcula fatias e subitens fixos de todos os perfis; repetir não recalcula", () => {
    setMeasureContextForTests(fakeCtx());
    const items: MenuItem[] = [
      { id: "a", label: "Dev", icon: "code", action: { type: "openSettings" } },
      { id: "b", label: "Apps", icon: "app-window", action: { type: "openSettings" } },
      { id: "x", label: "Microfone mutado", icon: "mic", children: [{ id: "c", label: "Ensurdecido", icon: "mic" }] },
    ];
    const theme = themeClassOf(defaultConfig.appearance);
    const n = prewarmLabels(theme, [{ items }, { items: items.slice(0, 1) }]);
    expect(n).toBe(5); // 3 fatias (perfil 1) + 1 subitem + 1 fatia (perfil 2, posição diferente)
    expect(prewarmLabels(theme, [{ items }])).toBe(0);
    const s = subPlacement(-90 + (360 / 3) * 2, 0, 1);
    expect(cachedFit(fitKey(theme, "sub", "ENSURDECIDO", s.x, s.y, s.sector))).toBeDefined();
    expect(document.querySelectorAll("svg[aria-hidden]").length).toBe(0);
  });
});
