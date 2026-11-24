import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { defaultConfig } from "../shared/defaults";
import type { DiscordVoiceState, ObsState } from "../shared/ipc";
import type { MenuItem } from "../shared/types";
import { AUDIO_CURRENT_COLOR, DISCORD_OFF_COLOR, badgeFor, badgeKindOf, discordVoiceChildren, obsSceneChildren, resolveItems, vpnChildren } from "./dynamic";
import { RadialCanvas } from "./RadialCanvas";

afterEach(cleanup);

const voice = (mute: boolean, deaf: boolean): DiscordVoiceState => ({
  status: "ok",
  voice: { mute, deaf, input: { current: "default", devices: [] }, output: { current: "default", devices: [] } } as never,
});
const obs = (recording: boolean, streaming: boolean): ObsState => ({ status: "ok", scenes: ["A", "B"], current: "B", recording, streaming, inputs: [] });

describe("estado nos submenus automáticos (v0.39.0)", () => {
  it("o item em uso fica marcado 'on'; os outros, sem estado", () => {
    const kids = obsSceneChildren("o", obs(false, false));
    expect(kids.map((k) => k.state)).toEqual([undefined, "on"]);
    expect(kids[1].color).toBe(AUDIO_CURRENT_COLOR);
    const vpns = vpnChildren("v", [{ name: "Casa", connected: true }, { name: "Trabalho", connected: false }] as never);
    expect(vpns.map((k) => k.state)).toEqual(["on", undefined]);
  });

  it("Discord: ligado verde 'on', mutado vermelho 'off' (os dois tingidos)", () => {
    const [mic, deaf] = discordVoiceChildren("d", voice(true, false));
    expect(mic).toMatchObject({ state: "off", color: DISCORD_OFF_COLOR });
    expect(deaf).toMatchObject({ state: "on", color: AUDIO_CURRENT_COLOR });
  });

  it("sub-anel: fatia com estado ganha o véu e a classe; sem estado, não", () => {
    const parent: MenuItem = { id: "p", label: "OBS", icon: "video", children: obsSceneChildren("p", obs(false, false)) };
    const { container } = render(
      <RadialCanvas items={[parent, ...defaultConfig.profiles[0].items.slice(0, 3)]} activeMain={0} activeSub={null} hubHovered={false} stats={null} appearance={defaultConfig.appearance} />,
    );
    const subs = container.querySelectorAll(".sub-slice");
    expect(subs[0].classList.contains("has-state")).toBe(false);
    expect(subs[0].querySelector(".slice-tint")).toBeNull();
    expect(subs[1].classList.contains("is-on")).toBe(true);
    expect(subs[1].querySelector(".slice-tint")).not.toBeNull();
  });
});

describe("selo de estado em fatias comuns (v0.39.0)", () => {
  const mic: MenuItem = { id: "m", label: "Mic", icon: "mic", action: { type: "discord", cmd: "toggleMute" } };
  const rec: MenuItem = { id: "r", label: "Gravar", icon: "video", action: { type: "obs", cmd: "toggleRecord" } };
  const plain: MenuItem = { id: "x", label: "Nada", icon: "star", action: { type: "launch", path: "a.exe" } };

  it("quais ações pedem leitura", () => {
    expect(badgeKindOf(mic.action)).toBe("discordVoice");
    expect(badgeKindOf({ type: "discord", cmd: "undeafen" })).toBe("discordVoice");
    expect(badgeKindOf({ type: "discord", cmd: "setInput" })).toBeUndefined();
    expect(badgeKindOf(rec.action)).toBe("obsScenes");
    expect(badgeKindOf({ type: "obs", cmd: "setScene", scene: "A" })).toBeUndefined();
    expect(badgeKindOf(plain.action)).toBeUndefined();
  });

  it("Discord verde/vermelho; OBS só quando grava/transmite; sem leitura = sem selo", () => {
    expect(badgeFor(mic.action, { discord: voice(false, false) })).toBe("on");
    expect(badgeFor(mic.action, { discord: voice(true, false) })).toBe("off");
    expect(badgeFor({ type: "discord", cmd: "toggleDeafen" }, { discord: voice(true, true) })).toBe("off");
    expect(badgeFor(mic.action, { discord: { status: "closed" } })).toBeUndefined();
    expect(badgeFor(mic.action, {})).toBeUndefined();
    expect(badgeFor(rec.action, { obs: obs(true, false) })).toBe("live");
    expect(badgeFor(rec.action, { obs: obs(false, true) })).toBeUndefined();
    expect(badgeFor({ type: "obs", cmd: "startStream" }, { obs: obs(false, true) })).toBe("live");
    expect(badgeFor(rec.action, { obs: { ...obs(true, false), status: "closed" } })).toBeUndefined();
  });

  it("resolveItems põe o selo na fatia e nos filhos; sem selos devolve os mesmos objetos", () => {
    const items = [mic, { id: "g", label: "Grupo", icon: "star", children: [rec, plain] }, plain];
    const out = resolveItems(items, { discord: voice(true, false), obs: obs(true, false) });
    expect(out[0].badge).toBe("off");
    expect(out[1].children!.map((c) => c.badge)).toEqual(["live", undefined]);
    expect(out[1].children![1]).toBe(plain);
    expect(out[2]).toBe(plain);
    const quiet = resolveItems(items, {});
    expect(quiet[0]).toBe(mic);
    expect(quiet[1]).toBe(items[1]);
    const none = [plain];
    expect(resolveItems(none, {})).toBe(none);
  });

  it("o selo aparece no anel principal", () => {
    const items = resolveItems([mic, plain, rec], { discord: voice(false, false), obs: obs(true, false) });
    const { container } = render(
      <RadialCanvas items={items} activeMain={null} activeSub={null} hubHovered={false} stats={null} appearance={defaultConfig.appearance} />,
    );
    expect(container.querySelectorAll('[data-testid="slice-badge-on"]')).toHaveLength(1);
    expect(container.querySelectorAll('[data-testid="slice-badge-live"]')).toHaveLength(1);
    expect(container.querySelectorAll(".slice-badge")).toHaveLength(2);
  });
});
