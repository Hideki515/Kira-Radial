import { getIcon } from "../shared/icons";

interface Props {
  x: number;
  y: number;
  icon: string;
  label: string;
  size: "main" | "sub";
  active?: boolean;
}

/** Ícone + rótulo empilhados, centrados em (x, y). Tudo em SVG puro (sem foreignObject). */
export function SliceContent({ x, y, icon, label, size, active }: Props) {
  const Icon = getIcon(icon);
  const iconSize = size === "main" ? 30 : 26;
  const labelOffset = size === "main" ? 22 : 18;
  const iconOffset = size === "main" ? -14 : -12;
  return (
    <g className="slice-content" pointerEvents="none">
      <Icon
        x={x - iconSize / 2}
        y={y + iconOffset - iconSize / 2}
        width={iconSize}
        height={iconSize}
        strokeWidth={1.75}
        className="slice-icon"
      />
      <text x={x} y={y + labelOffset} className={`slice-label slice-label--${size}`} textAnchor="middle">
        {label.toUpperCase()}
      </text>
      {active && size === "main" && (
        <rect x={x - 10} y={y + labelOffset + 12} width={20} height={2.5} rx={1.25} className="slice-marker" />
      )}
    </g>
  );
}
