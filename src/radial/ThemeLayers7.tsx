/**
 * Camadas decorativas do pacote "Tecnologia 4": Chuva de código, Scanner LiDAR e Rack de áudio.
 * Nada captura o ponteiro. Poucas animações por tema (elementos agrupados), só em
 * transform/opacity e a 15 quadros/s alinhados (passos múltiplos de 1/15 s).
 */
import { LAYOUT, polar } from "./geometry";
import { seq } from "./ThemeLayers3";

const C = LAYOUT.size / 2;
const OUT = LAYOUT.subOuter;
const R = OUT + 78;
const f = (n: number) => n.toFixed(1);

// ---------------------------------------------------------------------------
// Chuva de código — colunas de caracteres descendo atrás do anel.

const GLYPHS = "0123456789ABCDEF<>{}[]=+*/#$%&";
/** A chuva só até a borda externa do sub-anel (antes ia até OUT + 78 e ficava larga demais). */
export const RAIN_R = OUT + 6;
const COLS = 11;
const LINE = 18;
/** Período vertical do desenho: descer exatamente isto emenda sem pulo. */
export const RAIN_PERIOD = 20 * LINE;
const PERIODS = 4;
/** Cada coluna: posição, e duas "gotas" por período (início em linhas, comprimento, caracteres). */
const RAIN = Array.from({ length: COLS }, (_, i) => {
  const x = C - RAIN_R + ((i + 0.5) * 2 * RAIN_R) / COLS;
  const drops = [0, 1].map((d) => {
    const [a, b] = seq(2, i * 37 + d * 11 + 5);
    const len = 5 + Math.floor(b * 4);
    const start = d * 10 + Math.floor(a * (10 - len));
    const chars = seq(len, i * 101 + d * 7 + 3).map((r) => GLYPHS[Math.floor(r * GLYPHS.length)]);
    return { start, chars };
  });
  return { x, drops, fast: i % 2 === 1 };
});

function RainColumn({ col }: { col: (typeof RAIN)[number] }) {
  const top = C - RAIN_R - RAIN_PERIOD;
  return (
    <>
      {Array.from({ length: PERIODS }, (_, k) =>
        col.drops.map((d, j) => (
          <text key={`${k}-${j}`} x={f(col.x)} y={f(top + k * RAIN_PERIOD + d.start * LINE)} textAnchor="middle">
            {d.chars.map((ch, n) => (
              // A cabeça (último caractere, embaixo) é a mais clara; a cauda vai sumindo.
              <tspan key={n} x={f(col.x)} dy={n ? LINE : 0} className={n === d.chars.length - 1 ? "rain-head" : undefined} fillOpacity={n === d.chars.length - 1 ? undefined : (0.15 + (0.7 * n) / d.chars.length).toFixed(2)}>
                {ch}
              </tspan>
            ))}
          </text>
        )),
      )}
    </>
  );
}

export function RainBack() {
  return (
    <g className="rain rain-back" data-testid="rain-back" aria-hidden="true">
      <defs>
        <clipPath id="rain-clip">
          <circle cx={C} cy={C} r={RAIN_R} />
        </clipPath>
      </defs>
      <circle cx={C} cy={C} r={RAIN_R} className="rain-dark" />
      <g clipPath="url(#rain-clip)">
        {/* Duas velocidades = duas animações (colunas pares devagar, ímpares rápidas). */}
        <g className="rain-fall rain-fall--slow">
          {RAIN.filter((c) => !c.fast).map((c, i) => <RainColumn key={i} col={c} />)}
        </g>
        <g className="rain-fall rain-fall--fast">
          {RAIN.filter((c) => c.fast).map((c, i) => <RainColumn key={i} col={c} />)}
        </g>
      </g>
      <circle cx={C} cy={C} r={RAIN_R} className="rain-rim" />
    </g>
  );
}

// ---------------------------------------------------------------------------
// Scanner LiDAR — nuvem de pontos (paredes em arco + pontos soltos) e um leque de varredura.

const WALLS = seq(8, 911).map((r, i) => {
  const [b, c] = seq(2, i * 19 + 13);
  return { r: OUT + 14 + b * 60, a0: i * 45 + r * 15, span: 22 + c * 26 };
});
const CLOUD = [
  ...WALLS.flatMap((w, i) => {
    const n = Math.round(w.span / 2.2);
    return seq(n, i * 53 + 1).map((j, k) => polar(C, C, w.r + (j - 0.5) * 7, w.a0 + (k * w.span) / n));
  }),
  ...seq(70, 337).map((r, i) => {
    const [b] = seq(1, i * 7 + 2);
    return polar(C, C, LAYOUT.mainOuter + 16 + b * (R - LAYOUT.mainOuter - 22), r * 360);
  }),
];
/** Leque: 4 fatias finas com brilho decrescente atrás da linha da frente (sem degradê). */
const FAN = [0, 1, 2, 3].map((i) => {
  const a0 = -90 - (i + 1) * 9;
  const a1 = -90 - i * 9;
  const p0 = polar(C, C, R, a0);
  const p1 = polar(C, C, R, a1);
  return `M${C} ${C}L${f(p0.x)} ${f(p0.y)}A${R} ${R} 0 0 1 ${f(p1.x)} ${f(p1.y)}Z`;
});

