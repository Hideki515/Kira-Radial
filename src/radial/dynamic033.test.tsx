import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Action, MenuItem } from "../shared/types";
import type { VpnInfo, VsProject } from "../shared/ipc";

const ipc = vi.hoisted(() => ({
  listVpns: vi.fn(async (): Promise<VpnInfo[]> => [{ name: "Escritório", connected: false }, { name: "Casa", connected: true }]),
}));
vi.mock("../shared/ipc", async (orig) => ({ ...(await orig<typeof import("../shared/ipc")>()), ...ipc }));

import { describeAction } from "../shared/describe";
import { setLang } from "../shared/i18n";
import { getIcon } from "../shared/icons";
import { validateAction } from "../shared/validate";
import { ActionEditor } from "../settings/ActionEditor";
import { kindChangedBy } from "./useDynamicSources";
import { AUDIO_CURRENT_COLOR, DYNAMIC_HINT, DYNAMIC_LABEL, resolveItems, vpnChildren, vscodeChildren } from "./dynamic";

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const EXE = "C:\\Users\\a\\AppData\\Local\\Programs\\Microsoft VS Code\\Code.exe";
const proj = (name: string, path: string, workspace = false): VsProject => ({ name, path, workspace, exe: EXE });

describe("submenu Projetos do VS Code (v0.33.0)", () => {
  it("carregando, vazio e lista: clique abre a pasta no VS Code, com aspas", () => {
    expect(vscodeChildren("p", null)[0].label).toBe("Carregando…");
    expect(vscodeChildren("p", [])[0]).toMatchObject({ label: "Nenhum projeto" });
    expect(vscodeChildren("p", [])[0].action).toBeUndefined();
    const [a, b] = vscodeChildren("p", [proj("Kira-Radial", "D:\\Code\\Kira-Radial"), proj("Trabalho", "D:\\ws\\Trabalho.code-workspace", true)]);
    expect(a).toMatchObject({ label: "Kira-Radial", icon: "folder-code", action: { type: "launch", path: EXE, args: '"D:\\Code\\Kira-Radial"' } });
    expect(b.icon).toBe("layers");
    expect(b.action).toMatchObject({ args: '"D:\\ws\\Trabalho.code-workspace"' });
  });

  it("nomes iguais ganham a pasta de cima; barra no fim não escapa a aspa; máximo de 8", () => {
    const got = vscodeChildren("p", [proj("app", "D:\\a\\app"), proj("app", "D:\\b\\app"), proj("D:\\", "D:\\")]);
    expect(got.map((c) => c.label)).toEqual(["a/app", "b/app", "D:\\"]);
    expect((got[2].action as Extract<Action, { type: "launch" }>).args).toBe('"D:\\."');
    const many = Array.from({ length: 12 }, (_, i) => proj(`p${i}`, `C:\\p${i}`));
    expect(vscodeChildren("p", many)).toHaveLength(8);
  });

  it("entra pelo resolveItems com o tipo vscodeProjects", () => {
    const slice: MenuItem = { id: "vs", label: "VS Code", icon: "code", dynamic: "vscodeProjects" };
    const [it] = resolveItems([slice], { vscode: [proj("X", "C:\\X")] });
    expect(it.children![0].label).toBe("X");
  });
});

describe("submenu VPNs e ação VPN (v0.33.0)", () => {
  it("conectada em verde com escudo; clique alterna pelo nome", () => {
    expect(vpnChildren("v", null)[0].label).toBe("Carregando…");
    expect(vpnChildren("v", [])[0]).toMatchObject({ label: "Nenhuma VPN", icon: "shield-off" });
    const [off, on] = vpnChildren("v", [{ name: "Escritório", connected: false }, { name: "Casa", connected: true }]);
    expect(off).toMatchObject({ icon: "shield", action: { type: "vpn", name: "Escritório", mode: "toggle" } });
    expect(off.color).not.toBe(AUDIO_CURRENT_COLOR);
    expect(on).toMatchObject({ icon: "shield-check", color: AUDIO_CURRENT_COLOR });
    const [it] = resolveItems([{ id: "vp", label: "VPN", icon: "shield", dynamic: "vpns" }], { vpns: [{ name: "Casa", connected: true }] });
    expect(it.children![0].label).toBe("Casa");
  });

  it("os ícones novos existem no registro (não caem no círculo)", () => {
    for (const n of ["shield", "shield-check", "shield-off", "folder-code"]) expect(getIcon(n)).not.toBe(getIcon("nao-existe"));
  });

  it("validação, descrição e invalidação do cache", () => {
    expect(validateAction({ type: "vpn", name: "  ", mode: "toggle" })).toBe("informe o nome da VPN.");
    expect(validateAction({ type: "vpn", name: 'a"b', mode: "toggle" })).toMatch(/aspas/);
    expect(validateAction({ type: "vpn", name: "a\nb", mode: "toggle" })).toMatch(/aspas/);
    expect(validateAction({ type: "vpn", name: "x".repeat(257), mode: "toggle" })).toMatch(/256/);
    expect(validateAction({ type: "vpn", name: "Escritório", mode: "connect" })).toBeNull();
    expect(describeAction({ type: "vpn", name: "Casa", mode: "connect" })).toBe("Conectar a VPN Casa");
    expect(describeAction({ type: "vpn", name: "Casa", mode: "disconnect" })).toBe("Desconectar a VPN Casa");
    expect(describeAction({ type: "vpn", name: "Casa", mode: "toggle" })).toBe("Conectar/desconectar a VPN Casa");
    expect(kindChangedBy({ type: "vpn", name: "Casa", mode: "toggle" })).toBe("vpns");
  });

  it("textos em inglês", () => {
    setLang("en");
    expect(DYNAMIC_LABEL.vscodeProjects).toBe("VS Code projects");
    expect(DYNAMIC_HINT.vpns).toMatch(/VPNs saved in Windows/);
    expect(describeAction({ type: "vpn", name: "Home", mode: "connect" })).toBe("Connect the Home VPN");
    expect(vpnChildren("v", [])[0].label).toBe("No VPNs");
    setLang("pt");
  });

  it("editor: sugere as VPNs salvas e troca o modo", async () => {
    let last: Action | null = null;
    function H() {
      const [a, setA] = useState<Action>({ type: "vpn", name: "", mode: "toggle" });
      return <ActionEditor action={a} onChange={(n) => (setA(n), (last = n))} />;
    }
    const { container } = render(<H />);
    await waitFor(() => expect(container.querySelectorAll("#kira-vpn-names option")).toHaveLength(2));
    expect(ipc.listVpns).toHaveBeenCalledTimes(1);
    const input = container.querySelector('input[list="kira-vpn-names"]') as HTMLInputElement;
    fireEvent.change(input, { target: { value: "Casa" } });
    expect(last).toEqual({ type: "vpn", name: "Casa", mode: "toggle" });
    fireEvent.click(screen.getByRole("radio", { name: "Desconectar" }));
    expect(last).toEqual({ type: "vpn", name: "Casa", mode: "disconnect" });
  });
});
