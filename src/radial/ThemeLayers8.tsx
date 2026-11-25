/**
 * Camadas decorativas do pacote "Tecnologia 5": Silício, Plasma e Satélite.
 * Nada captura o ponteiro. Silício é parado; Plasma e Satélite têm poucas animações
 * (elementos agrupados), só em transform/opacity e a 15 quadros/s alinhados.
 */
import { LAYOUT, polar } from "./geometry";
import { seq } from "./ThemeLayers3";

const C = LAYOUT.size / 2;
const OUT = LAYOUT.subOuter;
const R = OUT + 78;
const IN = LAYOUT.mainOuter;
const f = (n: number) => n.toFixed(1);

// ---------------------------------------------------------------------------
// Silício — foto de um chip ampliado: blocos de trilhas microscópicas e reflexo iridescente.

const CELL = 36;
/** Trilhas agrupadas em 3 paths (por tom), para poucos elementos num desenho com muitas linhas. */
const DIE = (() => {
  const out = { a: "", b: "", c: "" };
  const n = Math.ceil(LAYOUT.size / CELL);
  for (let gy = 0; gy < n; gy++) {
    for (let gx = 0; gx < n; gx++) {
      const x = gx * CELL;
      const y = gy * CELL;
      const d = Math.hypot(x + CELL / 2 - C, y + CELL / 2 - C);
      if (d < IN + 24 || d > R - 26) continue;
      const [kind, tone] = seq(2, gy * 131 + gx * 17 + 9);
      const key = tone < 0.45 ? "a" : tone < 0.8 ? "b" : "c";
      if (kind < 0.38) for (let k = 4; k < CELL - 3; k += 3) out[key] += `M${x + 3} ${y + k}h${CELL - 6}`;
      else if (kind < 0.76) for (let k = 4; k < CELL - 3; k += 3) out[key] += `M${x + k} ${y + 3}v${CELL - 6}`;
      else if (kind < 0.9) out[key] += `M${x + 6} ${y + 6}h${CELL - 12}v${CELL - 12}h${-(CELL - 12)}Z`;
    }
  }
  return out;
})();
const PADS = Array.from({ length: 40 }, (_, i) => polar(C, C, R - 13, i * 9 + 4.5));

export function SiliconBack() {
  return (
    <g className="silicon silicon-back" data-testid="silicon-back" aria-hidden="true">
      <defs>
        <clipPath id="silicon-clip">
          <circle cx={C} cy={C} r={R} />
        </clipPath>
        <linearGradient id="silicon-sheen" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#4de8ff" />
          <stop offset="0.35" stopColor="#c25cff" />
          <stop offset="0.6" stopColor="#ffcf5c" />
          <stop offset="1" stopColor="#4dffa6" />
        </linearGradient>
      </defs>
      <circle cx={C} cy={C} r={R} className="silicon-die" />
      <g clipPath="url(#silicon-clip)">
        <path d={DIE.a} className="silicon-trace silicon-trace--a" />
        <path d={DIE.b} className="silicon-trace silicon-trace--b" />
        <path d={DIE.c} className="silicon-trace silicon-trace--c" />
        <rect x={C - R} y={C - R} width={R * 2} height={R * 2} fill="url(#silicon-sheen)" className="silicon-sheen" />
      </g>
      <g className="silicon-pads">
        {PADS.map((p, i) => <rect key={i} x={f(p.x - 4)} y={f(p.y - 4)} width={8} height={8} />)}
      </g>
      <circle cx={C} cy={C} r={R} className="silicon-edge" />
    </g>
  );
}

// ---------------------------------------------------------------------------
// Plasma — esfera de plasma: brilho no centro (aparece nas frestas entre as fatias),
// filamentos tremendo em volta e um raio forte apontando para a fatia escolhida.

