/**
 * Camadas decorativas dos temas Sakura, Oceano, Aurora, Magma, Pixel e Papel.
 * Nada captura o ponteiro; só transform/opacity animados (e nada anima com o menu fechado,
 * porque a página fica suspensa). Posições "aleatórias" são fixas (determinísticas).
 */
import { LAYOUT, polar } from "./geometry";

const C = LAYOUT.size / 2;
const OUT = LAYOUT.subOuter;

/** Pseudoaleatório fixo (mesma sequência sempre): espalha pétalas, bolhas e estrelas. */
export function seq(n: number, seed: number): number[] {
  let x = seed;
  return Array.from({ length: n }, () => {
    x = (x * 9301 + 49297) % 233280;
    return x / 233280;
  });
}

// ---------------------------------------------------------------------------
// Sakura — galhos e pétalas de cerejeira caindo devagar.

const PETALS = seq(14, 7).map((r, i) => {
  const [a, b, c] = seq(3, i * 31 + 5);
  return { x: 60 + r * (LAYOUT.size - 120), delay: -(a * 14), dur: 11 + b * 7, size: 7 + c * 6, rot: Math.round(a * 360) };
});
/** Pétala: gota com a ponta fendida. */
const PETAL = "M0 -1 C0.7 -1 1 -0.2 0.55 0.55 C0.35 0.9 0.1 1 0 0.8 C-0.1 1 -0.35 0.9 -0.55 0.55 C-1 -0.2 -0.7 -1 0 -1 Z";
const BLOSSOMS = [-128, -112, -96, 52, 68, 154].map((a, i) => ({ ...polar(C, C, OUT + 26 + (i % 2) * 12, a), r: 9 + (i % 3) * 2 }));

export function SakuraBack() {
  return (
    <g className="sakura sakura-back" data-testid="sakura-back" aria-hidden="true">
      <path d={`M${C - OUT - 60} ${C - OUT + 20} Q${C - OUT} ${C - OUT - 30} ${C - 60} ${C - OUT - 18}`} className="sakura-branch" />
      <path d={`M${C + OUT + 60} ${C + OUT - 40} Q${C + OUT} ${C + OUT + 10} ${C + 40} ${C + OUT + 22}`} className="sakura-branch" />
      <circle cx={C} cy={C} r={OUT + 16} className="sakura-ring" />
      {BLOSSOMS.map((b, i) => (
        <g key={i} transform={`translate(${b.x} ${b.y})`} className="sakura-blossom">
          {[0, 72, 144, 216, 288].map((a) => (
            <path key={a} d={PETAL} transform={`rotate(${a}) translate(0 ${-b.r * 0.9}) scale(${b.r * 0.62})`} />
          ))}
          <circle r={b.r * 0.28} className="sakura-blossom-core" />
        </g>
      ))}
      {PETALS.map((p, i) => (
        <g key={i} className="sakura-fall" style={{ animationDelay: `${p.delay}s`, animationDuration: `${p.dur}s` }}>
          <path d={PETAL} transform={`translate(${p.x} 0) rotate(${p.rot}) scale(${p.size})`} className="sakura-petal" />
        </g>
      ))}
    </g>
  );
}

// ---------------------------------------------------------------------------
// Oceano — ondas concêntricas e bolhas subindo.

const BUBBLES = seq(12, 11).map((r, i) => {
  const [a, b, c] = seq(3, i * 17 + 3);
  return { x: C - OUT - 30 + r * (OUT * 2 + 60), r: 3 + a * 7, delay: -(b * 9), dur: 7 + c * 6 };
});

export function OceanBack() {
  return (
    <g className="ocean ocean-back" data-testid="ocean-back" aria-hidden="true">
      <defs>
        <radialGradient id="ocean-deep" cx={C} cy={C} r={OUT + 70} gradientUnits="userSpaceOnUse">
          <stop offset="0.55" stopColor="#0b4f6c" stopOpacity="0.55" />
          <stop offset="1" stopColor="#031522" stopOpacity="0" />
        </radialGradient>
      </defs>
      <circle cx={C} cy={C} r={OUT + 70} fill="url(#ocean-deep)" />
      {[0, 1, 2].map((i) => (
        <circle key={i} cx={C} cy={C} r={OUT + 12} className="ocean-wave" style={{ animationDelay: `${-i * 2}s` }} />
      ))}
      {BUBBLES.map((b, i) => (
        <circle key={i} cx={b.x} cy={C + OUT + 40} r={b.r} className="ocean-bubble" style={{ animationDelay: `${b.delay}s`, animationDuration: `${b.dur}s` }} />
      ))}
    </g>
  );
}

// ---------------------------------------------------------------------------
// Aurora — céu estrelado e faixas de aurora ondulando.

const STARS = seq(40, 23).map((r, i) => {
  const [a, b] = seq(2, i * 13 + 9);
  return { x: r * LAYOUT.size, y: a * LAYOUT.size, r: 0.8 + b * 1.6 };
});
function band(y: number, amp: number): string {
  const x0 = C - OUT - 120;
  const x1 = C + OUT + 120;
  const w = (x1 - x0) / 4;
  return `M${x0} ${y} C${x0 + w} ${y - amp} ${x0 + w} ${y + amp} ${x0 + 2 * w} ${y} S${x0 + 3 * w} ${y - amp} ${x1} ${y}`;
}

