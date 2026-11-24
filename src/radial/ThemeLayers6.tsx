/**
 * Camadas decorativas do pacote "Tecnologia 3": Display vetorial, Mapa térmico e Glitch CRT.
 * Nada captura o ponteiro. Como nos outros temas tecnológicos, poucas animações por tema
 * (elementos agrupados), só em transform/opacity e a 15 quadros/s alinhados.
 */
import { LAYOUT, polar } from "./geometry";
import { seq } from "./ThemeLayers3";

const C = LAYOUT.size / 2;
const OUT = LAYOUT.subOuter;
const f = (n: number) => n.toFixed(1);

/** Polígono regular de `n` lados no raio r, girado `rot` graus. */
function polygon(n: number, r: number, rot = 0): string {
  return (
    Array.from({ length: n }, (_, i) => {
      const p = polar(C, C, r, rot + (i * 360) / n);
      return `${i ? "L" : "M"}${f(p.x)} ${f(p.y)}`;
    }).join("") + "Z"
  );
}

// ---------------------------------------------------------------------------
// Display vetorial — linhas finas e brilhantes em fundo preto (fliperama vetorial dos anos 80).

const TUNNEL = [OUT + 14, OUT + 34, OUT + 58];
const SIDES = 8;
/** Raios do "túnel": ligam os vértices do octógono interno ao externo. */
const SPOKES = Array.from({ length: SIDES }, (_, i) => {
  const a = (i * 360) / SIDES + 22.5;
  const p0 = polar(C, C, TUNNEL[0], a);
  const p1 = polar(C, C, TUNNEL[2], a);
  return `M${f(p0.x)} ${f(p0.y)}L${f(p1.x)} ${f(p1.y)}`;
}).join("");
/** Estrelas: pontos fixos fora do anel (determinísticos). */
const STARS = seq(40, 613).map((r, i) => {
  const [b, c] = seq(2, i * 17 + 3);
  return { ...polar(C, C, OUT + 70 + b * 28, r * 360), s: 0.8 + c * 1.2 };
});

export function VectorBack() {
  return (
    <g className="vector vector-back" data-testid="vector-back" aria-hidden="true">
      <circle cx={C} cy={C} r={OUT + 100} className="vector-void" />
      <g className="vector-stars">
        {STARS.map((s, i) => <circle key={i} cx={f(s.x)} cy={f(s.y)} r={s.s.toFixed(2)} />)}
      </g>
      {/* Brilho = traço largo translúcido sob o fino (sem filtros). */}
      <g className="vector-spin">
        <path d={TUNNEL.map((r) => polygon(SIDES, r, 22.5)).join("") + SPOKES} className="vector-glow" />
        <path d={TUNNEL.map((r) => polygon(SIDES, r, 22.5)).join("") + SPOKES} className="vector-line" />
      </g>
      <path d={polygon(3, OUT + 86, -90)} className="vector-line vector-line--dim" />
    </g>
  );
}

// ---------------------------------------------------------------------------
// Mapa térmico — câmera térmica: fundo frio (roxo/azul), manchas de calor, a fatia ativa "quente".

const HEAT = seq(9, 821).map((r, i) => {
  const [b, c] = seq(2, i * 29 + 11);
  return { ...polar(C, C, OUT + 10 + b * 40, i * 40 + r * 20), r: 38 + c * 40, level: i % 3 };
});

const HEAT_COLORS = ["#7b1fa2", "#d81b60", "#ff8f00"];

