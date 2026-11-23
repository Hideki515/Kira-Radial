import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Action } from "../shared/types";
import type { ObsSettings, ObsState } from "../shared/ipc";

const OK: ObsState = { status: "ok", version: "31.0.0", scenes: ["Início", "Jogo"], current: "Jogo", recording: false, streaming: false, inputs: ["Mic/Aux"] };
const ipc = vi.hoisted(() => ({
  obsState: vi.fn(async (): Promise<ObsState> => ({ status: "closed", message: "fechado", scenes: [], inputs: [], recording: false, streaming: false })),
  obsSettings: vi.fn(async (): Promise<ObsSettings> => ({ port: 4455, hasPassword: false })),
  obsSaveSettings: vi.fn(async (port: number, password?: string): Promise<ObsSettings> => ({ port, hasPassword: !!password })),
}));
vi.mock("../shared/ipc", async (orig) => ({ ...(await orig<typeof import("../shared/ipc")>()), ...ipc }));

import { describeAction } from "../shared/describe";
import { setLang } from "../shared/i18n";
import { validateAction } from "../shared/validate";
import { AUDIO_CURRENT_COLOR, DYNAMIC_LABEL, obsSceneChildren, resolveItems } from "../radial/dynamic";
import { kindChangedBy } from "../radial/useDynamicSources";
import { ActionEditor } from "./ActionEditor";
import { OBS } from "./actions/catalog";
import { ObsPage, describeObs } from "./pages/ObsPage";

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  ipc.obsState.mockReset();
  ipc.obsState.mockResolvedValue({ status: "closed", message: "fechado", scenes: [], inputs: [], recording: false, streaming: false });
});

describe("submenu Cenas do OBS (v0.34.0)", () => {
  it("cenas na ordem, a atual em verde; clique troca a cena", () => {
    const kids = obsSceneChildren("o", OK);
    expect(kids.map((k) => k.label)).toEqual(["Início", "Jogo"]);
    expect(kids[1].color).toBe(AUDIO_CURRENT_COLOR);
    expect(kids[0].color).not.toBe(AUDIO_CURRENT_COLOR);
    expect(kids[0].action).toEqual({ type: "obs", cmd: "setScene", scene: "Início" });
    const [it] = resolveItems([{ id: "s", label: "OBS", icon: "clapperboard", dynamic: "obsScenes" }], { obs: OK });
    expect(it.children).toHaveLength(2);
  });

  it("carregando, sem cenas e problemas viram uma fatia que explica (sem ação)", () => {
    expect(obsSceneChildren("o", null)[0].label).toBe("Carregando…");
    expect(obsSceneChildren("o", { ...OK, scenes: [] })[0].label).toBe("Nenhuma cena");
    const base = { scenes: [], inputs: [], recording: false, streaming: false };
    expect(obsSceneChildren("o", { ...base, status: "closed" })[0]).toMatchObject({ label: "OBS fechado" });
    expect(obsSceneChildren("o", { ...base, status: "needPassword" })[0].label).toBe("Senha do OBS");
    expect(obsSceneChildren("o", { ...base, status: "authFailed" })[0].label).toBe("Senha do OBS");
    const err = obsSceneChildren("o", { ...base, status: "error" })[0];
    expect(err.label).toBe("OBS sem resposta");
    expect(err.action).toBeUndefined();
    const many = obsSceneChildren("o", { ...OK, scenes: Array.from({ length: 12 }, (_, i) => `C${i}`) });
    expect(many).toHaveLength(8);
  });
});

