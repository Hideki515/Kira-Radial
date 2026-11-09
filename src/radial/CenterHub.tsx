import { useClock } from "../hooks/useClock";
import type { StatsPayload } from "../shared/ipc";
import { LAYOUT } from "./geometry";

interface Props {
  stats: StatsPayload | null;
  showCpu: boolean;
  showClock: boolean;
  hovered: boolean;
  inSubmenu: boolean;
}

const GAUGE_R = 88;
const CIRC = 2 * Math.PI * GAUGE_R;

export function CenterHub({ stats, showCpu, showClock, hovered, inSubmenu }: Props) {
  const { time, date } = useClock();
  const c = LAYOUT.size / 2;
  const cpu = stats ? Math.round(stats.cpu) : null;
  const offset = CIRC * (1 - (cpu ?? 0) / 100);
  return (
    <g className={`center-hub${hovered ? " is-hovered" : ""}`} aria-label={inSubmenu ? "Voltar" : "Fechar"}>
      <circle cx={c} cy={c} r={LAYOUT.mainInner - 6} className="hub-well" />
      <circle cx={c} cy={c} r={LAYOUT.hubRadius} className="hub-disc" />
      {showCpu && (
        <>
          <circle cx={c} cy={c} r={GAUGE_R} className="hub-track" />
          {/* Halo do medidor: mesmo arco, mais largo e translúcido (sem filtro). */}
          <circle
            cx={c}
            cy={c}
            r={GAUGE_R}
            className="hub-gauge-halo"
            strokeDasharray={CIRC}
            strokeDashoffset={offset}
            transform={`rotate(-90 ${c} ${c})`}
          />
          <circle
            cx={c}
            cy={c}
            r={GAUGE_R}
            className="hub-gauge"
            strokeDasharray={CIRC}
            strokeDashoffset={offset}
            transform={`rotate(-90 ${c} ${c})`}
          />
        </>
      )}
      {showClock && (
        <>
          <text x={c} y={c - 44} className="hub-time" textAnchor="middle">{time}</text>
          <text x={c} y={c - 24} className="hub-date" textAnchor="middle">{date}</text>
        </>
      )}
      {showCpu && (
        <>
          <text x={c} y={c + 18} className="hub-cpu" textAnchor="middle">{cpu === null ? "—" : `${cpu}%`}</text>
          <rect x={c - 24} y={c + 30} width={48} height={18} rx={9} className="hub-pill" />
          <text x={c} y={c + 42.5} className="hub-pill-text" textAnchor="middle">CPU</text>
        </>
      )}
    </g>
  );
}
