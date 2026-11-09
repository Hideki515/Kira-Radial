// Geometria pura do menu radial (sem React) — ângulos em graus, 0° = direita,
// crescendo no sentido horário (eixo Y do SVG aponta para baixo).

export const DEG = Math.PI / 180;

export interface Point {
  x: number;
  y: number;
}

export interface Layout {
  size: number;      // lado do canvas SVG
  hubRadius: number; // disco central
  mainInner: number;
  mainOuter: number;
  subInner: number;
  subOuter: number;
  mainGap: number;   // espaço entre fatias, em px (constante ao longo do raio)
  subGap: number;
  subSpan: number;   // graus por item do sub-anel
  startAngle: number;
}

export const LAYOUT: Layout = {
  size: 900,
  hubRadius: 122,
  mainInner: 140,
  mainOuter: 287,
  subInner: 296,
  subOuter: 368,
  mainGap: 10,
  subGap: 8,
  subSpan: 38,
  startAngle: -90,
};

export function polar(cx: number, cy: number, r: number, angleDeg: number): Point {
  return { x: cx + r * Math.cos(angleDeg * DEG), y: cy + r * Math.sin(angleDeg * DEG) };
}

/** Normaliza para [0, 360). */
export function normalizeAngle(a: number): number {
  return ((a % 360) + 360) % 360;
}

/** Menor diferença assinada b - a, em (-180, 180]. */
export function angleDiff(a: number, b: number): number {
  const d = normalizeAngle(b - a);
  return d > 180 ? d - 360 : d;
}

export function sliceSpan(count: number): number {
  return 360 / count;
}

/** Ângulo central da fatia i (fatia 0 centrada no topo). */
export function sliceAngle(i: number, count: number, start = LAYOUT.startAngle): number {
  return start + i * sliceSpan(count);
}

const f = (n: number) => Number(n.toFixed(2));

/**
 * Path de uma fatia de rosca entre a0 e a1 (graus). `gap` é a largura total em px
 * do espaço entre fatias vizinhas, mantida constante tanto no raio interno quanto no externo.
 */
export function donutSlicePath(
  cx: number, cy: number, rIn: number, rOut: number, a0: number, a1: number, gap = 0,
): string {
  const half = gap / 2;
  const o0 = a0 + half / rOut / DEG;
  const o1 = a1 - half / rOut / DEG;
  const i0 = a0 + half / rIn / DEG;
  const i1 = a1 - half / rIn / DEG;
  const largeOut = o1 - o0 > 180 ? 1 : 0;
  const largeIn = i1 - i0 > 180 ? 1 : 0;
  const p1 = polar(cx, cy, rOut, o0);
  const p2 = polar(cx, cy, rOut, o1);
  const p3 = polar(cx, cy, rIn, i1);
  const p4 = polar(cx, cy, rIn, i0);
  return [
    `M${f(p1.x)} ${f(p1.y)}`,
    `A${rOut} ${rOut} 0 ${largeOut} 1 ${f(p2.x)} ${f(p2.y)}`,
    `L${f(p3.x)} ${f(p3.y)}`,
    `A${rIn} ${rIn} 0 ${largeIn} 0 ${f(p4.x)} ${f(p4.y)}`,
    "Z",
  ].join(" ");
}

/** Ângulos centrais dos itens do sub-anel, centrados no ângulo da fatia pai. */
export function submenuAngles(parentAngle: number, count: number, span = LAYOUT.subSpan): number[] {
  // Nunca deixar o arco passar de 320° (evita sobrepor o próprio início).
  const s = Math.min(span, 320 / Math.max(count, 1));
  const start = parentAngle - (count * s) / 2;
  return Array.from({ length: count }, (_, i) => start + (i + 0.5) * s);
}

export function submenuItemSpan(count: number, span = LAYOUT.subSpan): number {
  return Math.min(span, 320 / Math.max(count, 1));
}

export type Hit =
  | { ring: "center" }
  | { ring: "main"; index: number }
  | { ring: "sub"; index: number };

export interface SubmenuState {
  parentAngle: number;
  count: number;
}

/**
 * Converte a posição do ponteiro (relativa ao centro) em fatia.
 * A seleção é por ângulo: qualquer ponto fora da zona morta escolhe uma fatia,
 * mesmo além do anel — isso torna o menu utilizável por "gesto".
 */
export function hitTest(
  dx: number, dy: number, mainCount: number, deadZone: number,
  sub?: SubmenuState | null, layout: Layout = LAYOUT,
): Hit {
  const r = Math.hypot(dx, dy);
  if (r < deadZone || mainCount === 0) return { ring: "center" };
  const angle = Math.atan2(dy, dx) / DEG;

  if (sub && sub.count > 0 && r >= layout.subInner - 4) {
    const span = submenuItemSpan(sub.count, layout.subSpan);
    const centers = submenuAngles(sub.parentAngle, sub.count, layout.subSpan);
    for (let i = 0; i < centers.length; i++) {
      if (Math.abs(angleDiff(centers[i], angle)) <= span / 2) return { ring: "sub", index: i };
    }
  }

  const span = sliceSpan(mainCount);
  const rel = normalizeAngle(angle - layout.startAngle + span / 2);
  return { ring: "main", index: Math.floor(rel / span) % mainCount };
}
