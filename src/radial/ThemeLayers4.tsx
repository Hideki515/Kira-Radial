/**
 * Camadas decorativas dos temas tecnológicos: Circuito, Radar, Quântico, Blueprint,
 * Data Center e Rede Neural. Nada captura o ponteiro. Para gastar pouco com o menu aberto,
 * cada tema tem no máximo ~6 animações (elementos agrupados) e só em transform/opacity.
 */
import { LAYOUT, polar } from "./geometry";
import { seq } from "./ThemeLayers3";

const C = LAYOUT.size / 2;
const OUT = LAYOUT.subOuter;
const f = (n: number) => n.toFixed(1);

// ---------------------------------------------------------------------------
// Circuito — trilhas de placa saindo do anel, com vias que acendem em grupos.

interface Trace {
  d: string;
  via: { x: number; y: number };
  group: number;
}
/** Trilha: sai radialmente do anel, dobra 45° e termina numa via. */
const TRACES: Trace[] = seq(18, 101).map((r, i) => {
  const a = i * 20 + r * 8;
  const p0 = polar(C, C, LAYOUT.mainOuter + 6, a);
  const p1 = polar(C, C, OUT + 10 + r * 30, a);
  const turn = i % 2 ? 22 : -22;
  const p2 = polar(C, C, OUT + 40 + r * 30, a + turn * 0.6);
  return { d: `M${f(p0.x)} ${f(p0.y)} L${f(p1.x)} ${f(p1.y)} L${f(p2.x)} ${f(p2.y)}`, via: p2, group: i % 3 };
});

export function CircuitBack() {
  return (
    <g className="circuit circuit-back" data-testid="circuit-back" aria-hidden="true">
      <circle cx={C} cy={C} r={OUT + 80} className="circuit-board" />
      <g className="circuit-traces">
        {TRACES.map((t, i) => <path key={i} d={t.d} />)}
      </g>
      {[0, 1, 2].map((g) => (
        <g key={g} className="circuit-vias" style={{ animationDelay: `${-g * 0.9}s` /* 3 quadros de 0,3 s */ }}>
          {TRACES.filter((t) => t.group === g).map((t, i) => (
            <circle key={i} cx={f(t.via.x)} cy={f(t.via.y)} r={5} />
          ))}
        </g>
      ))}
      <circle cx={C} cy={C} r={OUT + 4} className="circuit-pad-ring" />
    </g>
  );
}

// ---------------------------------------------------------------------------
// Radar — grade polar, varredura girando e alvos que piscam.

const BLIPS = seq(8, 211).map((r, i) => ({ ...polar(C, C, OUT + 20 + r * 60, i * 47 + r * 30), group: i % 2 }));

export function RadarBack() {
  const R = OUT + 80;
  const tip = polar(C, C, R, -90);
  // Gira no sentido horário: o rastro fica antes do feixe (−130° → −90°).
  const side = polar(C, C, R, -130);
  return (
    <g className="radar radar-back" data-testid="radar-back" aria-hidden="true">
      <defs>
        <linearGradient id="radar-sweep" x1={f(side.x)} y1={f(side.y)} x2={f(tip.x)} y2={f(tip.y)} gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#2cf5c0" stopOpacity="0" />
          <stop offset="1" stopColor="#2cf5c0" stopOpacity="0.45" />
        </linearGradient>
      </defs>
      <circle cx={C} cy={C} r={R} className="radar-scope" />
      {[OUT + 20, OUT + 50, R].map((r) => <circle key={r} cx={C} cy={C} r={r} className="radar-grid" />)}
      {[0, 30, 60, 90, 120, 150].map((a) => {
        const p = polar(C, C, R, a);
        const q = polar(C, C, R, a + 180);
        return <line key={a} x1={f(p.x)} y1={f(p.y)} x2={f(q.x)} y2={f(q.y)} className="radar-grid" />;
      })}
      <g className="radar-spin">
        <path d={`M${C} ${C} L${f(side.x)} ${f(side.y)} A${R} ${R} 0 0 1 ${f(tip.x)} ${f(tip.y)} Z`} fill="url(#radar-sweep)" />
        <line x1={C} y1={C} x2={f(tip.x)} y2={f(tip.y)} className="radar-beam" />
      </g>
      {[0, 1].map((g) => (
        <g key={g} className="radar-blips" style={{ animationDelay: `${-g * 1.5}s` }}>
          {BLIPS.filter((b) => b.group === g).map((b, i) => <circle key={i} cx={f(b.x)} cy={f(b.y)} r={4} />)}
        </g>
      ))}
    </g>
  );
}

// ---------------------------------------------------------------------------
// Quântico — três órbitas elípticas girando, cada uma com seu elétron.

export function QuantumBack() {
  const rx = OUT + 62;
  const ry = 92;
  return (
    <g className="quantum quantum-back" data-testid="quantum-back" aria-hidden="true">
      <circle cx={C} cy={C} r={OUT + 30} className="quantum-field" />
      {/* O átomo inteiro gira devagar (uma animação só); cada órbita leva dois elétrons
          nas pontas, que ficam fora do anel e sempre visíveis. */}
      <g className="quantum-spin">
        {[0, 60, 120].map((tilt) => (
          <g key={tilt} transform={`rotate(${tilt} ${C} ${C})`}>
            <ellipse cx={C} cy={C} rx={rx} ry={ry} className="quantum-orbit" />
            <circle cx={C + rx} cy={C} r={7} className="quantum-electron" />
            <circle cx={C - rx} cy={C} r={5} className="quantum-electron quantum-electron--b" />
          </g>
        ))}
      </g>
    </g>
  );
}

