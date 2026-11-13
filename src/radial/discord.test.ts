import { describe, expect, it } from "vitest";
import type { DiscordVoiceState } from "../shared/ipc";
import { describeAction } from "../shared/describe";
import { DYNAMIC_KINDS, type MenuItem } from "../shared/types";
import { validateAction } from "../shared/validate";
import { AUDIO_CURRENT_COLOR, AUDIO_OTHER_COLOR, DYNAMIC_HINT, DYNAMIC_LABEL, discordDeviceChildren, discordVoiceChildren, resolveItems } from "./dynamic";

const voice = (mute: boolean, deaf: boolean): DiscordVoiceState => ({
  status: "ok",
  voice: {
    mute,
    deaf,
    input: { current: "mic-2", devices: [{ id: "mic-1", name: "Microfone (USB Audio)" }, { id: "default", name: "Default" }, { id: "mic-2", name: "Headset Microphone (Arctis)" }] },
    output: { current: "default", devices: [{ id: "default", name: "Default" }, { id: "out-1", name: "Headset Earphone (Arctis)" }] },
  },
});

describe("submenu Discord: microfone e fone", () => {
  it("mostra o estado com ícone/cor e alterna ao clicar", () => {
    const [mic, fone] = discordVoiceChildren("d", voice(false, false));
    expect(mic).toMatchObject({ label: "Microfone ligado", icon: "mic", color: AUDIO_CURRENT_COLOR, action: { type: "discord", cmd: "toggleMute" } });
    expect(fone).toMatchObject({ label: "Áudio ligado", icon: "headphones", color: AUDIO_CURRENT_COLOR, action: { type: "discord", cmd: "toggleDeafen" } });
    const [mic2, fone2] = discordVoiceChildren("d", voice(true, true));
    expect(mic2).toMatchObject({ label: "Microfone mutado", icon: "mic-off", color: AUDIO_OTHER_COLOR });
    expect(fone2).toMatchObject({ label: "Ensurdecido", icon: "headphone-off", color: AUDIO_OTHER_COLOR });
  });

  it("carregando, fechado, não conectado e erro viram uma fatia sem ação", () => {
    expect(discordVoiceChildren("d", null)[0].label).toBe("Carregando…");
    for (const [status, label] of [["closed", "Discord fechado"], ["notConnected", "Conectar nas Configurações"], ["error", "Discord sem resposta"]] as const) {
      const out = discordVoiceChildren("d", { status });
      expect(out).toHaveLength(1);
      expect(out[0].label).toBe(label);
      expect(out[0].action).toBeUndefined();
      expect(discordDeviceChildren("d", { status }, "input")[0].label).toBe(label);
    }
  });
});

describe("submenus Discord: entrada e saída", () => {
  it("Padrão primeiro, atual em verde, ação com id e nome", () => {
    const inp = discordDeviceChildren("i", voice(false, false), "input");
    expect(inp.map((c) => c.label)).toEqual(["Padrão", "Microfone", "Headset Micro…"]);
    expect(inp.map((c) => c.color)).toEqual([AUDIO_OTHER_COLOR, AUDIO_OTHER_COLOR, AUDIO_CURRENT_COLOR]);
    expect(inp[2].action).toEqual({ type: "discord", cmd: "setInput", deviceId: "mic-2", deviceName: "Headset Microphone (Arctis)" });
    const out = discordDeviceChildren("o", voice(false, false), "output");
    expect(out[0]).toMatchObject({ label: "Padrão", color: AUDIO_CURRENT_COLOR });
    expect(out[1]).toMatchObject({ icon: "headphones", action: { cmd: "setOutput", deviceId: "out-1" } });
  });

  it("lista vazia", () => {
    const s = voice(false, false);
    s.voice!.output.devices = [];
    expect(discordDeviceChildren("o", s, "output")[0].label).toBe("Sem saídas");
  });

  it("os três tipos são submenus automáticos com nome e explicação", () => {
    for (const k of ["discordVoice", "discordInput", "discordOutput"] as const) {
      expect(DYNAMIC_KINDS).toContain(k);
      expect(DYNAMIC_LABEL[k]).toMatch(/^Discord/);
      expect(DYNAMIC_HINT[k]).toContain("Configurações → Discord");
    }
    const items: MenuItem[] = [{ id: "x", label: "Discord", icon: "headset", dynamic: "discordVoice" }];
    expect(resolveItems(items, { discord: voice(true, false) })[0].children?.[0].label).toBe("Microfone mutado");
  });
});

describe("ação Discord: descrição e validação", () => {
  it("descreve cada comando", () => {
    expect(describeAction({ type: "discord", cmd: "toggleMute" })).toBe("Discord: alternar microfone (mudo)");
    expect(describeAction({ type: "discord", cmd: "deafen" })).toBe("Discord: ensurdecer");
    expect(describeAction({ type: "discord", cmd: "setOutput", deviceId: "x", deviceName: "Fone" })).toBe("Discord: saída Fone");
  });

  it("dispositivo obrigatório em setInput/setOutput; comando desconhecido é inválido", () => {
    expect(validateAction({ type: "discord", cmd: "toggleDeafen" })).toBeNull();
    expect(validateAction({ type: "discord", cmd: "setInput" })).toBe("escolha o dispositivo do Discord.");
    expect(validateAction({ type: "discord", cmd: "setInput", deviceName: "Mic" })).toBeNull();
    expect(validateAction({ type: "discord", cmd: "explodir" as never })).toBe("comando do Discord inválido.");
    expect(validateAction({ type: "discord", cmd: "toString" as never })).toBe("comando do Discord inválido.");
  });
});
