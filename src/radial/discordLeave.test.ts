import { describe, expect, it } from "vitest";
import { describeAction } from "../shared/describe";
import type { DiscordVoiceState } from "../shared/ipc";
import { setLang } from "../shared/i18n";
import { validateAction } from "../shared/validate";
import { DISCORD_OFF_COLOR, discordVoiceChildren } from "./dynamic";

const state = (channel: string | null | undefined): DiscordVoiceState => ({
  status: "ok",
  voice: { mute: false, deaf: false, input: { current: "default", devices: [] }, output: { current: "default", devices: [] }, channel },
});

describe("Discord: sair do canal de voz (v0.40.0)", () => {
  it("em canal: terceira fatia 'Sair' com o nome do canal; fora: só microfone e fone", () => {
    const kids = discordVoiceChildren("d", state("Geral"));
    expect(kids).toHaveLength(3);
    expect(kids[2]).toMatchObject({ id: "d:leave", label: "Sair: Geral", icon: "phone-off", color: DISCORD_OFF_COLOR, action: { type: "discord", cmd: "leaveVoice" } });
    expect(kids[2].state).toBeUndefined();
    expect(discordVoiceChildren("d", state(null))).toHaveLength(2);
    expect(discordVoiceChildren("d", state(undefined))).toHaveLength(2);
    expect(discordVoiceChildren("d", state("Sala de reunião do time"))[2].label).toBe("Sair: Sala de…");
  });

  it("ação comum: válida e descrita nos dois idiomas", () => {
    expect(validateAction({ type: "discord", cmd: "leaveVoice" })).toBeNull();
    expect(describeAction({ type: "discord", cmd: "leaveVoice" })).toBe("Discord: sair do canal de voz");
    setLang("en");
    expect(discordVoiceChildren("d", state("Lobby"))[2].label).toBe("Leave: Lobby");
    expect(describeAction({ type: "discord", cmd: "leaveVoice" })).toBe("Discord: leave voice channel");
    setLang("pt");
  });
});
