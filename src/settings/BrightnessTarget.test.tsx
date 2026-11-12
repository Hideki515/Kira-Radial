import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { useState } from "react";
import { afterEach, describe, expect, it } from "vitest";
import { AUDIO_CURRENT_COLOR, brightnessChildren, resolveItems, targetDisplays } from "../radial/dynamic";
import { describeAction, type DisplayInfo } from "../shared/ipc";
import type { Action, MenuItem, Profile } from "../shared/types";
import { validateAction, validateConfig } from "../shared/validate";
import { cloneConfig, defaultConfig } from "../shared/defaults";
import { ActionEditor } from "./ActionEditor";
import { ItemsPage, type Selection } from "./pages/ItemsPage";

afterEach(cleanup);

const D: DisplayInfo[] = [
  { id: "lcd", name: "Tela do notebook", level: 90, device: "\\\\.\\DISPLAY1", number: 1 },
  { id: "mon:AOC", name: "Monitor 2 (AOC2402)", level: 20, device: "\\\\.\\DISPLAY2", number: 2 },
];

describe("brilho por tela (lógica)", () => {
  it("submenu: destaca o nível da tela escolhida e passa o alvo para a ação", () => {
    const kids = brightnessChildren("b", D, "mon:AOC", "Monitor 2 (AOC2402)");
    expect(kids.find((k) => k.color === AUDIO_CURRENT_COLOR)!.label).toBe("25%");
    expect(kids[2].action).toEqual({ type: "brightness", mode: "set", value: 50, target: "mon:AOC", targetName: "Monitor 2 (AOC2402)" });
    const all = brightnessChildren("b", D, "all");
    expect(all[0].action).toEqual({ type: "brightness", mode: "set", value: 10, target: "all" });
    expect(all.find((k) => k.color === AUDIO_CURRENT_COLOR)!.label).toBe("50%"); // média 55
  });

  it("submenu sem tela escolhida = onde o menu abriu", () => {
    const items: MenuItem[] = [{ id: "b", label: "Brilho", icon: "sun", dynamic: "brightness" }];
    const kids = resolveItems(items, { displays: D })[0].children!;
    expect(kids[0].action).toMatchObject({ type: "brightness", target: "cursor" });
    expect(kids[0].action).not.toHaveProperty("targetName");
    const fixed = resolveItems([{ ...items[0], dynamicTarget: "lcd", dynamicTargetName: "Tela do notebook" }], { displays: D })[0].children!;
    expect(fixed[0].action).toMatchObject({ target: "lcd", targetName: "Tela do notebook" });
  });

  it("acha a tela pelo nome quando o id mudou; desconhecida = todas", () => {
    expect(targetDisplays(D, "mon:VELHO", "monitor 2 (aoc2402)").map((d) => d.id)).toEqual(["mon:AOC"]);
    expect(targetDisplays(D, "mon:VELHO")).toHaveLength(2);
    expect(targetDisplays(D, "cursor")).toHaveLength(2);
  });

  it("validação do alvo e descrição", () => {
    for (const t of ["all", "cursor", "lcd", "ddc:0", "mon:\\\\?\\DISPLAY#AOC2402#x"]) expect(validateAction({ type: "brightness", mode: "up", target: t })).toBeNull();
    for (const t of ["", "tudo", "ddc:x", "mon:"]) expect(validateAction({ type: "brightness", mode: "up", target: t })).toMatch(/tela/);
    expect(describeAction({ type: "brightness", mode: "up", target: "cursor" })).toBe("Aumentar brilho (tela do menu)");
    expect(describeAction({ type: "brightness", mode: "set", value: 30, target: "mon:AOC", targetName: "AOC" })).toBe("Brilho 30% (AOC)");
    expect(describeAction({ type: "brightness", mode: "down" })).toBe("Diminuir brilho");
    const c = cloneConfig(defaultConfig);
    c.profiles[0].items[0] = { id: "x", label: "B", icon: "sun", dynamic: "brightness", dynamicTarget: "bogus" };
    expect(validateConfig(c).some((e) => e.includes("tela do brilho"))).toBe(true);
  });

  it("limite de 2048 conta bytes (acentos) como o Rust", () => {
    const u = `https://a.b/${"é".repeat(1100)}`; // ~2212 bytes, 1112 caracteres
    expect(validateAction({ type: "url", url: u, browser: "Google Chrome" })).toMatch(/2048/);
  });
});

