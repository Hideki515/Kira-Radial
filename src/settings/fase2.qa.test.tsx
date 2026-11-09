// QA (v0.5.0): editor "Wi-Fi / Bluetooth", config antiga sem campos da Fase 2 e
// histórico da área de transferência desligado por padrão. Só UI/validação.
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { afterEach, describe, expect, it } from "vitest";
import defaults from "../shared/default-config.json";
import type { Action, Config } from "../shared/types";
import { DYNAMIC_KINDS } from "../shared/types";
import { validateAction, validateConfig } from "../shared/validate";
import { ActionEditor } from "./ActionEditor";

afterEach(cleanup);

describe("QA v0.5.0", () => {
  it("editor Wi-Fi / Bluetooth começa em Wi-Fi/Alternar e troca rádio e modo", () => {
    let last: Action | null = null;
    function Host() {
      const [a, setA] = useState<Action>({ type: "url", url: "https://x.y" });
      return <ActionEditor action={a} onChange={(n) => { last = n; setA(n); }} />;
    }
    render(<Host />);
    fireEvent.change(screen.getByDisplayValue("Abrir site (URL)"), { target: { value: "radio" } });
    expect(last).toEqual({ type: "radio", kind: "wifi", mode: "toggle" });
    fireEvent.click(screen.getByRole("radio", { name: "Bluetooth" }));
    fireEvent.click(screen.getByRole("radio", { name: "Desligar" }));
    expect(last).toEqual({ type: "radio", kind: "bluetooth", mode: "off" });
    expect(validateAction(last!)).toBeNull();
  });

  it("seletor de tipo não oferece ações geradas (focusWindow/powerPlan/paste)", () => {
    render(<ActionEditor action={{ type: "url", url: "https://x.y" }} onChange={() => {}} />);
    const values = Array.from((screen.getByDisplayValue("Abrir site (URL)") as HTMLSelectElement).options).map((o) => o.value);
    for (const t of ["focusWindow", "powerPlan", "paste"]) expect(values).not.toContain(t);
    expect(values).toEqual(expect.arrayContaining(["brightness", "radio"]));
  });

  it("padrão tem histórico do clipboard desligado; config antiga sem os campos novos é válida", () => {
    const c = structuredClone(defaults) as unknown as Config;
    expect(c.behavior.clipboardHistory).toBe(false);
    delete c.behavior.clipboardHistory;
    delete c.appearance.showMedia;
    expect(validateConfig(c)).toEqual([]);
  });

  it("todo submenu automático é aceito numa fatia principal", () => {
    for (const kind of DYNAMIC_KINDS) {
      const c = structuredClone(defaults) as unknown as Config;
      c.profiles[0].items[0] = { id: "dyn", label: "Auto", dynamic: kind } as Config["profiles"][0]["items"][0];
      expect(validateConfig(c), kind).toEqual([]);
    }
  });
});
