import type { CSSProperties } from "react";
import type { MenuItem } from "../shared/types";
import { LAYOUT, donutSlicePath, polar, submenuAngles, submenuItemSpan } from "./geometry";
import { SliceContent } from "./SliceContent";

interface Props {
  items: MenuItem[];
  parentAngle: number;
  activeIndex: number | null;
}

export function SubmenuRing({ items, parentAngle, activeIndex }: Props) {
  const c = LAYOUT.size / 2;
  const span = submenuItemSpan(items.length);
  const centers = submenuAngles(parentAngle, items.length);
  return (
    <g className={`submenu-ring${items.length > 5 ? " is-dense" : ""}`} data-testid="submenu">
      {items.map((item, i) => {
        const a = centers[i];
        const d = donutSlicePath(c, c, LAYOUT.subInner, LAYOUT.subOuter, a - span / 2, a + span / 2, LAYOUT.subGap);
        const mid = polar(c, c, (LAYOUT.subInner + LAYOUT.subOuter) / 2 + 3, a);
        const style = {
          "--item-color": item.color ?? "var(--accent)",
          "--stagger": `${i * 28}ms`,
        } as CSSProperties;
        return (
          <g
            key={item.id}
            className={`sub-slice${activeIndex === i ? " is-active" : ""}`}
            style={style}
            role="menuitem"
            aria-label={item.label}
          >
            {activeIndex === i && <path d={d} className="slice-halo" />}
            <path d={d} className="slice-shape" />
            <SliceContent x={mid.x} y={mid.y} icon={item.icon} label={item.label} size="sub" />
          </g>
        );
      })}
    </g>
  );
}
