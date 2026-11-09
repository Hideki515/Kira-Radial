/**
 * Decoração do tema holográfico (HUD em wireframe): esfera com meridianos girando,
 * órbitas inclinadas, réguas graduadas e varredura de radar.
 * Só traços finos e animações de transform/dashoffset — sem filtros (caros no WebView).
 */
import { LAYOUT, polar } from "./geometry";

const C = LAYOUT.size / 2;
const GLOBE_R = 418;
const MERIDIANS = 6;
const LATITUDES = [-60, -35, -12, 12, 35, 60];

function arc(r: number, a0: number, a1: number): string {
  const p0 = polar(C, C, r, a0);
  const p1 = polar(C, C, r, a1);
  const large = a1 - a0 > 180 ? 1 : 0;
  return `M${p0.x.toFixed(2)} ${p0.y.toFixed(2)} A${r} ${r} 0 ${large} 1 ${p1.x.toFixed(2)} ${p1.y.toFixed(2)}`;
}

/** Traços radiais de uma régua circular: a cada `step` graus, com traço maior a cada `major`. */
function ticks(r: number, step: number, major: number, short: number, long: number): string {
  let d = "";
  for (let a = 0; a < 360; a += step) {
    const len = a % major === 0 ? long : short;
    const p0 = polar(C, C, r, a);
    const p1 = polar(C, C, r + len, a);
    d += `M${p0.x.toFixed(2)} ${p0.y.toFixed(2)}L${p1.x.toFixed(2)} ${p1.y.toFixed(2)}`;
  }
  return d;
}

// Geometria fixa: calculada uma vez no carregamento do módulo.
const OUTER_TICKS = ticks(386, 3, 30, 5, 13);
const HUB_TICKS = ticks(LAYOUT.hubRadius + 5, 5, 45, 4, 9);
const BRACKETS = [
  arc(406, -80, -40),
  arc(406, 10, 35),
  arc(406, 100, 140),
  arc(406, 190, 215),
];
const INNER_RINGS = [168, 214, 262];
const SWEEP_SPAN = 34;
const SWEEP = (() => {
  const r = LAYOUT.mainOuter;
  const p0 = polar(C, C, r, -90);
  const p1 = polar(C, C, r, -90 + SWEEP_SPAN);
  return `M${C} ${C}L${p0.x.toFixed(2)} ${p0.y.toFixed(2)}A${r} ${r} 0 0 1 ${p1.x.toFixed(2)} ${p1.y.toFixed(2)}Z`;
})();
const SWEEP_EDGE = polar(C, C, LAYOUT.mainOuter, -90 + SWEEP_SPAN);

/** Camada atrás do anel: esfera, órbitas e réguas externas. */
export function HoloBack() {
  return (
    <g className="holo holo-back" data-testid="holo-back" aria-hidden="true">
      <g className="holo-globe">
        <circle cx={C} cy={C} r={GLOBE_R} className="holo-line holo-line--outline" />
        {LATITUDES.map((lat) => {
          const rad = (lat * Math.PI) / 180;
          const rx = GLOBE_R * Math.cos(rad);
          return (
            <ellipse key={lat} cx={C} cy={C + GLOBE_R * Math.sin(rad)} rx={rx} ry={rx * 0.16} className="holo-line" />
          );
        })}
        {Array.from({ length: MERIDIANS }, (_, i) => (
          <ellipse
            key={i}
            cx={C}
            cy={C}
            rx={GLOBE_R}
            ry={GLOBE_R}
            className="holo-line holo-meridian"
            style={{ animationDelay: `${(-i * 18) / (MERIDIANS * 2)}s` }}
          />
        ))}
      </g>
      <ellipse cx={C} cy={C} rx={438} ry={118} transform={`rotate(-24 ${C} ${C})`} className="holo-orbit" />
      <ellipse cx={C} cy={C} rx={430} ry={150} transform={`rotate(31 ${C} ${C})`} className="holo-orbit holo-orbit--rev" />
      <g className="holo-spin holo-spin--slow">
        <path d={OUTER_TICKS} className="holo-ticks" />
      </g>
      <g className="holo-spin holo-spin--rev">
        <circle cx={C} cy={C} r={378} className="holo-dots" />
      </g>
      <g className="holo-spin holo-spin--mid">
        {BRACKETS.map((d, i) => (
          <path key={i} d={d} className="holo-bracket" />
        ))}
      </g>
    </g>
  );
}

/** Camada entre o fundo do anel e as fatias: anéis internos e varredura de radar. */
export function HoloScan() {
  return (
    <g className="holo holo-scan" aria-hidden="true">
      {INNER_RINGS.map((r) => (
        <circle key={r} cx={C} cy={C} r={r} className="holo-inner-ring" />
      ))}
      <g className="holo-spin holo-spin--sweep">
        <path d={SWEEP} className="holo-sweep" />
        <line x1={C} y1={C} x2={SWEEP_EDGE.x} y2={SWEEP_EDGE.y} className="holo-sweep-edge" />
      </g>
    </g>
  );
}

/** Retícula sobre o hub central. */
export function HoloFront() {
  return (
    <g className="holo holo-front" aria-hidden="true">
      <g className="holo-spin holo-spin--hub">
        <path d={HUB_TICKS} className="holo-ticks holo-ticks--hub" />
      </g>
      <g className="holo-spin holo-spin--rev">
        {[0, 90, 180, 270].map((a) => {
          const tip = polar(C, C, LAYOUT.hubRadius + 18, a);
          const l = polar(C, C, LAYOUT.hubRadius + 28, a - 3);
          const r = polar(C, C, LAYOUT.hubRadius + 28, a + 3);
          return <path key={a} d={`M${tip.x} ${tip.y}L${l.x} ${l.y}L${r.x} ${r.y}Z`} className="holo-pip" />;
        })}
      </g>
    </g>
  );
}