describe("editor › tela do brilho", () => {
  function Harness({ start }: { start: Action }) {
    const [a, setA] = useState<Action>(start);
    last = a;
    return <ActionEditor action={a} onChange={(n) => { last = n; setA(n); }} />;
  }
  let last: Action;

  it("ação: lista as telas, escolhe uma (id + nome), mantém ao trocar o ajuste, volta para todas", async () => {
    render(<Harness start={{ type: "brightness", mode: "up" }} />);
    const sel = screen.getByRole("combobox", { name: "Tela do brilho" }) as HTMLSelectElement;
    expect(sel.value).toBe("all");
    await waitFor(() => expect(screen.getByRole("option", { name: /2\. Monitor 2 \(AOC2402\) — 40%/ })).toBeTruthy());
    fireEvent.change(sel, { target: { value: "mon:AOC" } });
    expect(last).toEqual({ type: "brightness", mode: "up", target: "mon:AOC", targetName: "Monitor 2 (AOC2402)" });
    fireEvent.click(screen.getAllByRole("radio").find((b) => /Definir valor/.test(b.textContent ?? ""))!);
    expect(last).toEqual({ type: "brightness", mode: "set", value: 50, target: "mon:AOC", targetName: "Monitor 2 (AOC2402)" });
    fireEvent.change(sel, { target: { value: "cursor" } });
    expect(last).toEqual({ type: "brightness", mode: "set", value: 50, target: "cursor" });
    fireEvent.change(sel, { target: { value: "all" } });
    expect(last).toMatchObject({ target: "all" });
    expect(last).not.toHaveProperty("targetName");
  });

  it("tela salva que não está conectada aparece como desconectada; ddc:N antigo acha pelo nome", async () => {
    render(<Harness start={{ type: "brightness", mode: "down", target: "mon:SUMIU", targetName: "Dell" }} />);
    expect(await screen.findByRole("option", { name: /Dell \(desconectada\)/ })).toBeTruthy();
    cleanup();
    render(<Harness start={{ type: "brightness", mode: "down", target: "ddc:0", targetName: "Monitor 2 (AOC2402)" }} />);
    const sel = screen.getByRole("combobox", { name: "Tela do brilho" }) as HTMLSelectElement;
    await waitFor(() => expect(sel.value).toBe("mon:AOC"));
  });

  it("submenu automático Brilho: padrão 'Onde o menu abriu'; escolher grava dynamicTarget; trocar de tipo limpa", async () => {
    let latest: Profile;
    function Page() {
      const [p, setP] = useState<Profile>({ id: "p", name: "P", items: [{ id: "b", label: "Brilho", icon: "sun", dynamic: "brightness" }] });
      const [sel, setSel] = useState<Selection>({ main: 0, child: null });
      latest = p;
      return (
        <ItemsPage
          profile={p}
          selection={sel}
          onSelect={setSel}
          edit={(fn) => setP((prev) => { const n = structuredClone(prev); fn(n); latest = n; return n; })}
        />
      );
    }
    render(<Page />);
    const sel = (await screen.findByRole("combobox", { name: "Tela do brilho" })) as HTMLSelectElement;
    expect(sel.value).toBe("cursor");
    await waitFor(() => expect(screen.getByRole("option", { name: /Tela do notebook/ })).toBeTruthy());
    fireEvent.change(sel, { target: { value: "lcd" } });
    expect(latest!.items[0]).toMatchObject({ dynamicTarget: "lcd", dynamicTargetName: "Tela do notebook" });
    fireEvent.change(sel, { target: { value: "cursor" } });
    expect(latest!.items[0]).not.toHaveProperty("dynamicTarget");
    fireEvent.change(sel, { target: { value: "all" } });
    expect(latest!.items[0].dynamicTarget).toBe("all");
    fireEvent.change(screen.getByDisplayValue("Brilho da tela"), { target: { value: "powerPlans" } });
    expect(latest!.items[0]).not.toHaveProperty("dynamicTarget");
  });
});
