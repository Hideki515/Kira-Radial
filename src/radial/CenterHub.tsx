import { useClock } from "../hooks/useClock";
import type { NowPlaying, StatsPayload } from "../shared/ipc";
import { LAYOUT } from "./geometry";

interface Props {
  stats: StatsPayload | null;
  showCpu: boolean;
  showClock: boolean;
  hovered: boolean;
  inSubmenu: boolean;
  /** Música/vídeo em reprodução: substitui CPU/relógio grande pela capa + título. */
  nowPlaying?: NowPlaying | null;
  /** Volume (0–1) exibido por um instante ao girar a roda sobre o centro. */
  volume?: number | null;
}

const GAUGE_R = 88;
const CIRC = 2 * Math.PI * GAUGE_R;
const COVER_R = 40;

const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

function Gauge({ c, value, className }: { c: number; value: number; className: string }) {
  const offset = CIRC * (1 - Math.max(0, Math.min(1, value)));
  return (
    <>
      <circle cx={c} cy={c} r={GAUGE_R} className="hub-track" />
      {/* Halo do medidor: mesmo arco, mais largo e translúcido (sem filtro). */}
      <circle cx={c} cy={c} r={GAUGE_R} className={`hub-gauge-halo ${className}-halo`} strokeDasharray={CIRC} strokeDashoffset={offset} transform={`rotate(-90 ${c} ${c})`} />
      <circle cx={c} cy={c} r={GAUGE_R} className={`hub-gauge ${className}`} strokeDasharray={CIRC} strokeDashoffset={offset} transform={`rotate(-90 ${c} ${c})`} />
    </>
  );
}

export function CenterHub({ stats, showCpu, showClock, hovered, inSubmenu, nowPlaying, volume }: Props) {
  const { time, date } = useClock();
  const c = LAYOUT.size / 2;
  const cpu = stats ? Math.round(stats.cpu) : null;
  const showVolume = volume !== null && volume !== undefined;
  return (
    <g className={`center-hub${hovered ? " is-hovered" : ""}${nowPlaying ? " has-media" : ""}`} aria-label={inSubmenu ? "Voltar" : "Fechar"}>
      <circle cx={c} cy={c} r={LAYOUT.mainInner - 6} className="hub-well" />
      <circle cx={c} cy={c} r={LAYOUT.hubRadius} className="hub-disc" />

      {showVolume ? (
        <g data-testid="hub-volume">
          <Gauge c={c} value={volume} className="hub-vol" />
        </g>
      ) : (
        showCpu && !nowPlaying && <Gauge c={c} value={(cpu ?? 0) / 100} className="hub-cpu-gauge" />
      )}

      {nowPlaying ? (
        <g data-testid="hub-media">
          <defs>
            <clipPath id="hub-cover-clip">
              <circle cx={c} cy={c - 18} r={COVER_R} />
            </clipPath>
          </defs>
          {nowPlaying.thumb ? (
            <image
              href={nowPlaying.thumb}
              x={c - COVER_R}
              y={c - 18 - COVER_R}
              width={COVER_R * 2}
              height={COVER_R * 2}
              preserveAspectRatio="xMidYMid slice"
              clipPath="url(#hub-cover-clip)"
              data-testid="hub-cover"
            />
          ) : (
            <circle cx={c} cy={c - 18} r={COVER_R} className="hub-cover-empty" />
          )}
          <circle cx={c} cy={c - 18} r={COVER_R} className="hub-cover-ring" />
          {!nowPlaying.playing && (
            <text x={c} y={c - 12} className="hub-paused" textAnchor="middle">❚❚</text>
          )}
          <text x={c} y={c + 42} className="hub-np-title" textAnchor="middle">{clip(nowPlaying.title, 22)}</text>
          <text x={c} y={c + 58} className="hub-np-artist" textAnchor="middle">{clip(nowPlaying.artist || nowPlaying.app, 28)}</text>
          {showClock && <text x={c} y={c - 70} className="hub-np-time" textAnchor="middle">{time}</text>}
        </g>
      ) : (
        <>
          {showClock && (
            <>
              <text x={c} y={c - 44} className="hub-time" textAnchor="middle">{time}</text>
              <text x={c} y={c - 24} className="hub-date" textAnchor="middle">{date}</text>
            </>
          )}
          {showCpu && !showVolume && (
            <>
              <text x={c} y={c + 18} className="hub-cpu" textAnchor="middle">{cpu === null ? "—" : `${cpu}%`}</text>
              <rect x={c - 24} y={c + 30} width={48} height={18} rx={9} className="hub-pill" />
              <text x={c} y={c + 42.5} className="hub-pill-text" textAnchor="middle">CPU</text>
            </>
          )}
        </>
      )}

      {showVolume && (
        <g data-testid="hub-volume-text">
          <rect x={c - 30} y={c + 70} width={60} height={18} rx={9} className="hub-pill" />
          <text x={c} y={c + 82.5} className="hub-pill-text" textAnchor="middle">{`VOL ${Math.round(volume * 100)}%`}</text>
        </g>
      )}
    </g>
  );
}
