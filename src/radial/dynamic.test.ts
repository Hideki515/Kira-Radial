import { describe, expect, it } from "vitest";
import { cloneConfig, defaultConfig } from "../shared/defaults";
import type { MenuItem } from "../shared/types";
import { validateConfig } from "../shared/validate";
import { AUDIO_CURRENT_COLOR, audioIcon, audioLabels, resolveItems } from "./dynamic";

const devices = [
  { id: "nv", name: "24G2W1G3- (NVIDIA High Definition Audio)", isDefault: true },
  { id: "rt", name: "Speakers (Realtek(R) Audio)", isDefault: false },
  { id: "g4", name: "Headset Earphone (G435 Wireless Gaming Headset)", isDefault: false },
];

const audioSlice: MenuItem = { id: "audio", label: "Áudio", icon: "volume-2", dynamic: "audioOutputs" };

describe("submenu dinâmico de áudio", () => {
  it("gera um subitem por saída, com ação set e a atual em destaque", () => {
    const [it] = resolveItems([audioSlice], devices);
    expect(it.children!.map((c) => c.label)).toEqual(["24G2W1G3", "Speakers", "Headset Earph…"]);
    expect(it.children!.map((c) => c.icon)).toEqual(["monitor", "speaker", "headphones"]);
    expect(it.children![0].color).toBe(AUDIO_CURRENT_COLOR);
    expect(it.children![1].action).toEqual({
      type: "audioOutput", mode: "set", deviceId: "rt", deviceName: "Speakers (Realtek(R) Audio)",
    });
  });

  it("estados de carregando e sem dispositivos não têm ação", () => {
    for (const [list, label] of [[null, "Carregando…"], [[], "Sem saídas"]] as const) {
      const child = resolveItems([audioSlice], list as never)[0].children![0];
      expect(child.label).toBe(label);
      expect(child.action).toBeUndefined();
    }
  });

  it("limita a 8 subitens e não mexe em itens normais", () => {
    const many = Array.from({ length: 12 }, (_, i) => ({ id: `d${i}`, name: `Dev ${i}`, isDefault: false }));
    const normal: MenuItem = { id: "x", label: "X", icon: "code", action: { type: "url", url: "https://a.b" } };
    const out = resolveItems([normal, audioSlice], many);
    expect(out[0]).toBe(normal);
    expect(out[1].children).toHaveLength(8);
  });

  it("rótulos repetidos usam o detalhe entre parênteses", () => {
    expect(audioLabels(["Speakers (Realtek Audio)", "Speakers (USB DAC)"])).toEqual(["Realtek Audio", "USB DAC"]);
  });

  it("ícone por nome", () => {
    expect(audioIcon("Fones de ouvido (Bluetooth)")).toBe("headphones");
    expect(audioIcon("LG TV (HDMI)")).toBe("monitor");
    expect(audioIcon("Alto-falantes (Realtek)")).toBe("speaker");
  });

  it("fatia dinâmica é válida sem ação nem subitens", () => {
    const c = cloneConfig(defaultConfig);
    c.profiles[0].items[0] = { ...audioSlice };
    expect(validateConfig(c)).toEqual([]);
  });
});
