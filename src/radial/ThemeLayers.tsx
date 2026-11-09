/**
 * Camadas decorativas dos temas "Arc Reactor" e "Terminal" (o holográfico fica em HoloLayer).
 * Só formas estáticas + animações de transform/opacity; nada captura o ponteiro.
 */
import { LAYOUT, polar } from "./geometry";

const C = LAYOUT.size / 2;

function arc(r: number, a0: number, a1: number): string {
  const p0 = polar(C, C, r, a0);
  const p1 = polar(C, C, r, a1);
  return `M${p0.x.toFixed(2)} ${p0.y.toFixed(2)} A${r} ${r} 0 0 1 ${p1.x.toFixed(2)} ${p1.y.toFixed(2)}`;
}

/** `n` segmentos iguais de um anel, com `gap` graus entre eles. */
function segments(r: number, n: number, gap: number): string[] {
  const step = 360 / n;
  return Array.from({ length: n }, (_, i) => arc(r, i * step + gap / 2 - 90, (i + 1) * step - gap / 2 - 90));
}

const OUTER_SEGS = segments(LAYOUT.subOuter + 22, 12, 6);
const MID_SEGS = segments(LAYOUT.subOuter + 40, 36, 4);
const COILS = segments((LAYOUT.hubRadius + LAYOUT.mainInner) / 2 - 2, 10, 8);

/** Arc Reactor — atrás do anel: brilho central, anel segmentado e anel de "dentes". */
export function ReactorBack() {
  return (
    <g className="reactor reactor-back" data-testid="reactor-back" aria-hidden="true">
      <defs>
        <radialGradient id="reactor-glow" cx={C} cy={C} r={LAYOUT.subOuter + 60} gradientUnits="userSpaceOnUse">
          <stop offset="0" className="reactor-glow-in" />
          <stop offset="0.55" className="reactor-glow-mid" />
          <stop offset="1" className="reactor-glow-out" />
        </radialGradient>
      </defs>
      <circle cx={C} cy={C} r={LAYOUT.subOuter + 60} fill="url(#reactor-glow)" />
      <circle cx={C} cy={C} r={LAYOUT.subOuter + 10} className="reactor-thin" />
      <g className="reactor-spin reactor-spin--slow">
        {OUTER_SEGS.map((d, i) => <path key={i} d={d} className="reactor-seg" />)}
      </g>
      <g className="reactor-spin reactor-spin--rev">
        {MID_SEGS.map((d, i) => <path key={i} d={d} className="reactor-tooth" />)}
      </g>
      <circle cx={C} cy={C} r={LAYOUT.subOuter + 52} className="reactor-thin reactor-thin--faint" />
    </g>
  );
}

/** Arc Reactor — sobre o hub: bobinas em volta do núcleo e um aro brilhante. */
export function ReactorFront() {
  return (
    <g className="reactor reactor-front" aria-hidden="true">
      <g className="reactor-spin reactor-spin--coils">
        {COILS.map((d, i) => <path key={i} d={d} className="reactor-coil" />)}
      </g>
      <circle cx={C} cy={C} r={LAYOUT.hubRadius + 1} className="reactor-rim" />
    </g>
  );
}

/** Terminal — atrás do anel: grade de pontos e colchetes nos cantos. */
export function TerminalBack() {
  const r = LAYOUT.subOuter + 30;
  const k = 26; // tamanho dos colchetes
  const corners: [number, number, number, number][] = [
    [C - r, C - r, 1, 1],
    [C + r, C - r, -1, 1],
    [C - r, C + r, 1, -1],
    [C + r, C + r, -1, -1],
  ];
  return (
    <g className="terminal terminal-back" data-testid="terminal-back" aria-hidden="true">
      <defs>
        <pattern id="term-dots" width="18" height="18" patternUnits="userSpaceOnUse">
          <circle cx="1" cy="1" r="1" className="term-dot" />
        </pattern>
      </defs>
      <circle cx={C} cy={C} r={r} fill="url(#term-dots)" />
      {corners.map(([x, y, sx, sy], i) => (
        <path key={i} d={`M${x + sx * k} ${y} H${x} V${y + sy * k}`} className="term-bracket" />
      ))}
      <text x={C - r + 4} y={C - r - 8} className="term-caption">KIRA://RADIAL</text>
      <text x={C + r - 4} y={C + r + 18} className="term-caption" textAnchor="end">READY_</text>
    </g>
  );
}

/** Terminal — por cima de tudo: linhas de varredura (CRT) e a faixa que desce. */
export function TerminalFront() {
  const r = LAYOUT.subOuter + 4;
  return (
    <g className="terminal terminal-front" aria-hidden="true">
      <defs>
        <pattern id="term-scan" width="4" height="4" patternUnits="userSpaceOnUse">
          <rect width="4" height="1.4" className="term-scanline" />
        </pattern>
        <clipPath id="term-clip">
          <circle cx={C} cy={C} r={r} />
        </clipPath>
      </defs>
      <circle cx={C} cy={C} r={r} fill="url(#term-scan)" />
      <g clipPath="url(#term-clip)">
        <rect x={C - r} y={C - r} width={r * 2} height={40} className="term-sweep" />
      </g>
    </g>
  );
}
