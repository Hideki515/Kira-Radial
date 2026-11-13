import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Action } from "../../shared/types";
import type { DiscordStatus, DiscordVoiceState } from "../../shared/ipc";

const OK: DiscordVoiceState = {
  status: "ok",
  voice: {
    mute: true,
    deaf: false,
    input: { current: "mic-1", devices: [{ id: "default", name: "Default" }, { id: "mic-1", name: "Microfone (USB)" }] },
    output: { current: "default", devices: [{ id: "default", name: "Default" }, { id: "out-1", name: "Headset Earphone (Arctis)" }] },
  },
};

const ipc = vi.hoisted(() => ({
  discordStatus: vi.fn(async (): Promise<DiscordStatus> => ({ configured: false })),
  discordConnect: vi.fn(async () => "kira"),
  discordDisconnect: vi.fn(async () => {}),
  discordVoice: vi.fn(async (): Promise<DiscordVoiceState> => ({ status: "notConnected", message: "Conecte" })),
  runAction: vi.fn(async (_a: Action) => {}),
}));
vi.mock("../../shared/ipc", async (orig) => ({ ...(await orig<typeof import("../../shared/ipc")>()), ...ipc }));

import { DEV_PORTAL, DiscordPage, describeTest } from "./DiscordPage";
import { ActionEditor, discordStateMessage } from "../ActionEditor";

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});
const flush = () => act(async () => { for (let i = 0; i < 5; i++) await Promise.resolve(); });

describe("página Discord", () => {
  it("sem conexão: Conectar só habilita com os dois campos; Testar/Desconectar desabilitados", async () => {
    render(<DiscordPage />);
    await flush();
    expect(screen.getByTestId("discord-status").textContent).toBe("Não conectado.");
    const connect = screen.getByRole("button", { name: /Conectar/ });
    expect(connect).toHaveProperty("disabled", true);
    expect(screen.getByRole("button", { name: /Testar/ })).toHaveProperty("disabled", true);
    expect(screen.getByRole("button", { name: /Desconectar/ })).toHaveProperty("disabled", true);
    fireEvent.change(screen.getByPlaceholderText("123456789012345678"), { target: { value: "42" } });
    expect(connect).toHaveProperty("disabled", true);
    fireEvent.change(screen.getByLabelText(/Client Secret/), { target: { value: "s3" } });
    expect(connect).toHaveProperty("disabled", false);
  });

  it("conectar envia os campos, limpa o segredo e mostra o usuário", async () => {
    render(<DiscordPage />);
    await flush();
    fireEvent.change(screen.getByPlaceholderText("123456789012345678"), { target: { value: "42" } });
    const secret = screen.getByLabelText(/Client Secret/) as HTMLInputElement;
    expect(secret.type).toBe("password");
    fireEvent.change(secret, { target: { value: "s3" } });
    ipc.discordStatus.mockResolvedValue({ configured: true, clientId: "42", user: "kira" });
    fireEvent.click(screen.getByRole("button", { name: /Conectar/ }));
    await flush();
    expect(ipc.discordConnect).toHaveBeenCalledWith("42", "s3");
    expect(secret.value).toBe("");
    expect(screen.getByRole("status").textContent).toBe("Conectado como kira.");
    expect(screen.getByTestId("discord-status").textContent).toContain("Conectado como kira");
  });

  it("erro ao conectar aparece; testar e desconectar quando conectado", async () => {
    ipc.discordStatus.mockResolvedValue({ configured: true, clientId: "42", user: "kira" });
    ipc.discordVoice.mockResolvedValue(OK);
    render(<DiscordPage />);
    await flush();
    expect((screen.getByPlaceholderText("123456789012345678") as HTMLInputElement).value).toBe("42");
    fireEvent.click(screen.getByRole("button", { name: /Testar/ }));
    await flush();
    expect(screen.getByRole("status").textContent).toBe("Funcionando: microfone mutado, fone ligado.");
    fireEvent.click(screen.getByRole("button", { name: /Desconectar/ }));
    await flush();
    expect(ipc.discordDisconnect).toHaveBeenCalled();

    ipc.discordConnect.mockRejectedValueOnce("Client ID ou Client Secret incorretos.");
    fireEvent.change(screen.getByLabelText(/Client Secret/), { target: { value: "x" } });
    fireEvent.click(screen.getByRole("button", { name: /Conectar/ }));
    await flush();
    expect(screen.getByText("Client ID ou Client Secret incorretos.")).toBeTruthy();
  });

  it("o portal só abre ao clicar", async () => {
    render(<DiscordPage />);
    await flush();
    expect(ipc.runAction).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: /Abrir o portal/ }));
    expect(ipc.runAction).toHaveBeenCalledWith({ type: "url", url: DEV_PORTAL });
  });

  it("textos do teste e do estado", () => {
    expect(describeTest({ status: "closed", message: "O Discord não está aberto." })).toEqual({ ok: false, text: "O Discord não está aberto." });
    expect(discordStateMessage({ status: "closed" })).toContain("Abra o Discord");
    expect(discordStateMessage({ status: "notConnected" })).toContain("Conecte");
    expect(discordStateMessage(OK)).toBeNull();
  });
});

describe("editor da ação Discord", () => {
  it("comando simples não lê dispositivos; trocar para entrada lista os do Discord", async () => {
    ipc.discordVoice.mockResolvedValue(OK);
    let got: Action = { type: "discord", cmd: "toggleMute" };
    const { rerender } = render(<ActionEditor action={got} onChange={(a) => (got = a)} />);
    await flush();
    expect(ipc.discordVoice).not.toHaveBeenCalled();
    fireEvent.change(screen.getByLabelText("Comando do Discord"), { target: { value: "setInput" } });
    expect(got).toEqual({ type: "discord", cmd: "setInput" });
    rerender(<ActionEditor action={got} onChange={(a) => (got = a)} />);
    await flush();
    expect(screen.getByText("escolha o dispositivo do Discord.")).toBeTruthy();
    const sel = screen.getByLabelText("Dispositivo do Discord") as HTMLSelectElement;
    expect([...sel.options].map((o) => o.textContent)).toEqual(["Selecione…", "Padrão", "Microfone (USB) (atual)"]);
    fireEvent.change(sel, { target: { value: "mic-1" } });
    expect(got).toEqual({ type: "discord", cmd: "setInput", deviceId: "mic-1", deviceName: "Microfone (USB)" });
  });

  it("dispositivo salvo que sumiu continua na lista; Discord desconectado explica", async () => {
    ipc.discordVoice.mockResolvedValue(OK);
    render(<ActionEditor action={{ type: "discord", cmd: "setOutput", deviceId: "velho", deviceName: "Fone antigo" }} onChange={() => {}} />);
    await flush();
    const sel = screen.getByLabelText("Dispositivo do Discord") as HTMLSelectElement;
    expect(sel.options[sel.selectedIndex].textContent).toBe("Fone antigo (não encontrado)");
    cleanup();
    ipc.discordVoice.mockResolvedValue({ status: "notConnected", message: "x" });
    render(<ActionEditor action={{ type: "discord", cmd: "setOutput" }} onChange={() => {}} />);
    await flush();
    expect(screen.getByText(/Conecte o Discord na página Discord/)).toBeTruthy();
  });
});
