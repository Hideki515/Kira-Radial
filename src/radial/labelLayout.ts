// Ajuste dos rótulos às fatias, compartilhado entre as fatias (SliceContent) e o pré-cálculo
// em segundo plano (prewarmLabels): ao abrir o menu, o ajuste já está pronto no cache e sai
// na primeira renderização (sem medir nem renderizar de novo no caminho de abertura).
import { findCustom } from "../shared/customTheme";
import { THEMES, type Config, type MenuItem, type Theme } from "../shared/types";
import { LAYOUT, polar, sliceAngle, sliceSpan, submenuAngles, submenuItemSpan, textBand, type Sector } from "./geometry";
import { fitLabel, type LabelFit, type Measure } from "./labelFit";

export type LabelSize = "main" | "sub";

/** Altura de cada linha do rótulo, em relação ao tamanho da fonte. */
export const LINE_H = 1.15;
/** Distância (px) do centro do conteúdo até a linha de base do rótulo. */
export const LABEL_OFFSET: Record<LabelSize, number> = { main: 22, sub: 18 };
/** Folga (px) antes de deslocar um texto que "quase" cabe centrado. */
const SHIFT_TOLERANCE = 1.5;

export interface Fit extends LabelFit {
  /** Tamanho da fonte do tema (px) quando foi medido. */
  base: number;
  /** Deslocamento horizontal de cada linha (aproveita o trecho livre da fatia inclinada). */
  dx: number[];
}

export interface LabelFont {
  css: string;
  size: number;
  /** letter-spacing em px no tamanho do tema (0 = normal). */
  spacing: number;
}

const fitCache = new Map<string, Fit>();
const fontCache = new Map<string, LabelFont>();
const MAX_CACHE = 1500;

/** Classe do <svg> do menu para a aparência (a mesma que o RadialCanvas usa). */
export function themeClassOf(appearance: Config["appearance"]): string {
  const custom = findCustom(appearance.theme, appearance.customThemes);
  const wanted = custom ? custom.base : appearance.theme ?? "glass";
  const theme: Theme = THEMES.includes(wanted as Theme) ? (wanted as Theme) : "glass";
  return `radial-canvas theme-${theme}${custom ? " theme-custom" : ""}`;
}

export function fitKey(themeClass: string, size: LabelSize, text: string, x: number, y: number, s: Sector): string {
  return [themeClass, size, text, x.toFixed(1), y.toFixed(1), s.a0.toFixed(2), s.a1.toFixed(2), s.rIn, s.rOut].join("|");
}

export function cachedFit(key: string): Fit | undefined {
  return fitCache.get(key);
}

export function clearLabelCaches(): void {
  fitCache.clear();
  fontCache.clear();
}

/** Fonte do rótulo no tema, lida (uma vez) do estilo calculado de um <text> do rótulo. */
export function fontOf(themeClass: string, size: LabelSize, el: Element): LabelFont {
  const key = `${themeClass}|${size}`;
  let f = fontCache.get(key);
  if (!f) {
    const cs = getComputedStyle(el);
    const fsz = parseFloat(cs.fontSize) || (size === "main" ? 13.5 : 11.5);
    f = { css: `${cs.fontStyle} ${cs.fontWeight} {SIZE}px ${cs.fontFamily}`, size: fsz, spacing: parseFloat(cs.letterSpacing) || 0 };
    fontCache.set(key, f);
  }
  return f;
}

let canvasCtx: CanvasRenderingContext2D | null | undefined;
function measureCtx(): CanvasRenderingContext2D | null {
  if (canvasCtx === undefined) {
    const jsdom = typeof navigator !== "undefined" && /jsdom/i.test(navigator.userAgent);
    canvasCtx = jsdom || typeof document === "undefined" ? null : (document.createElement("canvas").getContext("2d") ?? null);
  }
  return canvasCtx;
}

/**
 * Medida pela tinta das letras (canvas: não mexe no layout da página). `null` sem canvas
 * (testes): quem chama mede de outro jeito.
 */
export function canvasMeasure(font: LabelFont): Measure | null {
  const ctx = measureCtx();
  if (!ctx) return null;
  const c = ctx as CanvasRenderingContext2D & { letterSpacing?: string };
  return (t: string, s: number) => {
    c.font = font.css.replace("{SIZE}", (font.size * s).toFixed(2));
    const extra = font.spacing * s;
    const native = typeof c.letterSpacing === "string";
    if (native) c.letterSpacing = `${extra}px`;
    const m = c.measureText(t);
    const ink = m.actualBoundingBoxLeft + m.actualBoundingBoxRight;
    // Tinta (sem o espaçamento depois da última letra); sem esses dados, a largura de avanço.
    if (Number.isFinite(ink) && ink > 0) return ink + (native ? 0 : extra * Math.max(0, t.length - 1));
    return m.width + (native ? 0 : extra * t.length);
  };
}

