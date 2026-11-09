import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Profile } from "../../shared/types";
import { ItemsPage, type Selection } from "./ItemsPage";

// Teste adicionado pelo QA: "Ao selecionar" com 3 opções limpa children/action/dynamic.

const baseProfile = (): Profile => ({
  id: "p",
  name: "P",
  items: [
    { id: "a", label: "A", icon: "code", action: { type: "url", url: "https://a.b" } },
    {
      id: "b", label: "B", icon: "code",
      children: [{ id: "b1", label: "B1", icon: "code", action: { type: "url", url: "https://a.b" } }],
    },
    { id: "c", label: "C", icon: "code", action: { type: "url", url: "https://a.b" } },
  ],
});

let latest: Profile;

function Harness({ initial, main }: { initial: Profile; main: number }) {
  const [profile, setProfile] = useState(initial);
  const [sel, setSel] = useState<Selection>({ main, child: null });
  latest = profile;
  return (
    <ItemsPage
      profile={profile}
      selection={sel}
      onSelect={setSel}
      edit={(fn) =>
        setProfile((p) => {
          const next = structuredClone(p);
          fn(next);
          return next;
        })
      }
    />
  );
}

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

// Os botões ficam dentro de um <label> (Field), então o nome acessível inclui o rótulo: busca pelo texto.
const radio = (name: RegExp) => screen.getAllByRole("radio").find((b) => name.test(b.textContent ?? ""))!;
const pick = (name: RegExp) => fireEvent.click(radio(name));

describe("ItemsPage › Ao selecionar", () => {
  it("ação → saídas de áudio → submenu → ação limpa os campos corretamente", () => {
    render(<Harness initial={baseProfile()} main={0} />);
    expect(radio(/Executar ação/).getAttribute("aria-checked")).toBe("true");

    pick(/Submenu automático/);
    expect(latest.items[0]).toMatchObject({ dynamic: "audioOutputs" });
    expect(latest.items[0].action).toBeUndefined();
    expect(latest.items[0].children).toBeUndefined();
    expect(screen.getByText(/atualizadas a cada abertura do menu/)).toBeTruthy();
    expect(screen.getByTitle("Submenu automático")).toBeTruthy();

    pick(/Abrir submenu/);
    expect(latest.items[0].dynamic).toBeUndefined();
    expect(latest.items[0].action).toBeUndefined();
    expect(latest.items[0].children).toEqual([]);

    pick(/Executar ação/);
    expect(latest.items[0].children).toBeUndefined();
    expect(latest.items[0].dynamic).toBeUndefined();
    expect(latest.items[0].action?.type).toBe("launch");
  });

  it("submenu com subitens pede confirmação; cancelar mantém, confirmar troca para áudio", () => {
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
    render(<Harness initial={baseProfile()} main={1} />);
    pick(/Submenu automático/);
    expect(confirm).toHaveBeenCalled();
    expect(latest.items[1].children).toHaveLength(1);
    expect(latest.items[1].dynamic).toBeUndefined();

    confirm.mockReturnValue(true);
    pick(/Submenu automático/);
    expect(latest.items[1].children).toBeUndefined();
    expect(latest.items[1].dynamic).toBe("audioOutputs");
  });

  it("clicar na opção já ativa não altera nada", () => {
    render(<Harness initial={baseProfile()} main={0} />);
    const before = JSON.stringify(latest);
    pick(/Executar ação/);
    expect(JSON.stringify(latest)).toBe(before);
  });

  it("Submenu automático: escolhe o conteúdo (janelas, energia) na lista", () => {
    render(<Harness initial={baseProfile()} main={0} />);
    pick(/Submenu automático/);
    expect(latest.items[0].dynamic).toBe("audioOutputs");
    const sel = screen.getByDisplayValue("Saídas de áudio");
    fireEvent.change(sel, { target: { value: "windows" } });
    expect(latest.items[0].dynamic).toBe("windows");
    expect(latest.items[0].action).toBeUndefined();
    expect(screen.getByText(/janelas abertas mais recentes/)).toBeTruthy();
    fireEvent.change(screen.getByDisplayValue("Janelas abertas"), { target: { value: "powerPlans" } });
    expect(latest.items[0].dynamic).toBe("powerPlans");
    expect(radio(/Submenu automático/).getAttribute("aria-checked")).toBe("true");
  });
});

describe("ItemsPage › reordenar", () => {
  const mouse = (el: Element, type: string) =>
    act(() => void el.dispatchEvent(new MouseEvent(type, { bubbles: true, button: 0 })));

  it("arrastar a alça da 1ª fatia até a 3ª move e mantém selecionada", () => {
    const p = baseProfile();
    const ids = p.items.map((i) => i.id);
    render(<Harness initial={p} main={0} />);
    const handle = screen.getByTestId("row-0").querySelector(".drag-handle")!;
    mouse(handle, "pointerdown");
    expect(screen.getByTestId("row-0").className).toContain("is-dragging");
    mouse(screen.getByTestId("row-2"), "pointerover");
    expect(screen.getByTestId("row-2").className).toContain("is-drop");
    mouse(window as unknown as Element, "pointerup");
    expect(latest.items.map((i) => i.id)).toEqual([ids[1], ids[2], ids[0], ...ids.slice(3)]);
  });

  it("subitem não pode ser solto entre as fatias principais", () => {
    const p = baseProfile();
    const before = JSON.stringify(p.items.map((i) => i.id));
    render(<Harness initial={p} main={1} />);
    const childHandle = screen.getByTestId("row-1-0").querySelector(".drag-handle")!;
    mouse(childHandle, "pointerdown");
    mouse(screen.getByTestId("row-0"), "pointerover");
    mouse(window as unknown as Element, "pointerup");
    expect(JSON.stringify(latest.items.map((i) => i.id))).toBe(before);
  });

  it("Alt+↓ na linha desce o item", () => {
    const p = baseProfile();
    const ids = p.items.map((i) => i.id);
    render(<Harness initial={p} main={0} />);
    fireEvent.keyDown(screen.getByTestId("row-0"), { key: "ArrowDown", altKey: true });
    expect(latest.items[1].id).toBe(ids[0]);
  });
});
