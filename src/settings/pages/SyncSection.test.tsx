import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { SyncStatus } from "../../shared/ipc";

const ipc = vi.hoisted(() => ({
  status: { enabled: false, folder: "", lastSync: 0, lastMachine: "", error: null } as SyncStatus,
  configure: vi.fn(),
  now: vi.fn(),
  pick: vi.fn(),
}));

vi.mock("../../shared/ipc", async (orig) => ({
  ...(await orig<typeof import("../../shared/ipc")>()),
  syncStatus: async () => ipc.status,
  syncConfigure: ipc.configure,
  syncNow: ipc.now,
  pickPath: ipc.pick,
  onEvent: async () => () => {},
}));

import { SyncSection } from "./SyncSection";

const flush = () => act(async () => { for (let i = 0; i < 4; i++) await Promise.resolve(); });

beforeEach(() => {
  ipc.status = { enabled: false, folder: "", lastSync: 0, lastMachine: "", error: null };
  ipc.configure.mockReset();
  ipc.now.mockReset();
  ipc.pick.mockReset();
});
afterEach(cleanup);

describe("Configurações: sincronizar entre PCs (v0.46.0)", () => {
  it("ligar sem pasta pede a pasta e configura; mostra a pasta e a última sincronização", async () => {
    ipc.pick.mockResolvedValue("D:\OneDrive\Kira");
    ipc.configure.mockResolvedValue({ enabled: true, folder: "D:\OneDrive\Kira", lastSync: Date.UTC(2026, 10, 24, 12), lastMachine: "PC-SALA", error: null });
    render(<SyncSection />);
    await flush();
    fireEvent.click(screen.getByRole("checkbox", { name: "Sincronizar a configuração" }));
    await flush();
    expect(ipc.pick).toHaveBeenCalledWith(true);
    expect(ipc.configure).toHaveBeenCalledWith(true, "D:\OneDrive\Kira");
    expect(screen.getByTestId("sync-folder").textContent).toContain("D:\OneDrive\Kira");
    expect(screen.getByTestId("sync-last").textContent).toContain("PC-SALA");
  });

  it("cancelar a escolha da pasta não liga; erro do backend aparece", async () => {
    ipc.pick.mockResolvedValue(null);
    render(<SyncSection />);
    await flush();
    fireEvent.click(screen.getByRole("checkbox", { name: "Sincronizar a configuração" }));
    await flush();
    expect(ipc.configure).not.toHaveBeenCalled();
    cleanup();
    ipc.status = { enabled: true, folder: "X:\sumiu", lastSync: 0, lastMachine: "", error: "pasta indisponível" };
    ipc.now.mockRejectedValue("sem acesso");
    render(<SyncSection />);
    await flush();
    expect(screen.getByTestId("sync-error").textContent).toBe("pasta indisponível");
    fireEvent.click(screen.getByRole("button", { name: /Sincronizar agora/ }));
    await flush();
    expect(screen.getByTestId("sync-error").textContent).toBe("sem acesso");
  });

  it("desligar mantém a pasta guardada", async () => {
    ipc.status = { enabled: true, folder: "D:\Drive", lastSync: 0, lastMachine: "", error: null };
    ipc.configure.mockResolvedValue({ ...ipc.status, enabled: false });
    render(<SyncSection />);
    await flush();
    fireEvent.click(screen.getByRole("checkbox", { name: "Sincronizar a configuração" }));
    await flush();
    expect(ipc.configure).toHaveBeenCalledWith(false, "D:\Drive");
  });
});
