/**
 * Camadas decorativas do pacote "Tecnologia 2": Osciloscópio, Fibra óptica e Válvulas Nixie.
 * Nada captura o ponteiro. Como nos outros temas tecnológicos, poucas animações por tema
 * (elementos agrupados) e só em transform/opacity.
 */
import { LAYOUT, polar } from "./geometry";
import { seq } from "./ThemeLayers3";

const C = LAYOUT.size / 2;
const OUT = LAYOUT.subOuter;
const f = (n: number) => n.toFixed(1);

// ---------------------------------------------------------------------------
// Osciloscópio — tela de fósforo com retícula e uma onda viva em volta do anel.

/** Onda senoidal fechada em volta do centro (raio base r, amplitude a, k ciclos por volta). */
function ringWave(r: number, a: number, k: number, steps = 240): string {
  let d = "";
  for (let i = 0; i <= steps; i++) {
    const ang = (i / steps) * 360;
    const p = polar(C, C, r + a * Math.sin((ang * k * Math.PI) / 180), ang);
    d += `${i ? "L" : "M"}${f(p.x)} ${f(p.y)}`;
  }
  return d + "Z";
}
const WAVE_MAIN = ringWave(OUT + 34, 14, 9);
const WAVE_ECHO = ringWave(OUT + 34, 8, 5);

export function ScopeBack() {
  const R = OUT + 72;
  return (
    <g className="scope scope-back" data-testid="scope-back" aria-hidden="true">
      <defs>
        <pattern id="scope-grid" width="36" height="36" patternUnits="userSpaceOnUse" x={C % 36} y={C % 36}>
          <path d="M36 0 H0 V36" className="scope-grid-line" />
        </pattern>
        <clipPath id="scope-clip">
          <circle cx={C} cy={C} r={R} />
        </clipPath>
      </defs>
      <circle cx={C} cy={C} r={R} className="scope-screen" />
      <rect x={C - R} y={C - R} width={R * 2} height={R * 2} fill="url(#scope-grid)" clipPath="url(#scope-clip)" />
      {/* eixos da retícula com marquinhas */}
      <line x1={C - R} y1={C} x2={C + R} y2={C} className="scope-axis" />
      <line x1={C} y1={C - R} x2={C} y2={C + R} className="scope-axis" />
      <circle cx={C} cy={C} r={R} className="scope-bezel" />
      {/* A onda gira devagar (uma animação); o eco fica parado e só respira. */}
      <path d={WAVE_ECHO} className="scope-echo" />
      <g className="scope-spin">
        <path d={WAVE_MAIN} className="scope-wave" />
      </g>
    </g>
  );
}

// ---------------------------------------------------------------------------
// Fibra óptica — fios de luz saindo do anel, com pulsos coloridos correndo para fora.

const FIBER_COLORS = 3;
const FIBERS = seq(24, 307).map((r, i) => {
  const a = i * 15 + r * 6;
  const p0 = polar(C, C, LAYOUT.mainOuter + 4, a);
  const bend = a + (i % 2 ? 1 : -1) * (3 + r * 4);
  const p1 = polar(C, C, OUT + 20, a + (bend - a) * 0.3);
  const p2 = polar(C, C, OUT + 62, bend);
  return { a, bend, d: `M${f(p0.x)} ${f(p0.y)} Q${f(p1.x)} ${f(p1.y)} ${f(p2.x)} ${f(p2.y)}`, color: i % FIBER_COLORS, tip: p2 };
});
/** Pulsos: três "ondas" de pontos em raios crescentes; acendendo em sequência parecem correr. */
const PULSES = [0, 1, 2].map((wave) =>
  FIBERS.map((fb) => {
    const t = 0.35 + wave * 0.25;
    return { ...polar(C, C, LAYOUT.mainOuter + 4 + (OUT + 58 - LAYOUT.mainOuter) * t, fb.a + (fb.bend - fb.a) * t * t), color: fb.color };
  }),
);

export function FiberBack() {
  return (
    <g className="fiber fiber-back" data-testid="fiber-back" aria-hidden="true">
      <circle cx={C} cy={C} r={OUT + 74} className="fiber-dark" />
      <g className="fiber-strands">
        {FIBERS.map((fb, i) => <path key={i} d={fb.d} className={`fiber-c${fb.color}`} />)}
      </g>
      <g className="fiber-tips">
        {FIBERS.map((fb, i) => <circle key={i} cx={f(fb.tip.x)} cy={f(fb.tip.y)} r={3.5} className={`fiber-c${fb.color}`} />)}
      </g>
      {PULSES.map((wave, w) => (
        <g key={w} className="fiber-pulses" style={{ animationDelay: `${(w - 2) * 0.4}s` }}>
          {wave.map((p, i) => <circle key={i} cx={f(p.x)} cy={f(p.y)} r={3} className={`fiber-c${p.color}`} />)}
        </g>
      ))}
      <circle cx={C} cy={C} r={LAYOUT.mainOuter + 5} className="fiber-collar" />
    </g>
  );
}

// ---------------------------------------------------------------------------
// Válvulas Nixie — tubos de vidro com dígitos laranja em volta do anel, metal escuro.

const TUBES = 16;
const TUBE_R = OUT + 40;
const DIGITS = seq(TUBES, 419).map((r, i) => ({
  angle: (i * 360) / TUBES + 360 / TUBES / 2,
  digit: String(Math.floor(r * 10) % 10),
  group: i % 4 === 1 ? 1 : 0,
}));

export function NixieBack() {
  const R = OUT + 76;
  return (
    <g className="nixie nixie-back" data-testid="nixie-back" aria-hidden="true">
      <defs>
        <pattern id="nixie-mesh" width="12" height="10.4" patternUnits="userSpaceOnUse">
          <path d="M3 0 L9 0 L12 5.2 L9 10.4 L3 10.4 L0 5.2 Z" className="nixie-mesh-line" />
        </pattern>
        <clipPath id="nixie-clip">
          <circle cx={C} cy={C} r={R} />
        </clipPath>
      </defs>
      <circle cx={C} cy={C} r={R} className="nixie-chassis" />
      <rect x={C - R} y={C - R} width={R * 2} height={R * 2} fill="url(#nixie-mesh)" clipPath="url(#nixie-clip)" />
      <circle cx={C} cy={C} r={R} className="nixie-rim" />
      {[0, 1].map((g) => (
        <g key={g} className={`nixie-tubes${g ? " nixie-flicker" : ""}`}>
          {DIGITS.filter((d) => d.group === g).map((d) => {
            const p = polar(C, C, TUBE_R, d.angle);
            return (
              <g key={d.angle} transform={`translate(${f(p.x)} ${f(p.y)})`}>
                <rect x={-12} y={-21} width={24} height={42} rx={11} className="nixie-glass" />
                <text x={0} y={9} textAnchor="middle" className="nixie-digit">{d.digit}</text>
              </g>
            );
          })}
        </g>
      ))}
    </g>
  );
}
