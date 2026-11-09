/**
 * Camadas decorativas dos temas Neon Synthwave, Cyberpunk e Steampunk.
 * (Fluent Claro e Minimalista são só CSS.) Nada captura o ponteiro; só transform/opacity animados.
 */
import { LAYOUT, polar } from "./geometry";

const C = LAYOUT.size / 2;
const OUT = LAYOUT.subOuter;

// ---------------------------------------------------------------------------
// Neon Synthwave — sol listrado atrás do anel e grade em perspectiva embaixo.

const SUN_R = OUT + 70;
/** Faixas horizontais que "cortam" a metade de baixo do sol (como nos pôsteres anos 80). */
const SUN_CUTS = Array.from({ length: 7 }, (_, i) => {
  const y = C + 40 + i * 34;
  return { y, h: 4 + i * 2.6 };
});
/** Linhas da grade: horizontais cada vez mais próximas do horizonte + raios a partir do ponto de fuga. */
const GRID_H = Array.from({ length: 8 }, (_, i) => C + 120 + Math.pow(i / 7, 1.8) * 330);
const GRID_V = Array.from({ length: 15 }, (_, i) => -420 + i * 60);

export function NeonBack() {
  return (
    <g className="neon neon-back" data-testid="neon-back" aria-hidden="true">
      <defs>
        <linearGradient id="neon-sun" x1="0" y1={C - SUN_R} x2="0" y2={C + SUN_R} gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#ffd36b" />
          <stop offset="0.45" stopColor="#ff6ec7" />
          <stop offset="1" stopColor="#7b2ff7" />
        </linearGradient>
        <clipPath id="neon-clip">
          <circle cx={C} cy={C} r={SUN_R + 20} />
        </clipPath>
      </defs>
      <g clipPath="url(#neon-clip)">
        <circle cx={C} cy={C} r={SUN_R} fill="url(#neon-sun)" className="neon-sun" />
        {SUN_CUTS.map((c) => (
          <rect key={c.y} x={C - SUN_R} y={c.y} width={SUN_R * 2} height={c.h} className="neon-cut" />
        ))}
        <g className="neon-grid">
          {GRID_H.map((y) => <line key={y} x1={0} y1={y} x2={LAYOUT.size} y2={y} />)}
          {GRID_V.map((x) => <line key={x} x1={C} y1={C + 120} x2={C + x * 2.2} y2={LAYOUT.size} />)}
        </g>
      </g>
      <circle cx={C} cy={C} r={OUT + 14} className="neon-ring neon-ring--pink" />
      <circle cx={C} cy={C} r={OUT + 24} className="neon-ring neon-ring--cyan" />
    </g>
  );
}

// ---------------------------------------------------------------------------
// Cyberpunk — faixa de "perigo" listrada, cantos chanfrados e legendas.

export function CyberBack() {
  const r = OUT + 26;
  const s = OUT + 46;
  // Moldura com cantos cortados (octógono) em volta do anel.
  const cut = 70;
  const frame = `M${C - s + cut} ${C - s} H${C + s - cut} L${C + s} ${C - s + cut} V${C + s - cut} L${C + s - cut} ${C + s} H${C - s + cut} L${C - s} ${C + s - cut} V${C - s + cut} Z`;
  return (
    <g className="cyber cyber-back" data-testid="cyber-back" aria-hidden="true">
      <path d={frame} className="cyber-frame" />
      <g className="cyber-spin">
        <circle cx={C} cy={C} r={r} className="cyber-hazard" />
      </g>
      <circle cx={C} cy={C} r={r - 10} className="cyber-thin" />
      <text x={C - s + cut} y={C - s - 10} className="cyber-caption">SYS//KIRA.RADIAL</text>
      <text x={C + s - cut} y={C + s + 22} className="cyber-caption" textAnchor="end">NET_LINK: OK</text>
      <rect x={C + s - 14} y={C - 60} width={8} height={120} className="cyber-bar" />
      <rect x={C - s + 6} y={C - 60} width={8} height={120} className="cyber-bar cyber-bar--b" />
    </g>
  );
}

// ---------------------------------------------------------------------------
// Steampunk — engrenagens de latão girando e rebites em volta do anel.

/** Engrenagem com `teeth` dentes entre os raios `r0` (fundo) e `r1` (ponta), centro (cx, cy). */
export function gearPath(cx: number, cy: number, r0: number, r1: number, teeth: number): string {
  const pts: string[] = [];
  const step = 360 / teeth;
  for (let i = 0; i < teeth; i++) {
    const a = i * step;
    // fundo → subida → topo → descida (dente trapezoidal)
    for (const [r, da] of [[r0, 0], [r1, step * 0.18], [r1, step * 0.5], [r0, step * 0.68]] as const) {
      const p = polar(cx, cy, r, a + da);
      pts.push(`${p.x.toFixed(1)} ${p.y.toFixed(1)}`);
    }
  }
  return `M${pts.join(" L")} Z`;
}

const BIG_GEAR = gearPath(C, C, OUT + 22, OUT + 40, 48);
const SMALL_A = gearPath(C + OUT + 30, C - OUT + 10, 46, 60, 14);
const SMALL_B = gearPath(C - OUT - 24, C + OUT - 20, 36, 48, 11);
const RIVETS = Array.from({ length: 24 }, (_, i) => polar(C, C, LAYOUT.mainOuter + 10, i * 15));

export function SteamBack() {
  return (
    <g className="steam steam-back" data-testid="steam-back" aria-hidden="true">
      <g className="steam-spin steam-spin--big">
        <path d={BIG_GEAR} className="steam-gear" />
      </g>
      <g className="steam-spin steam-spin--a" style={{ transformOrigin: `${C + OUT + 30}px ${C - OUT + 10}px` }}>
        <path d={SMALL_A} className="steam-gear steam-gear--copper" />
        <circle cx={C + OUT + 30} cy={C - OUT + 10} r={14} className="steam-hub" />
      </g>
      <g className="steam-spin steam-spin--b" style={{ transformOrigin: `${C - OUT - 24}px ${C + OUT - 20}px` }}>
        <path d={SMALL_B} className="steam-gear steam-gear--copper" />
        <circle cx={C - OUT - 24} cy={C + OUT - 20} r={11} className="steam-hub" />
      </g>
      {RIVETS.map((p, i) => <circle key={i} cx={p.x} cy={p.y} r={3.2} className="steam-rivet" />)}
    </g>
  );
}

export function SteamFront() {
  return (
    <g className="steam steam-front" aria-hidden="true">
      <circle cx={C} cy={C} r={LAYOUT.hubRadius + 4} className="steam-bezel" />
    </g>
  );
}
