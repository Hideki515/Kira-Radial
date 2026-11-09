import { describe, expect, it } from "vitest";
import { cloneConfig, defaultConfig } from "../shared/defaults";
import type { MenuItem } from "../shared/types";
import { validateConfig } from "../shared/validate";
import { AUDIO_CURRENT_COLOR, DYNAMIC_HINT, DYNAMIC_LABEL, audioIcon, audioLabels, brightnessChildren, powerChildren, radioChildren, recentChildren, fileIcon, clipboardChildren, resolveItems, windowChildren, windowIcon, windowLabel } from "./dynamic";
import { DYNAMIC_KINDS } from "../shared/types";

const devices = [
  { id: "nv", name: "24G2W1G3- (NVIDIA High Definition Audio)", isDefault: true },
  { id: "rt", name: "Speakers (Realtek(R) Audio)", isDefault: false },
  { id: "g4", name: "Headset Earphone (G435 Wireless Gaming Headset)", isDefault: false },
];

const audioSlice: MenuItem = { id: "audio", label: "Áudio", icon: "volume-2", dynamic: "audioOutputs" };

describe("submenu dinâmico de áudio", () => {
  it("gera um subitem por saída, com ação set e a atual em destaque", () => {
    const [it] = resolveItems([audioSlice], { audio: devices });
    expect(it.children!.map((c) => c.label)).toEqual(["24G2W1G3", "Speakers", "Headset Earph…"]);
    expect(it.children!.map((c) => c.icon)).toEqual(["monitor", "speaker", "headphones"]);
    expect(it.children![0].color).toBe(AUDIO_CURRENT_COLOR);
    expect(it.children![1].action).toEqual({
      type: "audioOutput", mode: "set", deviceId: "rt", deviceName: "Speakers (Realtek(R) Audio)",
    });
  });

  it("estados de carregando e sem dispositivos não têm ação", () => {
    for (const [list, label] of [[null, "Carregando…"], [[], "Sem saídas"]] as const) {
      const child = resolveItems([audioSlice], { audio: list as never })[0].children![0];
      expect(child.label).toBe(label);
      expect(child.action).toBeUndefined();
    }
  });

  it("limita a 8 subitens e não mexe em itens normais", () => {
    const many = Array.from({ length: 12 }, (_, i) => ({ id: `d${i}`, name: `Dev ${i}`, isDefault: false }));
    const normal: MenuItem = { id: "x", label: "X", icon: "code", action: { type: "url", url: "https://a.b" } };
    const out = resolveItems([normal, audioSlice], { audio: many });
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
    const kids = resolveItems([{ id: "w", label: "Janelas", icon: "app-window", dynamic: "windows" }], { windows: many })[0].children!;
    expect(kids).toHaveLength(8);
    expect(kids[0]).toMatchObject({ iconSrc: "data:x", action: { type: "focusWindow", hwnd: 1 } });
    expect(kids[1].iconSrc).toBeUndefined();
  });
});

describe("Planos de energia", () => {
  const plans = [
    { guid: "381b4222-f694-41f0-9685-ff5bb260df2e", name: "Equilibrado", active: true },
    { guid: "8c5e7fda-e8bf-4a96-9a85-a6e23a8c635c", name: "Alto desempenho", active: false },
    { guid: "a1841308-3541-4fab-bc81-f71556f20b4a", name: "Economia de energia", active: false },
  ];
  it("ativo em destaque, ícone por tipo e ação powerPlan", () => {
    const kids = resolveItems([{ id: "p", label: "Energia", icon: "zap", dynamic: "powerPlans" }], { power: plans })[0].children!;
    expect(kids.map((k) => k.icon)).toEqual(["zap", "gauge", "leaf"]);
    expect(kids[0].color).toBe(AUDIO_CURRENT_COLOR);
    expect(kids[1].action).toEqual({ type: "powerPlan", guid: plans[1].guid, name: "Alto desempenho" });
  });
  it("carregando / vazio sem ação", () => {
    expect(powerChildren("p", null)[0].action).toBeUndefined();
    expect(powerChildren("p", [])[0].label).toBe("Sem planos");
  });
  it("todo tipo automático tem nome e explicação", () => {
    for (const k of DYNAMIC_KINDS) {
      expect(DYNAMIC_LABEL[k]).toBeTruthy();
      expect(DYNAMIC_HINT[k]).toBeTruthy();
    }
  });
});