export function AuroraBack() {
  return (
    <g className="aurora aurora-back" data-testid="aurora-back" aria-hidden="true">
      <defs>
        <linearGradient id="aurora-a" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#3dffb0" stopOpacity="0" />
          <stop offset="0.5" stopColor="#3dffb0" />
          <stop offset="1" stopColor="#8a5cff" stopOpacity="0" />
        </linearGradient>
        <linearGradient id="aurora-b" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#8a5cff" stopOpacity="0" />
          <stop offset="0.5" stopColor="#b98cff" />
          <stop offset="1" stopColor="#3dffb0" stopOpacity="0" />
        </linearGradient>
        <clipPath id="aurora-clip">
          <circle cx={C} cy={C} r={OUT + 90} />
        </clipPath>
      </defs>
      <g clipPath="url(#aurora-clip)">
        <circle cx={C} cy={C} r={OUT + 90} className="aurora-sky" />
        {[0, 1, 2].map((g) => (
          <g key={g} className="aurora-twinkle" style={{ animationDelay: `${-g * 1.3}s` }}>
            {STARS.filter((_, i) => i % 3 === g).map((s, i) => (
              <circle key={i} cx={s.x} cy={s.y} r={s.r} className="aurora-star" />
            ))}
          </g>
        ))}
        <path d={band(C - OUT + 10, 60)} className="aurora-band aurora-band--a" stroke="url(#aurora-a)" />
        <path d={band(C - OUT + 50, 45)} className="aurora-band aurora-band--b" stroke="url(#aurora-b)" />
      </g>
      <circle cx={C} cy={C} r={OUT + 14} className="aurora-ring" />
    </g>
  );
}

// ---------------------------------------------------------------------------
// Magma — rachaduras de lava pulsando e brasas subindo.

const CRACKS = seq(10, 41).map((r, i) => {
  const a = i * 36 + r * 20;
  const p0 = polar(C, C, LAYOUT.mainOuter + 6, a);
  const p1 = polar(C, C, OUT + 12, a + 6);
  const p2 = polar(C, C, OUT + 34 + r * 20, a - 4);
  return `M${p0.x.toFixed(1)} ${p0.y.toFixed(1)} L${p1.x.toFixed(1)} ${p1.y.toFixed(1)} L${p2.x.toFixed(1)} ${p2.y.toFixed(1)}`;
});
const EMBERS = seq(10, 57).map((r, i) => {
  const [a, b] = seq(2, i * 19 + 1);
  return { x: C - OUT + r * OUT * 2, delay: -(a * 6), dur: 5 + b * 4 };
});

export function MagmaBack() {
  return (
    <g className="magma magma-back" data-testid="magma-back" aria-hidden="true">
      <circle cx={C} cy={C} r={OUT + 22} className="magma-glow" />
      <g className="magma-cracks">
        {CRACKS.map((d, i) => <path key={i} d={d} style={{ animationDelay: `${-i * 0.37}s` }} />)}
      </g>
      {EMBERS.map((e, i) => (
        <circle key={i} cx={e.x} cy={C + OUT} r={2.4} className="magma-ember" style={{ animationDelay: `${e.delay}s`, animationDuration: `${e.dur}s` }} />
      ))}
    </g>
  );
}

// ---------------------------------------------------------------------------
// Pixel — moldura em degraus (8-bit) e "estrelas" quadradas piscando.

/** Círculo desenhado em degraus de `step` px (como um sprite). */
export function pixelCircle(cx: number, cy: number, r: number, step: number): string {
  const rows: string[] = [];
  for (let y = -r; y < r; y += step) {
    const half = Math.floor(Math.sqrt(Math.max(0, r * r - (y + step / 2) ** 2)) / step) * step;
    if (half > 0) rows.push(`M${cx - half} ${cy + y} h${half * 2} v${step} h${-half * 2} Z`);
  }
  return rows.join(" ");
}
const PIXEL_RING = pixelCircle(C, C, OUT + 30, 12);
const PIXEL_HOLE = pixelCircle(C, C, OUT + 18, 12);
const SPARKS = seq(10, 77).map((r, i) => {
  const p = polar(C, C, OUT + 60 + (i % 3) * 18, r * 360);
  return { x: Math.round(p.x / 6) * 6, y: Math.round(p.y / 6) * 6, delay: -(i * 0.4) };
});

export function PixelBack() {
  return (
    <g className="pixel pixel-back" data-testid="pixel-back" aria-hidden="true">
      <path d={`${PIXEL_RING} ${PIXEL_HOLE}`} className="pixel-ring" fillRule="evenodd" />
      {SPARKS.map((s, i) => (
        <rect key={i} x={s.x} y={s.y} width={6} height={6} className="pixel-spark" style={{ animationDelay: `${s.delay}s` }} />
      ))}
    </g>
  );
}

// ---------------------------------------------------------------------------
// Papel — folha de caderno (linhas e margem) atrás do anel, com sombra suave.

export function PaperBack() {
  const r = OUT + 40;
  const lines = Array.from({ length: Math.floor((r * 2) / 28) }, (_, i) => C - r + 14 + i * 28);
  return (
    <g className="paper paper-back" data-testid="paper-back" aria-hidden="true">
      <defs>
        <clipPath id="paper-clip">
          <circle cx={C} cy={C} r={r} />
        </clipPath>
      </defs>
      <circle cx={C + 6} cy={C + 8} r={r} className="paper-shadow" />
      <circle cx={C} cy={C} r={r} className="paper-sheet" />
      <g clipPath="url(#paper-clip)">
        {lines.map((y) => <line key={y} x1={C - r} y1={y} x2={C + r} y2={y} className="paper-line" />)}
        <line x1={C - r + 70} y1={C - r} x2={C - r + 70} y2={C + r} className="paper-margin" />
      </g>
    </g>
  );
}
