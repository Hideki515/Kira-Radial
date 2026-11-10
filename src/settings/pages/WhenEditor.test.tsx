import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cloneConfig, defaultConfig } from "../../shared/defaults";
import type { MonitorInfo } from "../../shared/ipc";
import { describeDays, describeWhen, hasCriteria, parseHHMM, whenErrors } from "../../shared/schedule";
import type { ProfileWhen } from "../../shared/types";
import { validateConfig } from "../../shared/validate";

const ipc = vi.hoisted(() => ({ identifyMonitors: vi.fn(async () => {}) }));
vi.mock("../../shared/ipc", async (orig) => ({ ...(await orig<typeof import("../../shared/ipc")>()), ...ipc }));

import { WhenEditor, cleanWhen } from "./WhenEditor";

afterEach(cleanup);

const MONS: MonitorInfo[] = [
  { device: "\\\\.\\DISPLAY1", name: "Monitor 1", number: 1, left: 0, top: 0, width: 1920, height: 1080, primary: true },
  { device: "\\\\.\\DISPLAY2", name: "LG", number: 2, left: 1920, top: 0, width: 2560, height: 1440, primary: false },
];

describe("schedule (front)", () => {
  it("horário, critérios e erros", () => {
    expect(parseHHMM("09:30")).toBe(570);
    expect(parseHHMM("24:00")).toBeNull();
    expect(hasCriteria(undefined)).toBe(false);
    expect(hasCriteria({ days: [] })).toBe(false);
    expect(hasCriteria({ monitors: ["x"] })).toBe(true);
    expect(whenErrors({ from: "09:00" })).toEqual(["informe o horário de início e de fim."]);
    expect(whenErrors({ from: "09:00", to: "09:00" })[0]).toContain("não podem ser iguais");
    expect(whenErrors({ from: "22:00", to: "02:00" })).toEqual([]);
    expect(whenErrors({ days: [7] })[0]).toContain("dia");
  });

  it("resumo legível", () => {
    expect(describeDays([5, 1, 2, 3, 4])).toBe("Seg–Sex");
    expect(describeDays([0, 6])).toBe("Dom, Sáb");
    expect(describeDays([])).toBe("todos os dias");
    const name = (d: string) => (d.endsWith("2") ? "2. LG" : d);
    expect(describeWhen({ days: [1, 2, 3, 4, 5], from: "09:00", to: "18:00", monitors: ["\\\\.\\DISPLAY2"] }, name)).toBe("Seg–Sex 09:00–18:00 · 2. LG");
    expect(describeWhen({})).toBe("");
  });

  it("validação: perfil extra precisa de app OU quando usar; erros de horário bloqueiam", () => {
    const c = cloneConfig(defaultConfig);
    c.profiles.push({ ...cloneConfig(defaultConfig).profiles[0], id: "noite", name: "Noite", matchExe: [] });
    expect(validateConfig(c).some((e) => e.includes("Quando usar"))).toBe(true);
    c.profiles[1].when = { from: "22:00", to: "02:00" };
    expect(validateConfig(c)).toEqual([]);
    c.profiles[1].when = { from: "22:00" };
    expect(validateConfig(c).some((e) => e.includes("início e de fim"))).toBe(true);
  });
});

describe("Perfis › Quando usar", () => {
  let last: ProfileWhen | undefined;
  function Host({ initial }: { initial?: ProfileWhen }) {
    const [w, setW] = useState<ProfileWhen | undefined>(initial);
    last = w;
    return <WhenEditor when={w} monitors={MONS} onChange={(n) => { last = n; setW(n); }} />;
  }

  it("dias úteis, horário que passa da meia-noite e monitor; limpar volta a 'sem critério'", () => {
    render(<Host />);
    fireEvent.click(screen.getByRole("button", { name: "Dias úteis" }));
    expect(last?.days).toEqual([1, 2, 3, 4, 5]);
    expect(screen.getByRole("button", { name: "Sex" }).getAttribute("aria-pressed")).toBe("true");
    fireEvent.click(screen.getByRole("button", { name: "Sex" }));
    expect(last?.days).toEqual([1, 2, 3, 4]);
    fireEvent.change(screen.getByLabelText("Início"), { target: { value: "22:00" } });
    fireEvent.change(screen.getByLabelText("Fim"), { target: { value: "02:00" } });
    expect(last).toMatchObject({ from: "22:00", to: "02:00" });
    expect(screen.getByText("(passa da meia-noite)")).toBeTruthy();
    fireEvent.click(screen.getByLabelText(/2\. LG/));
    expect(last?.monitors).toEqual(["\\\\.\\DISPLAY2"]);
    fireEvent.click(screen.getByRole("button", { name: "Qualquer dia" }));
    fireEvent.click(screen.getByRole("button", { name: "Qualquer horário" }));
    fireEvent.click(screen.getByLabelText(/2\. LG/));
    expect(last).toBeUndefined();
  });

  it("Identificar chama o backend; erro de horário aparece", () => {
    render(<Host initial={{ from: "09:00" }} />);
    expect(screen.getByRole("alert").textContent).toContain("início e de fim");
    fireEvent.click(screen.getByRole("button", { name: /Identificar/ }));
    expect(ipc.identifyMonitors).toHaveBeenCalled();
    expect(cleanWhen({ days: [3, 1, 1], monitors: [] })).toEqual({ days: [1, 3] });
  });
});
