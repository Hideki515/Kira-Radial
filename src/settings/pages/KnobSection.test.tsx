import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cloneConfig, defaultConfig } from "../../shared/defaults";
import { knobOf, type Config } from "../../shared/types";
import { knobErrors, validateConfig } from "../../shared/validate";

const ipc = vi.hoisted(() => ({ getKnobError: vi.fn(async (): Promise<string | null> => null) }));
vi.mock("../../shared/ipc", async (orig) => ({ ...(await orig<typeof import("../../shared/ipc")>()), ...ipc }));

import { KnobSection } from "./KnobSection";

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});
const flush = () => act(async () => { for (let i = 0; i < 4; i++) await Promise.resolve(); });

function Harness({ initial, onConfig }: { initial: Config; onConfig?: (c: Config) => void }) {
  const [c, setC] = useState(initial);
  return (
    <KnobSection
      config={c}
      update={(fn) =>
        setC((prev) => {
          const next = cloneConfig(prev);
          fn(next);
          onConfig?.(next);
          return next;
        })
      }
    />
  );
}

describe("config do knob", () => {
  it("config antiga (sem knob) = desligado com F13/F14/F15 e sem erros", () => {
    const c = cloneConfig(defaultConfig);
    delete c.knob;
    expect(knobOf(c)).toEqual({ enabled: false, press: "F13", right: "F14", left: "F15", closedTurn: "none" });
    expect(knobErrors(c)).toEqual([]);
  });

  it("valida teclas repetidas, inválidas e iguais ao atalho do menu (só ligado)", () => {
    const c = cloneConfig(defaultConfig);
    c.knob = { enabled: true, press: "F13", right: "F13", left: "xyz+", closedTurn: "none" };
    const e = knobErrors(c);
    expect(e.some((m) => m.includes('"apertar" e em "girar para a direita"'))).toBe(true);
    expect(e.some((m) => m.includes('"girar para a esquerda" inválida'))).toBe(true);
    c.knob = { enabled: true, press: c.hotkey.accelerator, right: "F14", left: "F15", closedTurn: "none" };
    expect(validateConfig(c).some((m) => m.includes("já é o atalho que abre o menu"))).toBe(true);
    c.knob.enabled = false;
    expect(knobErrors(c)).toEqual([]);
  });
});

describe("seção do knob nas Configurações", () => {
  it("desligado mostra só o interruptor; ligar mostra as três teclas e o modo fechado", async () => {
    let last: Config | null = null;
    render(<Harness initial={cloneConfig(defaultConfig)} onConfig={(c) => (last = c)} />);
    await flush();
    expect(screen.queryByText("Apertar o knob")).toBeNull();
    fireEvent.click(screen.getByRole("checkbox", { name: /Usar o knob/ }));
    expect(knobOf(last!).enabled).toBe(true);
    for (const t of ["Apertar o knob", "Girar para a direita", "Girar para a esquerda"]) expect(screen.getByText(t)).toBeTruthy();
    fireEvent.click(screen.getByRole("radio", { name: "Ajusta o volume" }));
    expect(knobOf(last!).closedTurn).toBe("volume");
  });

  it("mostra o erro de registro do Windows", async () => {
    ipc.getKnobError.mockResolvedValue("não foi possível registrar a tecla do knob F13");
    const c = cloneConfig(defaultConfig);
    c.knob = { enabled: true, press: "F13", right: "F14", left: "F15", closedTurn: "none" };
    render(<Harness initial={c} />);
    await flush();
    expect(screen.getByTestId("knob-reg-error").textContent).toContain("F13");
  });
});
