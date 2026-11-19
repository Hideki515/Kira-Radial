import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cloneConfig, defaultConfig } from "../../shared/defaults";
import type { Config, MenuItem, Profile } from "../../shared/types";
import { hotkeyComboOk, itemHotkeyErrors, validateConfig } from "../../shared/validate";

const ipc = vi.hoisted(() => ({ getHotkeysError: vi.fn(async (): Promise<string | null> => null) }));
vi.mock("../../shared/ipc", async (orig) => ({ ...(await orig<typeof import("../../shared/ipc")>()), ...ipc }));

import { ItemsPage, type Selection } from "./ItemsPage";

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const open = (id: string, hotkey?: string): MenuItem => ({ id, label: id, icon: "code", action: { type: "openSettings" }, ...(hotkey ? { hotkey } : {}) });

function cfgWith(items: MenuItem[]): Config {
  const c = cloneConfig(defaultConfig);
  c.hotkey.accelerator = "Ctrl+Alt+Q";
  c.launcher.mode = "hotkey";
  c.profiles[0].items = items;
  return c;
}

describe("validação dos atalhos de fatia", () => {
  it("precisa de modificador, exceto teclas F", () => {
    expect(hotkeyComboOk("Ctrl+Alt+1")).toBe(true);
    expect(hotkeyComboOk("F13")).toBe(true);
    expect(hotkeyComboOk("A")).toBe(false);
    expect(hotkeyComboOk("lixo+")).toBe(false);
  });

  it("sem atalho ou atalhos diferentes: ok; repetido (inclusive entre perfis), igual ao menu ou ao knob: erro", () => {
    expect(itemHotkeyErrors(cfgWith([open("A", "Ctrl+Alt+1"), open("B", "Ctrl+Alt+2"), open("C")]))).toEqual([]);
    const dup = cfgWith([open("A", "Ctrl+Alt+1"), open("B"), open("C")]);
    dup.profiles.push({ id: "p2", name: "P2", items: [open("X", "ctrl+alt+1"), open("Y"), open("Z")] });
    expect(itemHotkeyErrors(dup)[0]).toContain('"A"');
    expect(itemHotkeyErrors(cfgWith([open("A", "Ctrl+Alt+Q"), open("B"), open("C")]))[0]).toContain("atalho do menu");
    const k = cfgWith([open("A", "F13"), open("B"), open("C")]);
    k.knob = { enabled: true, press: "F13", right: "F14", left: "F15", closedTurn: "none" };
    expect(itemHotkeyErrors(k)[0]).toContain("knob");
  });

  it("só em fatias com ação; desligar/reiniciar/sair não aceitam; entra no validateConfig", () => {
    const sub: MenuItem = { id: "S", label: "S", icon: "x", hotkey: "Ctrl+Alt+5", children: [open("S1")] };
    expect(itemHotkeyErrors(cfgWith([sub, open("B"), open("C")]))[0]).toContain("só fatias que executam");
    const off: MenuItem = { id: "O", label: "Desligar", icon: "x", hotkey: "Ctrl+Alt+6", action: { type: "system", cmd: "shutdown" } };
    expect(itemHotkeyErrors(cfgWith([off, open("B"), open("C")]))[0]).toContain("desligar");
    // Subitem com atalho também vale.
    const parent: MenuItem = { id: "P", label: "P", icon: "x", children: [open("P1", "Ctrl+Alt+7"), open("P2", "Ctrl+Alt+7")] };
    expect(itemHotkeyErrors(cfgWith([parent, open("B"), open("C")]))).toHaveLength(1);
    expect(validateConfig(cfgWith([open("A", "A"), open("B"), open("C")])).some((e) => e.includes("inválido"))).toBe(true);
  });
});

describe("campo de atalho no editor de item", () => {
  function Harness({ initial }: { initial: Profile }) {
    const [p, setP] = useState(initial);
    const [sel, setSel] = useState<Selection>({ main: 0, child: null });
    latest = p;
    return <ItemsPage profile={p} selection={sel} onSelect={setSel} edit={(fn) => setP((prev) => { const n = structuredClone(prev); fn(n); return n; })} />;
  }
  let latest: Profile;

  it("aparece para fatia com ação; selo na lista; remover apaga", async () => {
    render(<Harness initial={{ id: "p", name: "P", items: [open("A", "Ctrl+Alt+1"), open("B"), open("C")] }} />);
    expect(screen.getByText("Atalho global (opcional)")).toBeTruthy();
    expect(screen.getByTestId("row-0").querySelector(".tree-hotkey")!.textContent).toBe("Ctrl+Alt+1");
    fireEvent.click(screen.getByRole("button", { name: "Remover atalho" }));
    expect(latest.items[0].hotkey).toBeUndefined();
    expect(screen.getByTestId("row-0").querySelector(".tree-hotkey")).toBeNull();
  });

  it("mostra o erro de registro do Windows", async () => {
    ipc.getHotkeysError.mockResolvedValue("não foi possível registrar Ctrl+Alt+1");
    render(<Harness initial={{ id: "p", name: "P", items: [open("A", "Ctrl+Alt+1"), open("B"), open("C")] }} />);
    expect((await screen.findByTestId("hotkeys-reg-error")).textContent).toContain("Ctrl+Alt+1");
  });
});
