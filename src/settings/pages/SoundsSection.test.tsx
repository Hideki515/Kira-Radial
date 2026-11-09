import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cloneConfig, defaultConfig } from "../../shared/defaults";
import type { Config } from "../../shared/types";
import { validateConfig } from "../../shared/validate";

const mocks = vi.hoisted(() => ({
  pickSound: vi.fn(async (): Promise<string | null> => "C:/sons/jarvis.wav"),
  playSound: vi.fn(async () => {}),
}));
vi.mock("../../shared/ipc", async (orig) => ({ ...(await orig<typeof import("../../shared/ipc")>()), pickSound: mocks.pickSound }));
vi.mock("../../shared/sound", async (orig) => ({ ...(await orig<typeof import("../../shared/sound")>()), playSound: mocks.playSound }));

import { SoundsSection } from "./SoundsSection";

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

let last: Config;
function Harness() {
  const [c, setC] = useState(() => cloneConfig(defaultConfig));
  last = c;
  const update = (fn: (c: Config) => void) =>
    setC((prev) => {
      const next = cloneConfig(prev);
      fn(next);
      last = next;
      return next;
    });
  return <SoundsSection config={c} update={update} />;
}

describe("Aparência › Sons", () => {
  it("liga, ajusta volume e desliga um evento; config continua válida", () => {
    render(<Harness />);
    fireEvent.click(screen.getByLabelText("Tocar sons"));
    expect(last.appearance.sounds?.enabled).toBe(true);
    fireEvent.change(screen.getByLabelText(/Volume: 50%/), { target: { value: "0.8" } });
    expect(last.appearance.sounds?.volume).toBe(0.8);
    fireEvent.change(screen.getByLabelText("Som: Fechar o menu"), { target: { value: "off" } });
    expect(last.appearance.sounds?.events.close.mode).toBe("off");
    expect(validateConfig(last)).toEqual([]);
  });

  it("arquivo próprio abre o seletor e guarda o caminho; ▶ toca forçando", async () => {
    render(<Harness />);
    fireEvent.change(screen.getByLabelText("Som: Abrir o menu"), { target: { value: "file" } });
    await act(async () => { await Promise.resolve(); });
    expect(mocks.pickSound).toHaveBeenCalled();
    expect(last.appearance.sounds?.events.open).toEqual({ mode: "file", file: "C:/sons/jarvis.wav" });
    expect(screen.getByTitle("C:/sons/jarvis.wav").textContent).toContain("jarvis.wav");
    fireEvent.click(screen.getByLabelText("Ouvir: Abrir o menu"));
    expect(mocks.playSound).toHaveBeenCalledWith("open", expect.anything(), true);
  });

  it("hover vem sem som (▶ desabilitado)", () => {
    render(<Harness />);
    expect((screen.getByLabelText("Som: Passar por uma fatia") as HTMLSelectElement).value).toBe("off");
    expect((screen.getByLabelText("Ouvir: Passar por uma fatia") as HTMLButtonElement).disabled).toBe(true);
  });
});
