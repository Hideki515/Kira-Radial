import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { RadialCanvas } from "../radial/RadialCanvas";
import { LAYOUT, polar, sliceAngle, submenuAngles } from "../radial/geometry";
import { defaultConfig } from "../shared/defaults";
import type { MenuItem, Profile } from "../shared/types";
import type { Selection } from "./pages/ItemsPage";
import { PreviewEditor } from "./PreviewEditor";

const C = LAYOUT.size / 2;
const a = (id: string): MenuItem => ({ id, label: id, icon: "code", action: { type: "openSettings" } });

beforeAll(() => {
  // jsdom não tem layout: o <svg> ocupa 900×900 a partir de (0,0), igual ao viewBox.
  vi.spyOn(Element.prototype, "getBoundingClientRect").mockImplementation(function (this: Element) {
    return (this.tagName.toLowerCase() === "svg" ? { left: 0, top: 0, width: 900, height: 900 } : { left: 0, top: 0, width: 0, height: 0 }) as DOMRect;
  });
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

let latest: Profile;
let latestSel: Selection;
function Harness({ initial, sel0 = { main: 0, child: null } }: { initial: Profile; sel0?: Selection }) {
  const [p, setP] = useState(initial);
  const [sel, setSel] = useState<Selection>(sel0);
  latest = p;
  latestSel = sel;
  return (
    <PreviewEditor
      items={p.items}
      profile={p}
      selection={sel}
      onSelect={setSel}
      edit={(fn) => setP((prev) => { const n = structuredClone(prev); fn(n); return n; })}
      deadZonePx={90}
      render={(s) => (
        <RadialCanvas items={p.items} activeMain={s.activeMain} activeSub={s.activeSub} openMain={s.openMain} hubHovered={false} stats={null} appearance={defaultConfig.appearance} />
      )}
    />
  );
}

const mainPt = (i: number, n: number) => polar(C, C, 215, sliceAngle(i, n));
const subPt = (parent: number, n: number, k: number, kids: number) => polar(C, C, 332, submenuAngles(sliceAngle(parent, n), kids)[k]);
const down = (p: { x: number; y: number }) => fireEvent.pointerDown(screen.getByTestId("preview-editor"), { button: 0, clientX: p.x, clientY: p.y });
const move = (p: { x: number; y: number }) => act(() => void window.dispatchEvent(new MouseEvent("pointermove", { clientX: p.x, clientY: p.y })));
const up = () => act(() => void window.dispatchEvent(new MouseEvent("pointerup")));

describe("arrastar na pré-visualização", () => {
  it("clique só escolhe; arrastar a 1ª fatia até a 3ª reordena e mantém escolhida", () => {
    render(<Harness initial={{ id: "p", name: "P", items: [a("A"), a("B"), a("C"), a("D")] }} />);
    down(mainPt(1, 4));
    up();
    expect(latestSel).toEqual({ main: 1, child: null });
    expect(latest.items.map((i) => i.id)).toEqual(["A", "B", "C", "D"]);
    down(mainPt(0, 4));
    move(mainPt(1, 4));
    move(mainPt(2, 4));
    expect(screen.getByRole("status").textContent).toBe("Mover para a posição 3");
    up();
    expect(latest.items.map((i) => i.id)).toEqual(["B", "C", "A", "D"]);
    expect(latestSel).toEqual({ main: 2, child: null });
  });

  it("parar sobre uma fatia-submenu abre o sub-anel; soltar nele põe o item dentro", () => {
    vi.useFakeTimers();
    const sub: MenuItem = { id: "S", label: "S", icon: "code", children: [a("s1"), a("s2")] };
    render(<Harness initial={{ id: "p", name: "P", items: [a("A"), sub, a("B"), a("C")] }} />);
    down(mainPt(0, 4));
    move(mainPt(3, 4));
    move(mainPt(1, 4));
    act(() => void vi.advanceTimersByTime(600));
    expect(document.querySelectorAll(".sub-slice").length).toBe(2);
    move(subPt(1, 4, 1, 2));
    expect(screen.getByRole("status").textContent).toBe('Mover para o submenu "S"');
    up();
    expect(latest.items.map((i) => i.id)).toEqual(["S", "B", "C"]);
    expect(latest.items[0].children!.map((i) => i.id)).toEqual(["s1", "A", "s2"]);
    expect(latestSel).toEqual({ main: 0, child: 1 });
  });

  it("movimento inválido mostra o motivo e não altera nada", () => {
    vi.useFakeTimers();
    const sub: MenuItem = { id: "S", label: "S", icon: "code", children: [a("s1")] };
    render(<Harness initial={{ id: "p", name: "P", items: [a("A"), sub, a("B")] }} />);
    down(mainPt(0, 3));
    move(mainPt(2, 3));
    move(mainPt(1, 3));
    act(() => void vi.advanceTimersByTime(600));
    move(subPt(1, 3, 0, 1));
    expect(screen.getByRole("status").textContent).toContain("pelo menos 3");
    up();
    expect(latest.items.map((i) => i.id)).toEqual(["A", "S", "B"]);
  });
});