export function ThermalBack() {
  const R = OUT + 78;
  return (
    <g className="thermal thermal-back" data-testid="thermal-back" aria-hidden="true">
      <defs>
        {/* Fatia ativa: do laranja (perto do centro) ao branco-amarelado (borda). */}
        <radialGradient id="thermal-hot" cx={C} cy={C} r={LAYOUT.mainOuter} gradientUnits="userSpaceOnUse">
          <stop offset="0.45" stopColor="#e8380d" />
          <stop offset="0.78" stopColor="#ffae00" />
          <stop offset="1" stopColor="#fff4c2" />
        </radialGradient>
        <radialGradient id="thermal-cold" cx={C} cy={C} r={LAYOUT.mainOuter} gradientUnits="userSpaceOnUse">
          <stop offset="0.45" stopColor="#1a0a4a" />
          <stop offset="1" stopColor="#3a1478" />
        </radialGradient>
        {/* Uma mancha por nível de calor: a cor no meio, transparente na borda. */}
        {HEAT_COLORS.map((c, i) => (
          <radialGradient key={c} id={`thermal-blob-${i}`}>
            <stop offset="0" stopColor={c} stopOpacity="1" />
            <stop offset="1" stopColor={c} stopOpacity="0" />
          </radialGradient>
        ))}
        <linearGradient id="thermal-scale" x1="0" y1="1" x2="0" y2="0">
          <stop offset="0" stopColor="#1b0a5c" />
          <stop offset="0.35" stopColor="#a1127a" />
          <stop offset="0.65" stopColor="#ff6a00" />
          <stop offset="0.9" stopColor="#ffd400" />
          <stop offset="1" stopColor="#fffbe6" />
        </linearGradient>
      </defs>
      <circle cx={C} cy={C} r={R} className="thermal-field" />
      {/* Manchas de calor: círculos com degradê (mesma cor, transparente na borda), por nível. */}
      <g className="thermal-heat">
        {HEAT.map((h, i) => (
          <circle key={i} cx={f(h.x)} cy={f(h.y)} r={f(h.r)} fill={`url(#thermal-blob-${h.level})`} className={`thermal-l${h.level}`} />
        ))}
      </g>
      {/* Retícula da câmera e régua de temperatura. */}
      <path d={`M${C - R + 18} ${C}h26M${C + R - 44} ${C}h26M${C} ${C - R + 18}v26M${C} ${C + R - 44}v26`} className="thermal-reticle" />
      <rect x={C + R - 6} y={C - 90} width={10} height={180} rx={3} fill="url(#thermal-scale)" className="thermal-bar" />
      <text x={C + R + 10} y={C - 84} className="thermal-temp">38°</text>
      <text x={C + R + 10} y={C + 92} className="thermal-temp">19°</text>
    </g>
  );
}

// ---------------------------------------------------------------------------
// Glitch CRT — monitor de tubo: linhas de varredura, vinheta, bordas com aberração cromática
// (vermelho/ciano deslocados) e faixas de falha que piscam de vez em quando.

const GLITCH = seq(5, 977).map((r, i) => {
  const [b, c] = seq(2, i * 13 + 7);
  return { y: C - 300 + r * 600, h: 4 + b * 14, w: 120 + c * 260, x: C - 300 + c * 200 };
});

export function CrtBack() {
  const R = OUT + 82;
  return (
    <g className="crt crt-back" data-testid="crt-back" aria-hidden="true">
      <defs>
        <pattern id="crt-scan" width="4" height="4" patternUnits="userSpaceOnUse">
          <rect width="4" height="2" className="crt-scanline" />
        </pattern>
        <radialGradient id="crt-vignette" cx={C} cy={C} r={R} gradientUnits="userSpaceOnUse">
          <stop offset="0.6" stopColor="#000" stopOpacity="0" />
          <stop offset="1" stopColor="#000" stopOpacity="0.85" />
        </radialGradient>
        <clipPath id="crt-clip">
          <circle cx={C} cy={C} r={R} />
        </clipPath>
      </defs>
      <circle cx={C} cy={C} r={R} className="crt-glass" />
      {/* Aberração cromática: o mesmo aro em vermelho e ciano, deslocados 3 px. */}
      <circle cx={C - 3} cy={C} r={LAYOUT.mainOuter + 6} className="crt-split crt-split--r" />
      <circle cx={C + 3} cy={C} r={LAYOUT.mainOuter + 6} className="crt-split crt-split--c" />
      <circle cx={C - 3} cy={C} r={OUT + 18} className="crt-split crt-split--r" />
      <circle cx={C + 3} cy={C} r={OUT + 18} className="crt-split crt-split--c" />
      <g clipPath="url(#crt-clip)">
        <rect x={C - R} y={C - R} width={R * 2} height={R * 2} fill="url(#crt-scan)" />
        {/* Faixa clara que desce devagar pela tela (uma animação). */}
        <rect x={C - R} y={C - R} width={R * 2} height={70} className="crt-roll" />
        {/* Falhas: aparecem por instantes, todas juntas (um grupo animado). */}
        <g className="crt-glitch">
          {GLITCH.map((g, i) => (
            <rect key={i} x={f(g.x)} y={f(g.y)} width={f(g.w)} height={f(g.h)} className={i % 2 ? "crt-glitch-c" : "crt-glitch-r"} />
          ))}
        </g>
      </g>
      <circle cx={C} cy={C} r={R} fill="url(#crt-vignette)" />
      <circle cx={C} cy={C} r={R} className="crt-bezel" />
    </g>
  );
}

/** Varredura do CRT também por cima do anel e do centro (padrão estático: pinta uma vez). */
export function CrtFront() {
  return (
    <g className="crt-front" aria-hidden="true">
      <circle cx={C} cy={C} r={LAYOUT.mainOuter + 4} fill="url(#crt-scan)" className="crt-front-scan" />
    </g>
  );
}