/** Deslocamento mínimo para um texto de largura `w` caber na faixa (0 se já cabe centrado). */
export function minimalShift(w: number, left: number, right: number, maxShift = 18): number {
  const half = w / 2 - SHIFT_TOLERANCE;
  if (half <= left && half <= right) return 0;
  const dx = right > left ? half - left : -(half - right);
  return Math.max(-maxShift, Math.min(maxShift, dx));
}

/** Calcula (e guarda) o ajuste de um rótulo. */
export function computeFit(
  key: string, text: string, size: LabelSize, x: number, y: number, sector: Sector, font: LabelFont, measure: Measure,
): Fit {
  const hit = fitCache.get(key);
  if (hit) return hit;
  const base = font.size;
  const bands = new Map<string, ReturnType<typeof textBand>>();
  const band = (line: number, lines: number, s: number) => {
    const k = `${line}|${lines}|${s}`;
    let b = bands.get(k);
    if (!b) {
      const fs = base * s;
      const lh = fs * LINE_H;
      const baseline = y + LABEL_OFFSET[size] - ((lines - 1) * lh) / 2 + line * lh;
      // Topo e base das letras (maiúsculas): o texto inteiro precisa caber.
      b = textBand(sector, x, baseline - fs * 0.75, baseline + fs * 0.1);
      bands.set(k, b);
    }
    return b;
  };
  const fitted = fitLabel(text, measure, (line, lines, s) => band(line, lines, s).width);
  // Desloca só se o texto não couber centrado, e só o necessário (nomes curtos não se mexem).
  const dx = fitted.lines.map((l, i) => {
    const b = band(i, fitted.lines.length, fitted.scale);
    return Math.round(minimalShift(measure(l, fitted.scale), b.left, b.right));
  });
  const r: Fit = { ...fitted, base, dx };
  if (fitCache.size >= MAX_CACHE) fitCache.clear();
  fitCache.set(key, r);
  return r;
}

// --- Posições (as mesmas de MainSlice e SubmenuRing) ---

export function mainPlacement(index: number, count: number): { x: number; y: number; sector: Sector } {
  const c = LAYOUT.size / 2;
  const angle = sliceAngle(index, count);
  const span = sliceSpan(count);
  const mid = polar(c, c, (LAYOUT.mainInner + LAYOUT.mainOuter) / 2 + 12, angle);
  return { ...mid, sector: { cx: c, cy: c, rIn: LAYOUT.mainInner, rOut: LAYOUT.mainOuter, a0: angle - span / 2, a1: angle + span / 2, gap: LAYOUT.mainGap } };
}

export function subPlacement(parentAngle: number, index: number, count: number): { x: number; y: number; sector: Sector } {
  const c = LAYOUT.size / 2;
  const span = submenuItemSpan(count);
  const a = submenuAngles(parentAngle, count)[index];
  const mid = polar(c, c, (LAYOUT.subInner + LAYOUT.subOuter) / 2 + 3, a);
  return { ...mid, sector: { cx: c, cy: c, rIn: LAYOUT.subInner, rOut: LAYOUT.subOuter, a0: a - span / 2, a1: a + span / 2, gap: LAYOUT.subGap } };
}

/**
 * Pré-calcula, fora do caminho de abertura, o ajuste de todos os rótulos conhecidos (fatias
 * e subitens fixos de todos os perfis) para o tema atual. Devolve quantos calculou.
 */
export function prewarmLabels(themeClass: string, profiles: { items: MenuItem[] }[]): number {
  if (typeof document === "undefined" || !measureCtx()) return 0;
  // <svg> fora da tela com a classe do tema, só para ler a fonte dos rótulos.
  const NS = "http://www.w3.org/2000/svg";
  const svg = document.createElementNS(NS, "svg");
  svg.setAttribute("class", themeClass);
  svg.setAttribute("aria-hidden", "true");
  svg.style.cssText = "position:absolute;left:-10000px;top:0;width:1px;height:1px;visibility:hidden";
  const fonts = {} as Record<LabelSize, LabelFont>;
  document.body.appendChild(svg);
  try {
    for (const size of ["main", "sub"] as LabelSize[]) {
      const t = document.createElementNS(NS, "text");
      t.setAttribute("class", `slice-label slice-label--${size}`);
      svg.appendChild(t);
      fonts[size] = fontOf(themeClass, size, t);
    }
  } finally {
    svg.remove();
  }
  let n = 0;
  const one = (label: string, size: LabelSize, p: { x: number; y: number; sector: Sector }) => {
    const text = label.toUpperCase();
    const key = fitKey(themeClass, size, text, p.x, p.y, p.sector);
    if (cachedFit(key)) return;
    const m = canvasMeasure(fonts[size]);
    if (!m) return;
    computeFit(key, text, size, p.x, p.y, p.sector, fonts[size], m);
    n++;
  };
  for (const profile of profiles) {
    const items = profile.items;
    items.forEach((it, i) => {
      one(it.label, "main", mainPlacement(i, items.length));
      const kids = it.children ?? [];
      const parentAngle = sliceAngle(i, items.length);
      kids.forEach((k, j) => one(k.label, "sub", subPlacement(parentAngle, j, kids.length)));
    });
  }
  return n;
}
