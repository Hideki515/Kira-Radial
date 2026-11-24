import { useLayoutEffect, useRef, useState } from "react";
import { getIcon } from "../shared/icons";
import { polar, type Sector } from "./geometry";
import { LABEL_OFFSET, LINE_H, cachedFit, canvasMeasure, computeFit, fitKey, fontOf, type Fit } from "./labelLayout";

export { minimalShift } from "./labelLayout";

interface Props {
  x: number;
  y: number;
  icon: string;
  label: string;
  size: "main" | "sub";
  active?: boolean;
  /** Imagem (data URL) no lugar do ícone vetorial. */
  iconSrc?: string;
  /** Formato da fatia: o rótulo se ajusta para caber nele. Ausente = sem ajuste. */
  sector?: Sector;
  /** Classe do <svg> do tema (chave do cache de ajustes pré-calculados). */
  themeClass?: string;
}

/** Ícone + rótulo empilhados, centrados em (x, y). Tudo em SVG puro (sem foreignObject). */
export function SliceContent({ x, y, icon, label, size, active, iconSrc, sector, themeClass }: Props) {
  const Icon = getIcon(icon);
  const iconSize = size === "main" ? 30 : 26;
  const labelOffset = LABEL_OFFSET[size];
  const iconOffset = size === "main" ? -14 : -12;
  const text = label.toUpperCase();
  const measureRef = useRef<SVGTextElement>(null);
  // Ajuste já pré-calculado (prewarmLabels) ou de uma abertura anterior: sai na 1ª renderização.
  const key = sector && themeClass ? fitKey(themeClass, size, text, x, y, sector) : null;
  const ready = key ? cachedFit(key) : undefined;
  const [measured, setMeasured] = useState<{ key: string; fit: Fit } | null>(null);
  const fit = ready ?? (measured && (!key || measured.key === key) ? measured.fit : null);

  // Faltou no cache (ex.: submenu automático): mede antes de pintar, com a fonte do tema.
  useLayoutEffect(() => {
    const el = measureRef.current;
    if (!el || !sector || ready) return;
    const theme = themeClass ?? el.ownerSVGElement?.getAttribute("class") ?? "";
    const k = key ?? fitKey(theme, size, text, x, y, sector);
    if (measured?.key === k) return;
    const font = fontOf(theme, size, el);
    const measure =
      canvasMeasure(font) ??
      (typeof el.getComputedTextLength === "function"
        ? (t: string, sc: number) => {
            // Sem canvas (testes): mede no próprio SVG.
            el.style.fontSize = `${font.size * sc}px`;
            el.textContent = t;
            const w = el.getComputedTextLength();
            el.textContent = "";
            el.style.fontSize = "";
            return w;
          }
        : null);
    if (!measure) return;
    setMeasured({ key: k, fit: computeFit(k, text, size, x, y, sector, font, measure) });
  });

  const lines = fit?.lines ?? [text];
  const fontSize = fit && fit.scale !== 1 ? fit.base * fit.scale : undefined;
  const lh = (fit ? fit.base * fit.scale : 0) * LINE_H;
  // Duas linhas: ícone e texto sobem meia linha para continuar centrados na fatia.
  const shift = lines.length > 1 ? lh / 2 : 0;
  const cut = lines.length === 1 && lines[0] !== text;

  return (
    <g className="slice-content" pointerEvents="none" transform={shift ? `translate(0 ${-shift.toFixed(1)})` : undefined}>
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
      <text
        x={x + (fit?.dx[0] ?? 0)}
        y={y + labelOffset}
        className={`slice-label slice-label--${size}`}
        textAnchor="middle"
        style={fontSize ? { fontSize: `${fontSize.toFixed(2)}px` } : undefined}
        data-fit={fit ? `${lines.length}:${fit.scale}` : undefined}
      >
        {cut && <title>{text}</title>}
        {lines.length === 1
          ? lines[0]
          : lines.map((l, i) => (
              <tspan key={i} x={x + (fit?.dx[i] ?? 0)} dy={i === 0 ? 0 : lh.toFixed(2)}>
                {l}
              </tspan>
            ))}
      </text>
      {/* Só para medir (invisível): o texto real acima não é tocado fora do React. */}
      {sector && !ready && <text ref={measureRef} className={`slice-label slice-label--${size}`} visibility="hidden" aria-hidden="true" />}
      {active && size === "main" && (
        <rect x={x - 10} y={y + labelOffset + 12 + (lines.length - 1) * lh} width={20} height={2.5} rx={1.25} className="slice-marker" />
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

/** Selo de estado (Discord ligado/mutado, OBS gravando): bolinha perto da borda externa. */
export function SliceBadge({ c, r, angle, kind }: { c: number; r: number; angle: number; kind: "on" | "off" | "live" }) {
  const p = polar(c, c, r, angle);
  return <circle cx={p.x.toFixed(1)} cy={p.y.toFixed(1)} r={5} className={`slice-badge slice-badge--${kind}`} pointerEvents="none" data-testid={`slice-badge-${kind}`} />;
}
