import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cloneConfig, defaultConfig } from "../../shared/defaults";
import type { Config } from "../../shared/types";
import type { UpdateInfo } from "../../shared/ipc";

const ipc = vi.hoisted(() => ({
  handlers: new Map<string, (p: unknown) => void>(),
  updateStatus: vi.fn(async (): Promise<UpdateInfo> => ({ current: "0.30.0", available: false })),
  updateCheck: vi.fn(async (): Promise<UpdateInfo> => ({ current: "0.30.0", available: false, checkedAt: Math.floor(Date.now() / 1000) - 120 })),
  updateInstall: vi.fn(async () => {}),
}));
vi.mock("../../shared/ipc", async (orig) => ({
  ...(await orig<typeof import("../../shared/ipc")>()),
  ...ipc,
  onEvent: async (name: string, cb: (p: unknown) => void) => {
    ipc.handlers.set(name, cb);
    return () => ipc.handlers.delete(name);
  },
}));

import { UpdatesSection, ago } from "./UpdatesSection";

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});
const flush = () => act(async () => { for (let i = 0; i < 4; i++) await Promise.resolve(); });

let last: Config;
function Harness() {
  const [c, setC] = useState(cloneConfig(defaultConfig));
  last = c;
  return <UpdatesSection config={c} update={(fn) => setC((p) => { const n = cloneConfig(p); fn(n); return n; })} />;
}

describe("atualizações", () => {
  it("tempo relativo", () => {
    const now = 1_000_000;
    expect(ago(now - 10, now)).toBe("agora há pouco");
    expect(ago(now - 300, now)).toBe("há 5 min");
    expect(ago(now - 3 * 3600, now)).toBe("há 3 h");
    expect(ago(now - 86400, now)).toBe("ontem");
    expect(ago(now - 4 * 86400, now)).toBe("há 4 dias");
  });

  it("ligado por padrão; desligar grava false, religar apaga a chave", async () => {
    render(<Harness />);
    await flush();
    const box = screen.getByRole("checkbox", { name: /Procurar atualizações/ }) as HTMLInputElement;
    expect(box.checked).toBe(true);
    fireEvent.click(box);
    expect(last.behavior.checkUpdates).toBe(false);
    fireEvent.click(box);
    expect("checkUpdates" in last.behavior).toBe(false);
  });

  it("Procurar agora: atualizada mostra a versão e quando procurou", async () => {
    render(<Harness />);
    await flush();
    fireEvent.click(screen.getByRole("button", { name: /Procurar agora/ }));
    await flush();
    expect(screen.getByTestId("update-box").textContent).toContain("Você tem a versão 0.30.0 · última busca há 2 min · está atualizada.");
  });

  it("versão nova (pelo evento): notas e 'Atualizar e reiniciar'; erro na instalação aparece", async () => {
    render(<Harness />);
    await flush();
    await act(async () => ipc.handlers.get("update:status")!({ current: "0.30.0", available: true, version: "0.31.0", notes: "- Interface em inglês" }));
    expect(screen.getByText(/O que mudou/)).toBeTruthy();
    expect(screen.getByText("- Interface em inglês")).toBeTruthy();
    ipc.updateInstall.mockRejectedValueOnce("falha ao instalar a atualização: assinatura inválida");
    fireEvent.click(screen.getByRole("button", { name: /Atualizar e reiniciar/ }));
    await flush();
    expect(ipc.updateInstall).toHaveBeenCalled();
    expect(screen.getByText(/assinatura inválida/)).toBeTruthy();
  });

  it("erro ao procurar aparece", async () => {
    ipc.updateCheck.mockResolvedValueOnce({ current: "0.30.0", available: false, checkedAt: 1, error: "não foi possível procurar atualizações: sem internet" });
    render(<Harness />);
    await flush();
    fireEvent.click(screen.getByRole("button", { name: /Procurar agora/ }));
    await flush();
    expect(screen.getByText(/sem internet/)).toBeTruthy();
  });
});
