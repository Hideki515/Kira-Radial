import { describe, expect, it } from "vitest";
import { cloneConfig, defaultConfig } from "../shared/defaults";
import type { MenuItem } from "../shared/types";
import { validateConfig } from "../shared/validate";
import { AUDIO_CURRENT_COLOR, audioIcon, audioLabels, resolveItems, windowChildren, windowIcon, windowLabel } from "./dynamic";

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

describe("Janelas abertas", () => {
  it("rótulo usa a parte principal do título", () => {
    expect(windowLabel("Notas.txt - Bloco de Notas", "notepad.exe")).toBe("Notas.txt");
    expect(windowLabel("YouTube — Google Chrome", "chrome.exe")).toBe("YouTube");
    expect(windowLabel("Um título bem comprido demais para caber", null).length).toBeLessThanOrEqual(14);
    expect(windowLabel("", "notepad.exe")).toBe("notepad");
  });

  it("ícone de reserva por app e estados de carregamento/vazio", () => {
    expect(windowIcon("msedge.exe")).toBe("globe");
    expect(windowIcon("explorer.exe")).toBe("folder-open");
    expect(windowIcon(null)).toBe("app-window");
    expect(windowChildren("w", null)[0].label).toBe("Carregando…");
    expect(windowChildren("w", [])[0]).toMatchObject({ label: "Nenhuma janela" });
    expect(windowChildren("w", [])[0].action).toBeUndefined();
  });

  it("gera ação focusWindow com a imagem do app e respeita o limite", () => {
    const many = Array.from({ length: 12 }, (_, i) => ({ hwnd: i + 1, title: `J${i}`, exe: "a.exe", icon: i ? null : "data:x" }));
    const kids = resolveItems([{ id: "w", label: "Janelas", icon: "app-window", dynamic: "windows" }], null, many)[0].children!;
    expect(kids).toHaveLength(8);
    expect(kids[0]).toMatchObject({ iconSrc: "data:x", action: { type: "focusWindow", hwnd: 1 } });
    expect(kids[1].iconSrc).toBeUndefined();
  });
});
