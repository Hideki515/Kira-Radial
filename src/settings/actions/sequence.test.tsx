import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { describeAction } from "../../shared/describe";
import { SEQUENCE_LIMITS, type Action } from "../../shared/types";
import { validateAction } from "../../shared/validate";

const ipc = vi.hoisted(() => ({ runAction: vi.fn(async (_a: Action) => {}) }));
vi.mock("../../shared/ipc", async (orig) => ({ ...(await orig<typeof import("../../shared/ipc")>()), ...ipc }));

import { ActionEditor, untestable } from "../ActionEditor";
import { defaultAction } from "./catalog";

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const seq = (steps: Action[], delayMs?: number): Action => ({ type: "sequence", steps, ...(delayMs !== undefined ? { delayMs } : {}) });
const open: Action = { type: "openSettings" };
const mute: Action = { type: "media", cmd: "mute" };

function Harness({ initial, onAction }: { initial: Action; onAction: (a: Action) => void }) {
  const [a, setA] = useState(initial);
  return <ActionEditor action={a} onChange={(n) => (setA(n), onAction(n))} />;
}

describe("validação e descrição da sequência", () => {
  it("2 a 10 passos, sem aninhar, sem desligar; erro do passo diz qual", () => {
    expect(validateAction(seq([open, mute]))).toBeNull();
    expect(validateAction(seq([open]))).toContain("2 a 10");
    expect(validateAction(seq(Array(11).fill(open)))).toContain("2 a 10");
    expect(validateAction(seq([open, seq([open, mute])]))).toContain("passo 2");
    expect(validateAction(seq([open, { type: "system", cmd: "restart" }]))).toContain("desligar");
    expect(validateAction(seq([open, { type: "launch", path: " " }]))).toBe("passo 2: informe o programa/arquivo.");
    expect(validateAction(seq([open, mute], 6000))).toContain("5000");
    expect(describeAction(seq([open, mute, open]))).toBe("Sequência: 3 ações");
  });

  it("Testar fica bloqueado para desligar/reiniciar/sair (sozinho ou na sequência)", () => {
    expect(untestable({ type: "system", cmd: "shutdown" })).toBe(true);
    expect(untestable({ type: "system", cmd: "lock" })).toBe(false);
    expect(untestable(seq([open, { type: "system", cmd: "signout" }]))).toBe(true);
    render(<ActionEditor action={{ type: "system", cmd: "shutdown" }} onChange={() => {}} />);
    expect(screen.getByRole("button", { name: /Testar ação/ })).toHaveProperty("disabled", true);
  });
});

describe("editor de passos", () => {
  it("padrão com 2 passos; passos não oferecem 'sequência' nem botão Testar próprio", () => {
    render(<Harness initial={defaultAction("sequence")} onAction={() => {}} />);
    const steps = screen.getAllByRole("listitem");
    expect(steps).toHaveLength(2);
    const stepTypes = within(steps[0]).getByDisplayValue("Abrir programa / arquivo") as HTMLSelectElement;
    expect([...stepTypes.options].map((o) => o.value)).not.toContain("sequence");
    expect(screen.getAllByRole("button", { name: /Testar ação/ })).toHaveLength(1);
  });

  it("adicionar, editar, mover e remover passos (mínimo 2); intervalo", () => {
    let last = defaultAction("sequence") as Extract<Action, { type: "sequence" }>;
    render(<Harness initial={last} onAction={(a) => (last = a as typeof last)} />);
    fireEvent.click(screen.getByRole("button", { name: /Adicionar passo/ }));
    expect(last.steps).toHaveLength(3);
    // Passo 3 vira "Abrir estas configurações".
    fireEvent.change(within(screen.getByTestId("step-2")).getByDisplayValue("Abrir programa / arquivo"), { target: { value: "openSettings" } });
    expect(last.steps[2]).toEqual({ type: "openSettings" });
    fireEvent.click(screen.getByRole("button", { name: "Subir passo 3" }));
    expect(last.steps.map((s) => s.type)).toEqual(["launch", "openSettings", "media"]);
    fireEvent.click(screen.getByRole("button", { name: "Remover passo 1" }));
    expect(last.steps.map((s) => s.type)).toEqual(["openSettings", "media"]);
    expect(screen.getByRole("button", { name: "Remover passo 1" })).toHaveProperty("disabled", true);
    fireEvent.change(screen.getByRole("slider"), { target: { value: "1200" } });
    expect(last.delayMs).toBe(1200);
    fireEvent.change(screen.getByRole("slider"), { target: { value: "300" } });
    expect(last.delayMs).toBeUndefined();
  });

  it("(QA) slider de intervalo vai até o máximo aceito pela validação (5000 ms)", () => {
    let last = defaultAction("sequence") as Extract<Action, { type: "sequence" }>;
    render(<Harness initial={last} onAction={(a) => (last = a as typeof last)} />);
    const slider = screen.getByRole("slider") as HTMLInputElement;
    expect(Number(slider.max)).toBe(SEQUENCE_LIMITS.maxDelayMs);
    fireEvent.change(slider, { target: { value: String(SEQUENCE_LIMITS.maxDelayMs) } });
    expect(last.delayMs).toBe(5000);
    expect(validateAction({ ...last, steps: [open, mute] })).toBeNull();
  });
});
