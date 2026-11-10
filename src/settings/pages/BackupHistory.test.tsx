import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { diffConfigs } from "../../shared/configDiff";
import { cloneConfig, defaultConfig } from "../../shared/defaults";
import type { BackupInfo } from "../../shared/ipc";
import type { Config } from "../../shared/types";

const ipc = vi.hoisted(() => ({
  listBackups: vi.fn(async (): Promise<BackupInfo[]> => []),
  readBackup: vi.fn(async (_n: string) => "{}"),
}));
vi.mock("../../shared/ipc", async (orig) => ({ ...(await orig<typeof import("../../shared/ipc")>()), ...ipc }));

import { BackupHistory, relativeTime } from "./BackupHistory";

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const flush = () => act(async () => { await Promise.resolve(); await Promise.resolve(); await Promise.resolve(); });

const older = () => {
  const c = cloneConfig(defaultConfig);
  c.hotkey.accelerator = "Alt+Q";
  c.appearance.theme = "holo";
  c.profiles[0].items[0].label = "Antigo";
  c.profiles[0].items.pop();
  return c;
};

describe("diferenças entre configurações", () => {
  it("lista atalho, aparência e itens alterados/removidos; iguais = vazio", () => {
    const cur = cloneConfig(defaultConfig);
    expect(diffConfigs(cur, cloneConfig(defaultConfig))).toEqual([]);
    const d = diffConfigs(cur, older());
    expect(d).toContain('Atalho: "Ctrl+Alt+Q" → "Alt+Q"');
    expect(d.some((x) => x.startsWith("Aparência.theme"))).toBe(true);
    expect(d.some((x) => x.includes('alterado "Antigo"'))).toBe(true);
    expect(d.some((x) => x.includes("removido"))).toBe(true);
  });

  it("perfis adicionados/removidos", () => {
    const cur = cloneConfig(defaultConfig);
    const other = cloneConfig(defaultConfig);
    other.profiles.push({ ...cloneConfig(defaultConfig).profiles[0], id: "vs", name: "VS Code", matchExe: ["code.exe"] });
    expect(diffConfigs(cur, other)).toContain(`Perfil adicionado: VS Code (${defaultConfig.profiles[0].items.length} fatias)`);
    expect(diffConfigs(other, cur)).toContain("Perfil removido: VS Code");
  });
});

describe("relativeTime", () => {
  it("formata recente, horas, hoje/ontem e data", () => {
    const now = new Date(2026, 10, 10, 15, 0).getTime();
    expect(relativeTime(now - 20_000, now)).toBe("agora há pouco");
    expect(relativeTime(now - 5 * 60_000, now)).toBe("há 5 min");
    expect(relativeTime(now - 2 * 3_600_000, now)).toBe("há 2 h");
    expect(relativeTime(new Date(2026, 10, 9, 14, 30).getTime(), now)).toBe("ontem 14:30");
    expect(relativeTime(new Date(2026, 10, 3, 9, 12).getTime(), now)).toBe("03/11 09:12");
  });
});

describe("Backup › Versões anteriores", () => {
  const list: BackupInfo[] = [
    { name: "config-20261110-143005.json", modified: Date.now() - 60_000 * 3, size: 900, valid: true, profiles: [{ name: "Padrão", items: 7 }] },
    { name: "config.invalid.json", modified: 0, size: 10, valid: false, profiles: [] },
  ];

  it("sem backups mostra o aviso", async () => {
    render(<BackupHistory config={cloneConfig(defaultConfig)} replace={() => {}} />);
    await flush();
    expect(screen.getByTestId("backups-empty")).toBeTruthy();
  });

  it("ver diferenças e restaurar no rascunho; corrompido não tem botões", async () => {
    ipc.listBackups.mockResolvedValue(list);
    ipc.readBackup.mockResolvedValue(JSON.stringify(older()));
    const replace = vi.fn((_c: Config) => {});
    render(<BackupHistory config={cloneConfig(defaultConfig)} replace={replace} />);
    await flush();
    expect(screen.getByText("há 3 min")).toBeTruthy();
    expect(screen.getByText("Padrão (7)")).toBeTruthy();
    expect(screen.getByTestId("backup-config.invalid.json").querySelector("button")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: /Ver diferenças/ }));
    await flush();
    expect(ipc.readBackup).toHaveBeenCalledWith("config-20261110-143005.json");
    expect(screen.getByTestId("backup-diff").textContent).toContain('Atalho: "Ctrl+Alt+Q" → "Alt+Q"');

    fireEvent.click(screen.getByRole("button", { name: /Restaurar no rascunho/ }));
    await flush();
    expect(replace).toHaveBeenCalledTimes(1);
    expect(replace.mock.calls[0][0].hotkey.accelerator).toBe("Alt+Q");
    expect(replace.mock.calls[0][0].launcher).toBeTruthy(); // withDefaults aplicado
    expect(screen.getByRole("status").textContent).toContain("Salvar");
  });

  it("backup ilegível mostra erro sem restaurar", async () => {
    ipc.listBackups.mockResolvedValue(list);
    ipc.readBackup.mockResolvedValue("{quebrado");
    const replace = vi.fn();
    render(<BackupHistory config={cloneConfig(defaultConfig)} replace={replace} />);
    await flush();
    fireEvent.click(screen.getByRole("button", { name: /Restaurar no rascunho/ }));
    await flush();
    expect(replace).not.toHaveBeenCalled();
    expect(screen.getByRole("status").textContent).toContain("Não foi possível restaurar");
  });
});
