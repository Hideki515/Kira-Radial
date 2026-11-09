import type { StatsPayload } from "../shared/ipc";
import type { Config, MenuItem } from "../shared/types";
import { CenterHub } from "./CenterHub";
import { HoloBack, HoloFront, HoloScan } from "./HoloLayer";
import { LAYOUT, polar, sliceAngle } from "./geometry";
import { MainSlice } from "./MainSlice";
import { SubmenuRing } from "./SubmenuRing";

export interface RadialCanvasProps {
  items: MenuItem[];
  activeMain: number | null;
  activeSub: number | null;
  /** Fatia com sub-anel aberto. Omitido = segue activeMain (pré-visualização das configurações). */
  openMain?: number | null;
  hubHovered: boolean;
  stats: StatsPayload | null;
  appearance: Config["appearance"];
}

const C = LAYOUT.size / 2;

/** Arco decorativo da órbita externa. */
function orbitArc(r: number, a0: number, a1: number): string {
  const p0 = polar(C, C, r, a0);
  const p1 = polar(C, C, r, a1);
  return `M${p0.x} ${p0.y} A${r} ${r} 0 0 1 ${p1.x} ${p1.y}`;
}

const ORBIT_ARCS: [number, number, number][] = [
  // [raio, início, fim] — posições inspiradas na referência
  [LAYOUT.subOuter + 22, -72, -58],
  [LAYOUT.subOuter + 14, 8, 22],
  [LAYOUT.subOuter + 22, 104, 116],
  [LAYOUT.subOuter + 18, 196, 214],
];

/** Componente puramente visual — reutilizado pela janela radial e pelo preview das configurações. */
export function RadialCanvas({ items, activeMain, activeSub, openMain, hubHovered, stats, appearance }: RadialCanvasProps) {
  const subParent = openMain === undefined ? activeMain : openMain;
  const parentItem = subParent !== null ? items[subParent] : undefined;
  const children = parentItem?.children ?? [];
  const subOpen = subParent !== null && children.length > 0;
  // Pré-visualização: escurece só com um subitem escolhido (como antes). Menu real: sempre que o sub-anel está aberto.
  const dimOthers = openMain === undefined ? activeSub !== null : subOpen;
  const holo = appearance.theme === "holo";
  return (
    <svg className={`radial-canvas theme-${holo ? "holo" : "glass"}`} viewBox={`0 0 ${LAYOUT.size} ${LAYOUT.size}`} role="menu" aria-label="Menu radial">
      <defs>
        <radialGradient id="slice-glass" cx={C} cy={C} r={LAYOUT.subOuter} gradientUnits="userSpaceOnUse">
          <stop offset="0.35" stopColor="#0a0f17" />
          <stop offset="0.75" stopColor="#0d1420" />
          <stop offset="1" stopColor="#111a29" />
        </radialGradient>
        <radialGradient id="slice-hot" cx={C} cy={C} r={LAYOUT.mainOuter} gradientUnits="userSpaceOnUse">
          {/* cores via CSS (.stop-hot-*) para seguir a cor de destaque configurável */}
          <stop offset="0.45" className="stop-hot-deep" />
          <stop offset="1" className="stop-hot-soft" />
        </radialGradient>
        <radialGradient id="hub-glass" cx="0.45" cy="0.3" r="0.8">
          <stop offset="0" stopColor="#1d2533" />
          <stop offset="1" stopColor="#0c1118" />
        </radialGradient>
        <radialGradient id="glow-teal">
          <stop offset="0" stopColor="#1f6f6a" stopOpacity="0.35" />
          <stop offset="1" stopColor="#1f6f6a" stopOpacity="0" />
        </radialGradient>
        <radialGradient id="glow-violet">
          <stop offset="0" stopColor="#5b4a8a" stopOpacity="0.3" />
          <stop offset="1" stopColor="#5b4a8a" stopOpacity="0" />
        </radialGradient>
      </defs>

      {holo ? (
        <HoloBack />
      ) : (
        <>
          {/* brilhos ambientes */}
          <circle cx={C + 250} cy={C - 250} r={170} fill="url(#glow-teal)" className="ambient" />
          <circle cx={C - 280} cy={C + 250} r={150} fill="url(#glow-violet)" className="ambient" />

          {/* órbitas */}
          <circle cx={C} cy={C} r={LAYOUT.subOuter + 10} className="orbit-soft" />
          {ORBIT_ARCS.map(([r, a0, a1], i) => (
            <path key={i} d={orbitArc(r, a0, a1)} className="orbit-hot" />
          ))}
        </>
      )}

      {/* fundo escuro sob o anel: as frestas entre fatias não mostram a área de trabalho */}
      <circle cx={C} cy={C} r={LAYOUT.mainOuter + 4} className="ring-backing" />
      {holo && <HoloScan />}

      <g className="main-slices">
        {items.map((item, i) => (
          <MainSlice
            key={item.id}
            item={item}
            index={i}
            count={items.length}
            active={activeMain === i}
            dimmed={dimOthers && subParent !== i && activeMain !== i}
          />
        ))}
      </g>

      {subOpen && (
        <SubmenuRing
          key={parentItem!.id}
          items={children}
          parentAngle={sliceAngle(subParent!, items.length)}
          activeIndex={activeSub}
        />
      )}

      <CenterHub
        stats={stats}
        showCpu={appearance.showCpu}
        showClock={appearance.showClock}
        hovered={hubHovered}
        inSubmenu={openMain === undefined ? activeSub !== null : subOpen}
      />
      {holo && <HoloFront />}
    </svg>
  );
}
