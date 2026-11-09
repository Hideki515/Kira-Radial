import { getIcon } from "../shared/icons";
import { polar } from "./geometry";

interface Props {
  x: number;
  y: number;
  icon: string;
  label: string;
  size: "main" | "sub";
  active?: boolean;
  /** Imagem (data URL) no lugar do ícone vetorial. */
  iconSrc?: string;
}

/** Ícone + rótulo empilhados, centrados em (x, y). Tudo em SVG puro (sem foreignObject). */
export function SliceContent({ x, y, icon, label, size, active, iconSrc }: Props) {
  const Icon = getIcon(icon);
  const iconSize = size === "main" ? 30 : 26;
  const labelOffset = size === "main" ? 22 : 18;
  const iconOffset = size === "main" ? -14 : -12;
  return (
    <g className="slice-content" pointerEvents="none">
      {iconSrc ? (
        <image
          href={iconSrc}
          x={x - iconSize / 2}
          y={y + iconOffset - iconSize / 2}
          width={iconSize}
          height={iconSize}
          className="slice-img"
          data-testid="slice-img"
        />
      ) : (
      <Icon
        x={x - iconSize / 2}
        y={y + iconOffset - iconSize / 2}
        width={iconSize}
        height={iconSize}
        strokeWidth={1.75}
        className="slice-icon"
      />
      )}
      <text x={x} y={y + labelOffset} className={`slice-label slice-label--${size}`} textAnchor="middle">
        {label.toUpperCase()}
      </text>
      {active && size === "main" && (
        <rect x={x - 10} y={y + labelOffset + 12} width={20} height={2.5} rx={1.25} className="slice-marker" />
      )}
    </g>
  );
}

/** Número da tecla de atalho (1–9) perto da borda externa da fatia. */
export function SliceNumber({ c, r, angle, n }: { c: number; r: number; angle: number; n: number }) {
  const p = polar(c, c, r, angle);
  return (
    <text x={p.x} y={p.y + 4} className="slice-num" textAnchor="middle" pointerEvents="none" data-testid="slice-num">
      {n}
    </text>
  );
}
