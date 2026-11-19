import { afterEach, describe, expect, it, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { en } from "./en";
import { pt } from "./pt";
import { applyLangSetting, getLang, resetSystemLangsForTests, resolveLang, setLang, t, useT } from "./index";

const sys = vi.hoisted(() => ({ langs: ["en-US", "pt-BR"] as string[] | Error }));
vi.mock("../ipc", async (orig) => ({
  ...(await orig<typeof import("../ipc")>()),
  systemLanguages: async () => {
    if (sys.langs instanceof Error) throw sys.langs;
    return sys.langs;
  },
}));
const flush = () => new Promise((r) => setTimeout(r, 0));

afterEach(() => setLang("pt"));

describe("tabelas", () => {
  it("inglês tem exatamente as chaves do português", () => {
    expect(Object.keys(en).sort()).toEqual(Object.keys(pt).sort());
  });

  it("nenhum texto vazio", () => {
    for (const [k, v] of [...Object.entries(pt), ...Object.entries(en)]) expect(v.trim(), k).not.toBe("");
  });

  it("os mesmos {marcadores} nos dois idiomas", () => {
    const vars = (s: string) => (s.match(/\{\w+\}/g) ?? []).sort();
    for (const k of Object.keys(pt) as (keyof typeof pt)[]) expect(vars(en[k]), k).toEqual(vars(pt[k]));
  });
});

describe("resolveLang", () => {
  it("escolha manual vale sempre", () => {
    expect(resolveLang("pt", "en-US")).toBe("pt");
    expect(resolveLang("en", "pt-BR")).toBe("en");
  });

  it("auto segue o sistema: português → pt; qualquer outro → en", () => {
    expect(resolveLang("auto", "pt-BR")).toBe("pt");
    expect(resolveLang(undefined, "pt-PT")).toBe("pt");
    expect(resolveLang("auto", "en-GB")).toBe("en");
    expect(resolveLang("auto", "es-ES")).toBe("en");
    expect(resolveLang("auto", "ptx")).toBe("en");
  });

  it("Windows em inglês com português na lista → português", () => {
    expect(resolveLang("auto", ["en-US", "pt-BR"])).toBe("pt");
    expect(resolveLang("auto", ["en-US", "es-ES"])).toBe("en");
    expect(resolveLang("auto", [])).toBe("en");
  });

  it("sem idioma informado usa navigator.language", () => {
    expect(resolveLang("auto")).toBe("pt"); // o setup dos testes fixa pt-BR
  });
});

describe("t", () => {
  it("traduz e troca marcadores", () => {
    expect(t("shot.title", { w: 800, h: 600 })).toBe("Print · 800×600");
    setLang("en");
    expect(t("shot.title", { w: 800, h: 600 })).toBe("Screenshot · 800×600");
    expect(t("dyn.radio.on", { name: "Wi-Fi" })).toBe("Wi-Fi on");
  });

  it("marcador sem valor fica como está", () => {
    expect(t("menu.failed", { label: "X" })).toBe("Falha em X: {error}");
  });

  it("setLang ajusta o lang do documento", () => {
    setLang("en");
    expect(getLang()).toBe("en");
    expect(document.documentElement.lang).toBe("en");
    setLang("pt");
    expect(document.documentElement.lang).toBe("pt-BR");
  });

  it("useT redesenha quando o idioma muda", () => {
    const { result } = renderHook(() => useT()("common.cancel"));
    expect(result.current).toBe("Cancelar");
    act(() => setLang("en"));
    expect(result.current).toBe("Cancel");
  });
});

describe("applyLangSetting", () => {
  afterEach(() => {
    resetSystemLangsForTests();
    sys.langs = ["en-US", "pt-BR"];
  });

  it("auto consulta a lista do Windows", async () => {
    setLang("en");
    applyLangSetting(undefined);
    await flush();
    expect(getLang()).toBe("pt");
    resetSystemLangsForTests();
    sys.langs = ["en-US"];
    applyLangSetting("auto");
    await flush();
    expect(getLang()).toBe("en");
  });

  it("escolha manual é imediata e ganha de um auto ainda pendente", async () => {
    sys.langs = ["en-US"];
    applyLangSetting("auto");
    applyLangSetting("pt");
    expect(getLang()).toBe("pt");
    await flush();
    expect(getLang()).toBe("pt");
  });

  it("falha ao ler a lista cai no navegador (pt-BR nos testes)", async () => {
    setLang("en");
    sys.langs = new Error("sem tauri");
    applyLangSetting("auto");
    await flush();
    expect(getLang()).toBe("pt");
  });
});
