import type { CSSProperties } from "react";
import type { MenuItem } from "../shared/types";
import { LAYOUT, donutSlicePath, polar, sliceAngle, sliceSpan } from "./geometry";
import { SliceContent } from "./SliceContent";

interface Props {
  item: MenuItem;
  index: number;
  count: number;
  active: boolean;
  dimmed: boolean;
}

export function MainSlice({ item, index, count, active, dimmed }: Props) {
  const c = LAYOUT.size / 2;
  const angle = sliceAngle(index, count);
  const span = sliceSpan(count);
  const d = donutSlicePath(c, c, LAYOUT.mainInner, LAYOUT.mainOuter, angle - span / 2, angle + span / 2, LAYOUT.mainGap);
  const mid = polar(c, c, (LAYOUT.mainInner + LAYOUT.mainOuter) / 2 + 12, angle);
  const cls = ["main-slice", active && "is-active", dimmed && "is-dimmed", item.children?.length && "has-children"]
    .filter(Boolean)
    .join(" ");
  return (
    <g className={cls} data-testid="main-slice" aria-label={item.label} role="menuitem" style={{ "--i": index } as CSSProperties}>
      {/* Halo: traço largo e translúcido sob a borda (substitui filter: drop-shadow, caro). */}
      {active && <path d={d} className="slice-halo" />}
      <path d={d} className="slice-shape" />
      <SliceContent x={mid.x} y={mid.y} icon={item.icon} label={item.label} size="main" active={active} />
    </g>
  );
}
