import { cleanup, fireEvent, render, screen } from "@testing-library/react";
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

    pick(/Saídas de áudio/);
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
    pick(/Saídas de áudio/);
    expect(confirm).toHaveBeenCalled();
    expect(latest.items[1].children).toHaveLength(1);
    expect(latest.items[1].dynamic).toBeUndefined();

    confirm.mockReturnValue(true);
    pick(/Saídas de áudio/);
    expect(latest.items[1].children).toBeUndefined();
    expect(latest.items[1].dynamic).toBe("audioOutputs");
  });

  it("clicar na opção já ativa não altera nada", () => {
    render(<Harness initial={baseProfile()} main={0} />);
    const before = JSON.stringify(latest);
    pick(/Executar ação/);
    expect(JSON.stringify(latest)).toBe(before);
  });
});