/** Raio em zigue-zague do anel para fora, no ângulo `a` (determinístico pela semente). */
function bolt(a: number, seed: number, r0: number, r1: number, wobble: number): string {
  const steps = 9;
  return seq(steps + 1, seed)
    .map((j, k) => {
      const p = polar(C, C, r0 + ((r1 - r0) * k) / steps, a + (k && k < steps ? (j - 0.5) * wobble : 0));
      return `${k ? "L" : "M"}${f(p.x)} ${f(p.y)}`;
    })
    .join("");
}
const FILAMENTS = [0, 1].map((g) =>
  seq(14, 733 + g * 97)
    .map((r, i) => bolt(i * (360 / 14) + g * 12 + r * 8, i * 41 + g * 5 + 1, IN + 6, R - 12 - r * 40, 7))
    .join(""),
);

export function PlasmaBack({ angle }: { angle: number | null }) {
  return (
    <g className="plasma plasma-back" data-testid="plasma-back" aria-hidden="true">
      <defs>
        <radialGradient id="plasma-core" cx={C} cy={C} r={IN + 20} gradientUnits="userSpaceOnUse">
          <stop offset="0.3" stopColor="#ffe6ff" stopOpacity="0.9" />
          <stop offset="0.6" stopColor="#e05cff" stopOpacity="0.55" />
          <stop offset="1" stopColor="#5a1aa8" stopOpacity="0" />
        </radialGradient>
      </defs>
      <circle cx={C} cy={C} r={R} className="plasma-glass" />
      <circle cx={C} cy={C} r={IN + 20} fill="url(#plasma-core)" />
      {/* Dois conjuntos de filamentos que se alternam = o plasma "treme" (uma animação). */}
      {FILAMENTS.map((d, g) => (
        <g key={g} className="plasma-flicker" style={{ animationDelay: `${-g * 0.4}s` }}>
          <path d={d} className="plasma-glow" />
          <path d={d} className="plasma-filament" />
        </g>
      ))}
      {angle !== null && (
        <g className="plasma-strike" data-testid="plasma-strike">
          <path d={bolt(angle, Math.round(angle * 10) + 7, IN + 4, R - 6, 5)} className="plasma-bolt-glow" />
          <path d={bolt(angle, Math.round(angle * 10) + 7, IN + 4, R - 6, 5)} className="plasma-bolt" />
        </g>
      )}
      <circle cx={C} cy={C} r={R} className="plasma-sphere" />
    </g>
  );
}

// ---------------------------------------------------------------------------
// Satélite — a Terra vista de cima (grade polar) e satélites em três órbitas.

const ORBITS = [
  { r: OUT + 16, cls: "sat-spin--a", start: 20 },
  { r: OUT + 44, cls: "sat-spin--b", start: 140 },
  { r: OUT + 70, cls: "sat-spin--c", start: 260 },
];
const LATS = [IN + 24, IN + 64, IN + 104, IN + 144];
const MERID = Array.from({ length: 12 }, (_, i) => {
  const p0 = polar(C, C, IN + 6, i * 30);
  const p1 = polar(C, C, R - 4, i * 30);
  return `M${f(p0.x)} ${f(p0.y)}L${f(p1.x)} ${f(p1.y)}`;
}).join("");

function Satellite({ r, start }: { r: number; start: number }) {
  const p = polar(C, C, r, start);
  return (
    <g transform={`translate(${f(p.x)} ${f(p.y)}) rotate(${start + 90})`} className="sat-craft">
      <rect x={-13} y={-3} width={9} height={6} className="sat-panel" />
      <rect x={4} y={-3} width={9} height={6} className="sat-panel" />
      <rect x={-3.5} y={-3.5} width={7} height={7} rx={1.5} className="sat-body" />
    </g>
  );
}

export function SatelliteBack() {
  return (
    <g className="sat satellite-back" data-testid="satellite-back" aria-hidden="true">
      <circle cx={C} cy={C} r={R} className="sat-space" />
      <g className="sat-earth">
        {LATS.map((r) => <circle key={r} cx={C} cy={C} r={r} />)}
        <path d={MERID} />
      </g>
      {ORBITS.map((o) => (
        <g key={o.cls}>
          <circle cx={C} cy={C} r={o.r} className="sat-path" />
          {/* Cada órbita gira em velocidade própria (3 animações no total). */}
          <g className={`sat-spin ${o.cls}`}>
            <Satellite r={o.r} start={o.start} />
          </g>
        </g>
      ))}
    </g>
  );
}