// ---------------------------------------------------------------------------
// Blueprint — planta técnica: grade, cotas e carimbo. Estático (quase sem custo).

export function BlueprintBack() {
  const R = OUT + 70;
  // Linha da cota abaixo do anel, onde a folha ainda é larga o bastante para ela.
  const dimY = C + LAYOUT.mainOuter + 30;
  return (
    <g className="blueprint blueprint-back" data-testid="blueprint-back" aria-hidden="true">
      <defs>
        <pattern id="bp-grid" width="20" height="20" patternUnits="userSpaceOnUse" x={C % 20} y={C % 20}>
          <path d="M20 0 H0 V20" className="bp-grid-line" />
        </pattern>
        <clipPath id="bp-clip">
          <circle cx={C} cy={C} r={R} />
        </clipPath>
      </defs>
      <circle cx={C} cy={C} r={R} className="bp-sheet" />
      <rect x={C - R} y={C - R} width={R * 2} height={R * 2} fill="url(#bp-grid)" clipPath="url(#bp-clip)" />
      <circle cx={C} cy={C} r={R} className="bp-edge" />
      <circle cx={C} cy={C} r={OUT + 14} className="bp-construction" />
      <line x1={C - R} y1={C} x2={C + R} y2={C} className="bp-construction" />
      <line x1={C} y1={C - R} x2={C} y2={C + R} className="bp-construction" />
      {/* cota horizontal do diâmetro do anel */}
      <g className="bp-dim">
        <line x1={C - LAYOUT.mainOuter} y1={dimY} x2={C + LAYOUT.mainOuter} y2={dimY} />
        <path d={`M${C - LAYOUT.mainOuter} ${dimY} l10 -4 v8 Z M${C + LAYOUT.mainOuter} ${dimY} l-10 -4 v8 Z`} className="bp-arrow" />
        <text x={C} y={dimY + 16} textAnchor="middle" className="bp-text">Ø {LAYOUT.mainOuter * 2}</text>
      </g>
      <text x={C + 40} y={C - R + 62} className="bp-text bp-title">KIRA · RADIAL</text>
      <text x={C + 40} y={C - R + 78} className="bp-text">REV A · ESC 1:1</text>
    </g>
  );
}

// ---------------------------------------------------------------------------
// Data Center — painel de rack com LEDs de status piscando em grupos.

const LEDS = Array.from({ length: 48 }, (_, i) => {
  const ring = i % 2;
  const p = polar(C, C, OUT + 22 + ring * 16, (i >> 1) * 15 + ring * 7);
  return { x: p.x - 3, y: p.y - 3, group: i % 3 };
});

export function DatacenterBack() {
  const R = OUT + 60;
  return (
    <g className="dc dc-back" data-testid="datacenter-back" aria-hidden="true">
      <circle cx={C} cy={C} r={R} className="dc-panel" />
      <circle cx={C} cy={C} r={R - 6} className="dc-vent" />
      <circle cx={C} cy={C} r={OUT + 8} className="dc-rail" />
      {[0, 1, 2].map((g) => (
        <g key={g} className={`dc-leds dc-leds--${g}`}>
          {LEDS.filter((l) => l.group === g).map((l, i) => (
            <rect key={i} x={f(l.x)} y={f(l.y)} width={6} height={6} rx={1} />
          ))}
        </g>
      ))}
    </g>
  );
}

// ---------------------------------------------------------------------------
// Rede Neural — camadas de nós ligadas; os pulsos correm de dentro para fora.

const LAYERS = [OUT + 16, OUT + 50, OUT + 84].map((r, li) =>
  Array.from({ length: 12 - li * 2 }, (_, i) => polar(C, C, r, i * (360 / (12 - li * 2)) + li * 9)),
);
const EDGES: { d: string; layer: number }[] = [];
for (let l = 0; l < LAYERS.length - 1; l++) {
  for (const a of LAYERS[l]) {
    // Liga cada nó aos dois mais próximos da camada seguinte.
    const near = [...LAYERS[l + 1]].sort((p, q) => Math.hypot(p.x - a.x, p.y - a.y) - Math.hypot(q.x - a.x, q.y - a.y)).slice(0, 2);
    for (const b of near) EDGES.push({ d: `M${f(a.x)} ${f(a.y)} L${f(b.x)} ${f(b.y)}`, layer: l });
  }
}

export function NeuralBack() {
  return (
    <g className="neural neural-back" data-testid="neural-back" aria-hidden="true">
      {[0, 1].map((l) => (
        <g key={l} className="neural-edges" style={{ animationDelay: `${-l * 1.1}s` }}>
          {EDGES.filter((e) => e.layer === l).map((e, i) => <path key={i} d={e.d} />)}
        </g>
      ))}
      {LAYERS.map((layer, l) => (
        <g key={l} className="neural-nodes" style={{ animationDelay: `${-l * 0.825}s` /* 3 quadros de 0,275 s */ }}>
          {layer.map((p, i) => <circle key={i} cx={f(p.x)} cy={f(p.y)} r={6 - l} />)}
        </g>
      ))}
    </g>
  );
}
