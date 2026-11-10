import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Diagnostics } from "../../shared/ipc";

const LINES = [
  "1731250000000 [rust] linha antiga do perf.log",
  "2026-11-10 15:30:05.123 INFO [rust] abrir menu",
  "2026-11-10 15:30:06.000 WARN [settings] atalho em uso",
  "2026-11-10 15:30:07.000 ERROR [radial] erro: boom (index.js:1)",
];
const DIAG: Diagnostics = {
  version: "0.11.0", webview: "130.0", windows: "Windows 11 Pro 24H2 (build 26100)", monitors: ["1920×1080 em 0,0"],
  launcherMode: "both", theme: "holo", hotkey: "Ctrl+Alt+Q", hotkeyRegistered: true, hotkeyError: null,
  memoryMb: 61.2, recentErrors: 1, dataDir: "C:/x/Kira-Radial", qa: false,
};

const ipc = vi.hoisted(() => ({
  readLog: vi.fn(async () => [] as string[]),
  getDiagnostics: vi.fn(async (): Promise<Diagnostics | null> => null),
  clearLog: vi.fn(async () => {}),
  openDataDir: vi.fn(async () => {}),
  writeReport: vi.fn(async () => "C:/x/Kira-Radial/relatorio-1.txt"),
}));
vi.mock("../../shared/ipc", async (orig) => ({ ...(await orig<typeof import("../../shared/ipc")>()), ...ipc }));

import { DiagnosticsPage, filterLines, levelOf } from "./DiagnosticsPage";

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});
const flush = () => act(async () => { await Promise.resolve(); await Promise.resolve(); });

describe("filtro do log", () => {
  it("nível de cada linha (antigas = INFO) e filtros por nível/texto", () => {
    expect(LINES.map(levelOf)).toEqual(["INFO", "INFO", "WARN", "ERROR"]);
    expect(filterLines(LINES, "warn", "")).toHaveLength(2);
    expect(filterLines(LINES, "error", "")).toEqual([LINES[3]]);
    expect(filterLines(LINES, "all", "ATALHO")).toEqual([LINES[2]]);
  });
});

describe("Configurações › Diagnóstico", () => {
  it("mostra resumo e log; filtra; gera relatório", async () => {
    ipc.readLog.mockResolvedValue(LINES);
    ipc.getDiagnostics.mockResolvedValue(DIAG);
    render(<DiagnosticsPage />);
    await flush();
    expect(screen.getByTestId("diag-summary").textContent).toContain("Windows 11 Pro");
    expect(screen.getByText(/Ctrl\+Alt\+Q — registrado/)).toBeTruthy();
    expect(screen.getByTestId("log-view").querySelectorAll(".log-line.is-error")).toHaveLength(1);
    fireEvent.change(screen.getByLabelText("Nível"), { target: { value: "error" } });
    expect(screen.getByTestId("log-view").querySelectorAll(".log-line")).toHaveLength(1);
    expect(screen.getByText("1 de 4 linhas")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /Gerar relatório/ }));
    await flush();
    expect(screen.getByRole("status").textContent).toContain("relatorio-1.txt");
  });

  it("atualiza sozinho a cada 2 s e para quando desligado", async () => {
    vi.useFakeTimers({ toFake: ["setInterval", "clearInterval"] });
    try {
      render(<DiagnosticsPage />);
      await flush();
      const before = ipc.readLog.mock.calls.length;
      act(() => void vi.advanceTimersByTime(4100));
      expect(ipc.readLog.mock.calls.length).toBe(before + 2);
      fireEvent.click(screen.getByLabelText("Atualizar sozinho"));
      act(() => void vi.advanceTimersByTime(4100));
      expect(ipc.readLog.mock.calls.length).toBe(before + 2);
    } finally {
      vi.useRealTimers();
    }
  });

  it("limpar pede confirmação", async () => {
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
    render(<DiagnosticsPage />);
    await flush();
    fireEvent.click(screen.getByRole("button", { name: /Limpar/ }));
    expect(confirm).toHaveBeenCalled();
    expect(ipc.clearLog).not.toHaveBeenCalled();
    confirm.mockReturnValue(true);
    fireEvent.click(screen.getByRole("button", { name: /Limpar/ }));
    await flush();
    expect(ipc.clearLog).toHaveBeenCalledTimes(1);
    confirm.mockRestore();
  });
});