describe("ação OBS (v0.34.0)", () => {
  it("validação, descrição, catálogo e cache", () => {
    expect(validateAction({ type: "obs", cmd: "toggleRecord" })).toBeNull();
    expect(validateAction({ type: "obs", cmd: "setScene", scene: " " })).toBe("informe a cena do OBS.");
    expect(validateAction({ type: "obs", cmd: "toggleMute" })).toBe("informe a fonte de áudio do OBS.");
    expect(validateAction({ type: "obs", cmd: "explode" as never })).toBe("comando do OBS desconhecido.");
    expect(describeAction({ type: "obs", cmd: "setScene", scene: "Jogo" })).toBe("Trocar para a cena Jogo no OBS");
    expect(describeAction({ type: "obs", cmd: "toggleMute", input: "Mic" })).toBe("Mutar/desmutar Mic no OBS");
    expect(describeAction({ type: "obs", cmd: "saveReplay" })).toBe("Salvar o replay do OBS");
    expect(OBS).toHaveLength(11);
    for (const c of OBS) expect(c.label).not.toMatch(/^act\./);
    expect(kindChangedBy({ type: "obs", cmd: "setScene", scene: "x" })).toBe("obsScenes");
  });

  it("em inglês", () => {
    setLang("en");
    expect(describeAction({ type: "obs", cmd: "toggleStream" })).toBe("Start/stop OBS streaming");
    expect(DYNAMIC_LABEL.obsScenes).toBe("OBS scenes");
    expect(OBS.find((c) => c.value === "toggleVirtualCam")!.label).toBe("Start/stop virtual camera");
    setLang("pt");
  });

  it("editor: cena com sugestões do OBS; trocar de comando guarda só o campo dele", async () => {
    ipc.obsState.mockResolvedValueOnce(OK);
    let last: Action | null = null;
    function H() {
      const [a, setA] = useState<Action>({ type: "obs", cmd: "setScene", scene: "" });
      return <ActionEditor action={a} onChange={(n) => (setA(n), (last = n))} />;
    }
    const { container } = render(<H />);
    await waitFor(() => expect(container.querySelectorAll("#kira-obs-scenes option")).toHaveLength(2));
    fireEvent.change(container.querySelector('input[list="kira-obs-scenes"]')!, { target: { value: "Jogo" } });
    expect(last).toEqual({ type: "obs", cmd: "setScene", scene: "Jogo" });
    fireEvent.change(screen.getByDisplayValue("Trocar de cena"), { target: { value: "toggleMute" } });
    expect(last).toEqual({ type: "obs", cmd: "toggleMute", input: "" });
    expect(container.querySelectorAll("#kira-obs-inputs option")).toHaveLength(1);
    fireEvent.change(screen.getByDisplayValue("Mutar/desmutar fonte de áudio"), { target: { value: "saveReplay" } });
    expect(last).toEqual({ type: "obs", cmd: "saveReplay" });
    expect(ipc.obsState).toHaveBeenCalledTimes(1);
  });
});

describe("página OBS (v0.34.0)", () => {
  it("mostra OBS fechado, salva porta e senha e testa de novo", async () => {
    render(<ObsPage />);
    await waitFor(() => expect(screen.getByTestId("obs-status").textContent).toBe("fechado"));
    const port = screen.getByPlaceholderText("4455") as HTMLInputElement;
    expect(port.value).toBe("4455");
    fireEvent.change(port, { target: { value: "45a60" } });
    expect(port.value).toBe("4560");
    const pw = container().querySelector('input[type="password"]') as HTMLInputElement;
    fireEvent.change(pw, { target: { value: "segredo" } });
    ipc.obsState.mockResolvedValue(OK);
    fireEvent.click(screen.getByRole("button", { name: /Salvar e testar/ }));
    await waitFor(() => expect(screen.getByRole("status").textContent).toBe("Conectado ao OBS 31.0.0. Cena atual: Jogo."));
    expect(ipc.obsSaveSettings).toHaveBeenCalledWith(4560, "segredo");
    expect(pw.value).toBe("");
    // Agora há senha salva: dá para apagar.
    fireEvent.click(screen.getByRole("button", { name: /Apagar senha/ }));
    await waitFor(() => expect(ipc.obsSaveSettings).toHaveBeenLastCalledWith(4560, ""));
  });

  it("porta inválida desliga o salvar; sem senha nova mantém a salva", async () => {
    ipc.obsSettings.mockResolvedValueOnce({ port: 4455, hasPassword: true });
    render(<ObsPage />);
    await waitFor(() => expect(screen.getByText("Há uma senha salva. Deixe em branco para mantê-la.")).toBeTruthy());
    const port = screen.getByPlaceholderText("4455");
    fireEvent.change(port, { target: { value: "0" } });
    expect((screen.getByRole("button", { name: /Salvar e testar/ }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.change(port, { target: { value: "4455" } });
    fireEvent.click(screen.getByRole("button", { name: /Salvar e testar/ }));
    await waitFor(() => expect(ipc.obsSaveSettings).toHaveBeenCalledWith(4455, undefined));
  });

  it("describeObs: gravando e erro", () => {
    expect(describeObs({ ...OK, recording: true }).text).toMatch(/Gravando/);
    expect(describeObs({ ...OK, status: "authFailed", message: "senha errada" })).toEqual({ ok: false, text: "senha errada" });
  });
});

function container() {
  return document.body;
}
