import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Action, LayoutWindow } from "../shared/types";

const W: LayoutWindow[] = [
  { exe: "C:\\Apps\\Code.exe", title: "Kira-Radial - Visual Studio Code", x: 0, y: 0, w: 960, h: 1040, state: "normal" },
  { exe: "C:\\Chrome\\chrome.exe", title: "Gmail - Google Chrome", x: 1920, y: 0, w: 960, h: 1040, state: "maximized" },
  { exe: "C:\\Windows\\explorer.exe", title: "Downloads", x: 10, y: 20, w: 800, h: 600, state: "minimized" },
];
const ipc = vi.hoisted(() => ({ layoutCapture: vi.fn(async (): Promise<LayoutWindow[]> => []) }));
vi.mock("../shared/ipc", async (orig) => ({ ...(await orig<typeof import("../shared/ipc")>()), ...ipc }));

import { describeAction } from "../shared/describe";
import { setLang } from "../shared/i18n";
import { validateAction } from "../shared/validate";
import { ActionEditor } from "./ActionEditor";

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

function Harness({ onAction, initial }: { onAction: (a: Action) => void; initial?: Action }) {
  const [a, setA] = useState<Action>(initial ?? { type: "layout", windows: [] });
  return <ActionEditor action={a} onChange={(n) => (setA(n), onAction(n))} />;
}

describe("ação Layout de janelas (v0.36.0)", () => {
  it("captura as janelas abertas, mostra onde cada uma fica e permite tirar uma", async () => {
    ipc.layoutCapture.mockResolvedValueOnce(W);
    let last: Action | null = null;
    render(<Harness onAction={(a) => (last = a)} />);
    expect(screen.getByText("Nenhuma janela capturada ainda.")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /Capturar janelas abertas agora/ }));
    await waitFor(() => expect(last).toEqual({ type: "layout", windows: W }));
    expect(screen.getByText("Code")).toBeTruthy();
    expect(screen.getByText("960×1040 em 0, 0")).toBeTruthy();
    expect(screen.getByText("maximizada")).toBeTruthy();
    expect(screen.getByText("800×600 em 10, 20 · minimizada")).toBeTruthy();
    expect(screen.getByRole("button", { name: /Capturar de novo/ })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Tirar do layout: Gmail - Google Chrome" }));
    expect((last as unknown as Extract<Action, { type: "layout" }>).windows.map((w) => w.title)).toEqual([W[0].title, W[2].title]);
    fireEvent.click(screen.getByRole("checkbox", { name: /Abrir os apps que não estiverem abertos/ }));
    expect(last).toMatchObject({ launchMissing: true });
  });

  it("nenhuma janela aberta ou erro: aviso, sem apagar o que já havia", async () => {
    let last: Action | null = null;
    render(<Harness onAction={(a) => (last = a)} initial={{ type: "layout", windows: [W[0]] }} />);
    fireEvent.click(screen.getByRole("button", { name: /Capturar de novo/ }));
    await waitFor(() => expect(screen.getByRole("status").textContent).toBe("Nenhuma janela de app aberta para capturar."));
    expect(last).toBeNull();
    ipc.layoutCapture.mockRejectedValueOnce("falhou");
    fireEvent.click(screen.getByRole("button", { name: /Capturar de novo/ }));
    await waitFor(() => expect(screen.getByRole("status").textContent).toBe("falhou"));
  });

  it("limite de 20 janelas na captura", async () => {
    ipc.layoutCapture.mockResolvedValueOnce(Array.from({ length: 25 }, (_, i) => ({ ...W[0], title: `J${i}` })));
    let last: Action | null = null;
    render(<Harness onAction={(a) => (last = a)} />);
    fireEvent.click(screen.getByRole("button", { name: /Capturar janelas/ }));
    await waitFor(() => expect((last as unknown as Extract<Action, { type: "layout" }>)?.windows).toHaveLength(20));
  });

  it("validação e descrição (pt/en)", () => {
    expect(validateAction({ type: "layout", windows: [] })).toBe("capture de 1 a 20 janelas para o layout.");
    expect(validateAction({ type: "layout", windows: Array(21).fill(W[0]) })).toMatch(/1 a 20/);
    expect(validateAction({ type: "layout", windows: [{ ...W[0], w: 0 }] })).toBe("o layout tem uma janela inválida; capture de novo.");
    expect(validateAction({ type: "layout", windows: [{ ...W[0], exe: " " }] })).toMatch(/inválida/);
    expect(validateAction({ type: "layout", windows: W })).toBeNull();
    expect(describeAction({ type: "layout", windows: W })).toBe("Organizar 3 janelas");
    expect(describeAction({ type: "layout", windows: [W[0]] })).toBe("Organizar 1 janela");
    setLang("en");
    expect(describeAction({ type: "layout", windows: W })).toBe("Arrange 3 windows");
    setLang("pt");
  });
});
