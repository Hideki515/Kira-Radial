import { useRef, useState, type CSSProperties, type PointerEvent } from "react";
import type { OrbEdge } from "../shared/types";

/** Distância (px) que o mouse precisa andar com o botão pressionado para virar arrasto. */
export const DRAG_THRESHOLD = 4;

interface Props {
  /** Diâmetro em px. */
  size: number;
  accent: string;
  opacityIdle: number;
  /** Imagem própria (data URL / URL). Ausente = orbe holográfico embutido. */
  imageSrc?: string | null;
  onActivate: () => void;
  onDragStart: () => void;
  onContextMenu?: () => void;
  /** Encaixado numa borda (metade fora da tela; desliza para dentro ao passar o mouse). */
  docked?: OrbEdge | null;
  /** CPU alta: núcleo avermelhado e pulso mais rápido. */
  hot?: boolean;
  /** Volume (0–1) mostrado como arco por um instante após girar a roda. */
  volume?: number | null;
  /** Roda do mouse sobre o ícone (true = para cima). */
  onWheel?: (up: boolean) => void;
}

const VOL_R = 47;
const VOL_C = 2 * Math.PI * VOL_R;

/** Anel em wireframe (SVG estático); o giro é feito por CSS no <div> pai (só transform, roda na GPU). */
function Ring({ variant }: { variant: 1 | 2 | 3 | 4 }) {
  switch (variant) {
    case 1:
      return (
        <svg viewBox="0 0 100 100" className="orb-ring-svg">
          <circle cx="50" cy="50" r="46" strokeWidth="1.6" strokeDasharray="38 6 4 6" />
          <circle cx="50" cy="50" r="41" strokeWidth="0.7" strokeDasharray="1 3" opacity="0.7" />
        </svg>
      );
    case 2:
      return (
        <svg viewBox="0 0 100 100" className="orb-ring-svg">
          <circle cx="50" cy="50" r="46" strokeWidth="1.2" strokeDasharray="70 20 10 20" />
          <circle cx="96" cy="50" r="2.2" className="orb-node" />
        </svg>
      );
    case 3:
      return (
        <svg viewBox="0 0 100 100" className="orb-ring-svg">
          <circle cx="50" cy="50" r="46" strokeWidth="1" strokeDasharray="4 4" />
          <path d="M50 4 A46 46 0 0 1 96 50" strokeWidth="2.4" fill="none" />
        </svg>
      );
    case 4:
      return (
        <svg viewBox="0 0 100 100" className="orb-ring-svg">
          {Array.from({ length: 48 }, (_, i) => {
            const a = (i * 7.5 * Math.PI) / 180;
            const long = i % 6 === 0;
            const r0 = long ? 43 : 45.5;
            return (
              <line
                key={i}
                x1={50 + r0 * Math.cos(a)}
                y1={50 + r0 * Math.sin(a)}
                x2={50 + 48 * Math.cos(a)}
                y2={50 + 48 * Math.sin(a)}
                strokeWidth={long ? 1.4 : 0.8}
              />
            );
          })}
        </svg>
      );
  }
}

/**
 * Ícone flutuante: núcleo pulsante com anéis girando em eixos diferentes (efeito 3D).
 * Clique (sem mover) abre o menu; arrastar move a janela.
 */
export function Orb({ size, accent, opacityIdle, imageSrc, onActivate, onDragStart, onContextMenu, docked, hot, volume, onWheel }: Props) {
  const down = useRef<{ x: number; y: number; dragging: boolean } | null>(null);
  const [firing, setFiring] = useState(0);

  const onPointerDown = (e: PointerEvent) => {
    if (e.button !== 0) return;
    down.current = { x: e.screenX, y: e.screenY, dragging: false };
  };
  const onPointerMove = (e: PointerEvent) => {
    const d = down.current;
    if (!d || d.dragging) return;
    if (Math.hypot(e.screenX - d.x, e.screenY - d.y) > DRAG_THRESHOLD) {
      d.dragging = true;
      onDragStart();
    }
  };
  const onPointerUp = (e: PointerEvent) => {
    const d = down.current;
    down.current = null;
    if (e.button !== 0 || !d || d.dragging) return;
    setFiring((n) => n + 1);
    onActivate();
  };

  const style = {
    "--orb-size": `${size}px`,
    "--orb-accent": accent,
    "--orb-idle": opacityIdle,
  } as CSSProperties;

  return (
    <div className={`orb-stage${docked ? ` dock-${docked}` : ""}`} style={style} data-testid="orb-stage">
      <button
        type="button"
        className={`orb${imageSrc ? " has-image" : ""}${hot ? " is-hot" : ""}`}
        onWheel={(e) => onWheel?.(e.deltaY < 0)}
        aria-label="Abrir o menu Kira"
        data-testid="orb"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={() => (down.current = null)}
        onContextMenu={(e) => {
          e.preventDefault();
          onContextMenu?.();
        }}
      >
        <span className="orb-glow" />
        {imageSrc ? (
          <img className="orb-img" src={imageSrc} alt="" draggable={false} />
        ) : (
          <span className="orb-scene" aria-hidden="true">
            <span className="orb-tilt orb-tilt--1"><span className="orb-spin orb-spin--1"><Ring variant={1} /></span></span>
            <span className="orb-tilt orb-tilt--2"><span className="orb-spin orb-spin--2"><Ring variant={2} /></span></span>
            <span className="orb-tilt orb-tilt--3"><span className="orb-spin orb-spin--3"><Ring variant={3} /></span></span>
            <span className="orb-tilt orb-tilt--4"><span className="orb-spin orb-spin--4"><Ring variant={4} /></span></span>
            <span className="orb-core" />
          </span>
        )}
        {firing > 0 && <span key={firing} className="orb-burst" data-testid="orb-burst" />}
        {volume !== null && volume !== undefined && (
          <svg viewBox="0 0 100 100" className="orb-volume" data-testid="orb-volume" aria-label={`Volume ${Math.round(volume * 100)}%`}>
            <circle cx="50" cy="50" r={VOL_R} className="orb-volume-track" />
            <circle
              cx="50"
              cy="50"
              r={VOL_R}
              className="orb-volume-arc"
              strokeDasharray={VOL_C}
              strokeDashoffset={VOL_C * (1 - Math.max(0, Math.min(1, volume)))}
              transform="rotate(-90 50 50)"
            />
          </svg>
        )}
      </button>
    </div>
  );
}