describe("Brilho", () => {
  it("5 níveis para todas as telas, o mais próximo da média em destaque", () => {
    const kids = brightnessChildren("b", [{ id: "lcd", name: "Tela", level: 70 }, { id: "ddc:0", name: "Mon", level: 80 }]);
    expect(kids.map((k) => k.label)).toEqual(["10%", "25%", "50%", "75%", "100%"]);
    expect(kids.find((k) => k.color === AUDIO_CURRENT_COLOR)!.label).toBe("75%");
    expect(kids[0].icon).toBe("sun-dim");
    expect(kids[4].action).toEqual({ type: "brightness", mode: "set", value: 100, target: "all" });
  });
  it("sem tela compatível mostra 'Sem suporte' sem ação", () => {
    expect(brightnessChildren("b", [])[0]).toMatchObject({ label: "Sem suporte" });
    expect(brightnessChildren("b", [])[0].action).toBeUndefined();
    expect(brightnessChildren("b", null)[0].label).toBe("Carregando…");
  });
});

describe("Wi-Fi e Bluetooth", () => {
  it("estado no rótulo/ícone/cor e ação de alternar", () => {
    const kids = radioChildren("r", [{ kind: "wifi", name: "Wi-Fi", on: true }, { kind: "bluetooth", name: "BT", on: false }]);
    expect(kids.map((k) => k.label)).toEqual(["Wi-Fi ligado", "Bluetooth desligado"]);
    expect(kids.map((k) => k.icon)).toEqual(["wifi", "bluetooth-off"]);
    expect(kids[0].color).toBe(AUDIO_CURRENT_COLOR);
    expect(kids[1].action).toEqual({ type: "radio", kind: "bluetooth", mode: "toggle" });
    expect(radioChildren("r", [])[0].action).toBeUndefined();
  });
});

describe("Arquivos recentes", () => {
  it("abre o arquivo com a ação launch e ícone pelo tipo", () => {
    const kids = recentChildren("f", [
      { path: "C:/a/Planilha de custos 2026.xlsx", name: "Planilha de custos 2026.xlsx", ext: "xlsx" },
      { path: "C:/a/foto.png", name: "foto.png", ext: "png" },
    ]);
    expect(kids[0].action).toEqual({ type: "launch", path: "C:/a/Planilha de custos 2026.xlsx" });
    expect(kids[0].label.length).toBeLessThanOrEqual(14);
    expect(kids.map((k) => k.icon)).toEqual(["file-spreadsheet", "file-image"]);
    expect(fileIcon("rs")).toBe("file-code");
    expect(fileIcon("pdf")).toBe("file-text");
    expect(fileIcon("xyz")).toBe("file");
    expect(recentChildren("f", [])[0].label).toBe("Nada recente");
  });
});

describe("Área de transferência", () => {
  it("cada texto vira 'colar' pelo índice; URL ganha ícone de globo", () => {
    const kids = clipboardChildren("c", ["um texto bem comprido para caber", "https://a.b"]);
    expect(kids[0].action).toEqual({ type: "paste", index: 0, preview: "um texto bem comprido para caber" });
    expect(kids[0].label.length).toBeLessThanOrEqual(14);
    expect(kids[1].icon).toBe("globe");
    expect(clipboardChildren("c", [])[0]).toMatchObject({ label: "Vazio" });
    expect(clipboardChildren("c", [])[0].action).toBeUndefined();
  });
});