export function LidarBack() {
  const edge = polar(C, C, R, -90);
  return (
    <g className="lidar lidar-back" data-testid="lidar-back" aria-hidden="true">
      <circle cx={C} cy={C} r={R} className="lidar-dark" />
      <circle cx={C} cy={C} r={OUT + 30} className="lidar-range" />
      <circle cx={C} cy={C} r={OUT + 62} className="lidar-range" />
      <g className="lidar-cloud">
        {CLOUD.map((p, i) => <circle key={i} cx={f(p.x)} cy={f(p.y)} r={1.7} />)}
      </g>
      <g className="lidar-sweep">
        {FAN.map((d, i) => <path key={i} d={d} className={`lidar-fan lidar-fan--${i}`} />)}
        <line x1={C} y1={C} x2={f(edge.x)} y2={f(edge.y)} className="lidar-edge" />
      </g>
    </g>
  );
}

// ---------------------------------------------------------------------------
// Rack de áudio — painel de metal escovado com barras de LED (verde, amarelo, vermelho) em volta.

const BARS = 20;
const SEGS = 7;
const SEG_STEP = 7.5;
/** Nível de cada barra em 3 momentos (o "som" muda a cada 0,4 s). */
const LEVELS = [0, 1, 2].map((ph) => seq(BARS, 443 + ph * 61).map((r) => 1 + Math.floor(r * SEGS)));
const segColor = (s: number) => (s < 4 ? "vu-g" : s < 6 ? "vu-y" : "vu-r");

function segPath(bar: number, s: number): string {
  const a = (bar * 360) / BARS + 360 / BARS / 2;
  const p0 = polar(C, C, OUT + 12 + s * SEG_STEP, a);
  const p1 = polar(C, C, OUT + 12 + s * SEG_STEP + 5.5, a);
  return `M${f(p0.x)} ${f(p0.y)}L${f(p1.x)} ${f(p1.y)}`;
}
/** Um path por cor (menos elementos): todos os segmentos daquela cor juntos. */
function segments(pick: (bar: number, s: number) => boolean): Record<string, string> {
  const out: Record<string, string> = { "vu-g": "", "vu-y": "", "vu-r": "" };
  for (let b = 0; b < BARS; b++) for (let s = 0; s < SEGS; s++) if (pick(b, s)) out[segColor(s)] += segPath(b, s);
  return out;
}
const BASE = segments(() => true);
const LIT = LEVELS.map((lv) => segments((b, s) => s < lv[b]));
const SCREWS = [45, 135, 225, 315].map((a) => polar(C, C, R - 14, a));

export function VuBack() {
  return (
    <g className="vu vu-back" data-testid="vu-back" aria-hidden="true">
      <defs>
        <pattern id="vu-brush" width="6" height="3" patternUnits="userSpaceOnUse">
          <rect width="6" height="1" className="vu-brush-line" />
        </pattern>
        <clipPath id="vu-clip">
          <circle cx={C} cy={C} r={R} />
        </clipPath>
      </defs>
      <circle cx={C} cy={C} r={R} className="vu-panel" />
      <rect x={C - R} y={C - R} width={R * 2} height={R * 2} fill="url(#vu-brush)" clipPath="url(#vu-clip)" />
      <circle cx={C} cy={C} r={R} className="vu-rim" />
      {SCREWS.map((p, i) => (
        <g key={i} transform={`translate(${f(p.x)} ${f(p.y)})`} className="vu-screw">
          <circle r={6} />
          <path d="M-3.5 0H3.5M0 -3.5V3.5" />
        </g>
      ))}
      <g className="vu-leds vu-leds--off">
        {Object.entries(BASE).map(([cls, d]) => <path key={cls} d={d} className={cls} />)}
      </g>
      {LIT.map((lit, ph) => (
        <g key={ph} className="vu-leds vu-leds--on vu-phase" style={{ animationDelay: `${-ph * 0.4}s` }}>
          {Object.entries(lit).map(([cls, d]) => (d ? <path key={cls} d={d} className={cls} /> : null))}
        </g>
      ))}
    </g>
  );
}
