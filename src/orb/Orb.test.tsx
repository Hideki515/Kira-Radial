import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DRAG_THRESHOLD, Orb } from "./Orb";

afterEach(cleanup);

// jsdom não tem PointerEvent: MouseEvent com o tipo pointer* carrega button/screenX.
const ptr = (el: Element, type: string, init: MouseEventInit) =>
  act(() => void el.dispatchEvent(new MouseEvent(type, { bubbles: true, ...init })));

const setup = (imageSrc?: string) => {
  const onActivate = vi.fn();
  const onDragStart = vi.fn();
  const onContextMenu = vi.fn();
  render(
    <Orb size={96} accent="#ffb03a" opacityIdle={0.85} imageSrc={imageSrc} onActivate={onActivate} onDragStart={onDragStart} onContextMenu={onContextMenu} />,
  );
  return { orb: screen.getByTestId("orb"), onActivate, onDragStart, onContextMenu };
};

describe("Orb (ícone flutuante)", () => {
  it("clique sem mover abre o menu e dispara a onda", () => {
    const { orb, onActivate, onDragStart } = setup();
    ptr(orb, "pointerdown", { button: 0, screenX: 100, screenY: 100 });
    ptr(orb, "pointermove", { screenX: 102, screenY: 101 });
    ptr(orb, "pointerup", { button: 0, screenX: 102, screenY: 101 });
    expect(onActivate).toHaveBeenCalledTimes(1);
    expect(onDragStart).not.toHaveBeenCalled();
    expect(screen.getByTestId("orb-burst")).toBeTruthy();
  });

  it("mover além do limite arrasta (uma vez) e não abre o menu", () => {
    const { orb, onActivate, onDragStart } = setup();
    ptr(orb, "pointerdown", { button: 0, screenX: 100, screenY: 100 });
    ptr(orb, "pointermove", { screenX: 100 + DRAG_THRESHOLD + 1, screenY: 100 });
    ptr(orb, "pointermove", { screenX: 140, screenY: 120 });
    ptr(orb, "pointerup", { button: 0, screenX: 140, screenY: 120 });
    expect(onDragStart).toHaveBeenCalledTimes(1);
    expect(onActivate).not.toHaveBeenCalled();
  });

  it("mover sem botão pressionado não arrasta; botão direito não abre", () => {
    const { orb, onActivate, onDragStart, onContextMenu } = setup();
    ptr(orb, "pointermove", { screenX: 300, screenY: 300 });
    ptr(orb, "pointerdown", { button: 2, screenX: 0, screenY: 0 });
    ptr(orb, "pointerup", { button: 2, screenX: 0, screenY: 0 });
    fireEvent.contextMenu(orb);
    expect(onDragStart).not.toHaveBeenCalled();
    expect(onActivate).not.toHaveBeenCalled();
    expect(onContextMenu).toHaveBeenCalledTimes(1);
  });

  it("orbe embutido tem anéis; imagem própria troca os anéis pelo <img>", () => {
    const { orb } = setup();
    expect(orb.querySelectorAll(".orb-spin")).toHaveLength(4);
    expect(orb.querySelector("img")).toBeNull();
    cleanup();
    const { orb: withImg } = setup("data:image/gif;base64,R0lGOD");
    expect(withImg.querySelector("img")!.getAttribute("src")).toContain("data:image/gif");
    expect(withImg.querySelector(".orb-spin")).toBeNull();
  });
});
