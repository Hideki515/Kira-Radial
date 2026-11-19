import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cloneConfig, defaultConfig } from "../shared/defaults";
import type { Action, Config, MenuItem, Profile } from "../shared/types";
import { asSlices, buildIndex, isSearchChar, normalize, score, search } from "./search";

const ipc = vi.hoisted(() => ({
  config: null as unknown as Config,
  runAction: vi.fn(async (_a: Action) => {}),
}));
vi.mock("../shared/ipc", async (orig) => ({
  ...(await orig<typeof import("../shared/ipc")>()),
  getConfig: async () => ipc.config,
  runAction: ipc.runAction,
}));

import { RadialApp } from "./RadialApp";

const act1 = (id: string, label: string, action: Action = { type: "openSettings" }): MenuItem => ({ id, label, icon: "code", action });

const profiles: Profile[] = [
  {
    id: "main",
    name: "Padrão",
    items: [
      act1("cfg", "Configurações do Sistema", { type: "system", cmd: "settings" }),
      act1("term", "Terminal", { type: "launch", path: "wt.exe" }),
      { id: "dev", label: "Dev", icon: "code", children: [act1("code", "VS Code", { type: "launch", path: "code" }), act1("git", "GitHub", { type: "url", url: "https://github.com" })] },
      { id: "audio", label: "Áudio", icon: "speaker", dynamic: "audioOutputs" },
    ],
  },
  { id: "game", name: "Jogos", items: [act1("steam", "Steam", { type: "launch", path: "steam.exe" }), act1("cfg2", "Configurar jogo")] },
];

describe("busca (pura)", () => {
  it("normaliza acentos e maiúsculas", () => {
    expect(normalize("  Configurações ÁUDIO ")).toBe("configuracoes audio");
  });

  it("índice: todos os perfis, subitens incluídos; sem submenu automático", () => {
    const ids = buildIndex(profiles).map((e) => e.item.id);
    expect(ids).toEqual(expect.arrayContaining(["cfg", "term", "dev", "code", "git", "steam", "cfg2"]));
    expect(ids).not.toContain("audio");
  });

  it("pontuação: igual > começo > palavra > contém > iniciais > descrição", () => {
    const idx = buildIndex(profiles);
    const e = (id: string) => idx.find((x) => x.item.id === id)!;
    expect(score(e("term"), "terminal")).toBe(120);
    expect(score(e("term"), "TERM")).toBe(100);
    expect(score(e("code"), "code")).toBe(80);
    expect(score(e("cfg"), "sistem")).toBe(80);
    expect(score(e("cfg"), "uracoe")).toBe(60);
    expect(score(e("cfg"), "cs")).toBe(50);
    expect(score(e("git"), "github.com")).toBe(30);
    expect(score(e("term"), "xyz")).toBe(0);
    expect(score(e("term"), "")).toBe(0);
  });

  it("ordena por pontuação e, no empate, o perfil atual primeiro; limite de 8", () => {
    const idx = buildIndex(profiles);
    expect(search(idx, "config", "main").map((i) => i.id)).toEqual(["cfg", "cfg2"]);
    expect(search(idx, "config", "game").map((i) => i.id)).toEqual(["cfg2", "cfg"]);
    const many = buildIndex([{ id: "p", name: "P", items: Array.from({ length: 12 }, (_, i) => act1(`a${i}`, `App ${i}`)) }]);
    expect(search(many, "app", "p")).toHaveLength(8);
  });

  it("resultados viram pelo menos 3 fatias; teclas que entram no texto", () => {
    expect(asSlices([act1("a", "A")]).map((s) => s.id)).toEqual(["a", "__search-empty-1", "__search-empty-2"]);
    expect(isSearchChar({ key: "a", ctrlKey: false, altKey: false, metaKey: false })).toBe(true);
    expect(isSearchChar({ key: "ç", ctrlKey: false, altKey: false, metaKey: false })).toBe(true);
    expect(isSearchChar({ key: "a", ctrlKey: true, altKey: false, metaKey: false })).toBe(false);
    expect(isSearchChar({ key: "Enter", ctrlKey: false, altKey: false, metaKey: false })).toBe(false);
  });
});

describe("busca no menu", () => {
  const flush = () => act(async () => { for (let i = 0; i < 4; i++) await Promise.resolve(); });
  const key = (k: string, code?: string) => fireEvent.keyDown(window, { key: k, code: code ?? (/^\d$/.test(k) ? `Digit${k}` : `Key${k.toUpperCase()}`) });
  const labels = () => [...document.querySelectorAll(".main-slice")].map((s) => s.getAttribute("aria-label"));

  beforeEach(async () => {
    ipc.runAction.mockClear();
    const c = cloneConfig(defaultConfig);
    c.profiles = structuredClone(profiles);
    ipc.config = c;
    render(<RadialApp />);
    await flush();
  });
  afterEach(cleanup);

  it("digitar filtra: resultados viram as fatias, o 1º fica escolhido e Enter executa", async () => {
    for (const k of "stea") key(k);
    expect(labels()[0]).toBe("Steam"); // de outro perfil
    expect(screen.getByTestId("hub-search").textContent).toContain("stea");
    key("Enter");
    await flush();
    expect(ipc.runAction).toHaveBeenCalledWith({ type: "launch", path: "steam.exe" });
  });

  it("Backspace apaga, Esc limpa (e o 2º Esc fecha); sem resultados mostra 'nenhum'", async () => {
    key("z");
    key("z");
    expect(screen.getByTestId("hub-search").textContent).toContain("NENHUM");
    expect(labels()).toEqual(["", "", ""]);
    key("Backspace");
    expect(screen.getByTestId("hub-search").textContent).toContain("z");
    key("Escape");
    expect(screen.queryByTestId("hub-search")).toBeNull();
    expect(labels()).toEqual(["Configurações do Sistema", "Terminal", "Dev", "Áudio"]);
  });

  it("sem busca, 1–9 continuam escolhendo a fatia; depois de começar, números entram no texto", async () => {
    key("2");
    await flush();
    expect(ipc.runAction).toHaveBeenCalledWith({ type: "launch", path: "wt.exe" });
    ipc.runAction.mockClear();
  });

  it("resultado com subitens abre o sub-anel normalmente", async () => {
    for (const k of "dev") key(k);
    expect(labels()[0]).toBe("Dev");
    key("Enter");
    expect(document.querySelectorAll(".sub-slice").length).toBe(2);
  });
});
