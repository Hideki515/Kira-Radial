import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { useState } from "react";
import { afterEach, describe, expect, it } from "vitest";
import { describeAction } from "../shared/ipc";
import type { Action, Config } from "../shared/types";
import { cloneConfig, defaultConfig } from "../shared/defaults";
import { validateAction, validateConfig } from "../shared/validate";
import { ActionEditor } from "./ActionEditor";
import { findBrowser } from "./BrowserFields";
import { GeneralPage } from "./pages/SimplePages";

afterEach(cleanup);

type UrlAction = Extract<Action, { type: "url" }>;

function Harness({ start }: { start: UrlAction }) {
  const [a, setA] = useState<Action>(start);
  last = a as UrlAction;
  return <ActionEditor action={a} onChange={(n) => { last = n as UrlAction; setA(n); }} />;
}
let last: UrlAction;

describe("Abrir site › navegador", () => {
  it("lista os navegadores; escolher grava id e nome; janela anônima; perfil só nos Chromium", async () => {
    render(<Harness start={{ type: "url", url: "https://a.b" }} />);
    const sel = await screen.findByRole("combobox", { name: "Navegador" });
    await waitFor(() => expect(screen.getByRole("option", { name: "Google Chrome" })).toBeTruthy());
    expect(screen.getByRole("option", { name: /Padrão do Windows \(Google Chrome\)/ })).toBeTruthy();
    expect((sel as HTMLSelectElement).value).toBe(""); // navegador geral

    fireEvent.change(sel, { target: { value: "Google Chrome" } });
    expect(last).toEqual({ type: "url", url: "https://a.b", browser: "Google Chrome", browserName: "Google Chrome" });

    const prof = await screen.findByRole("combobox", { name: "Perfil do navegador" });
    fireEvent.change(prof, { target: { value: "Profile 1" } });
    expect(last.profile).toBe("Profile 1");
    fireEvent.click(screen.getByLabelText(/janela anônima/));
    expect(last.private).toBe(true);

    // Firefox: sem perfis; trocar apaga o perfil e mantém a janela anônima.
    fireEvent.change(sel, { target: { value: "Firefox-1" } });
    expect(last).toEqual({ type: "url", url: "https://a.b", browser: "Firefox-1", browserName: "Mozilla Firefox", private: true });
    await waitFor(() => expect(screen.queryByRole("combobox", { name: "Perfil do navegador" })).toBeNull());

    fireEvent.change(sel, { target: { value: "system" } });
    expect(last.browser).toBe("system");
    fireEvent.change(sel, { target: { value: "" } });
    expect(last.browser).toBeUndefined();
    expect("browser" in last).toBe(false);
  });

  it("navegador salvo que não existe mais aparece como 'não encontrado'", async () => {
    render(<Harness start={{ type: "url", url: "https://a.b", browser: "Opera Stable", browserName: "Opera" }} />);
    expect(await screen.findByRole("option", { name: /Opera \(não encontrado/ })).toBeTruthy();
  });

  it("acha pelo nome quando o id mudou", () => {
    const list = [{ id: "Firefox-NEW", name: "Mozilla Firefox", exe: "f.exe", family: "firefox" as const, isDefault: false }];
    expect(findBrowser(list, "Firefox-OLD", "mozilla firefox")?.id).toBe("Firefox-NEW");
    expect(findBrowser(list, "x", "y")).toBeUndefined();
    expect(findBrowser(list, undefined, "Mozilla Firefox")).toBeUndefined();
  });

  it("validação: espaço/aspas só bloqueiam quando vai a um navegador escolhido; perfil seguro", () => {
    expect(validateAction({ type: "url", url: "https://a.b/c d" })).toBeNull();
    expect(validateAction({ type: "url", url: "https://a.b/c d", browser: "Google Chrome" })).toMatch(/espaço/);
    expect(validateAction({ type: "url", url: 'https://a.b/"x', private: true })).toMatch(/aspas/);
    expect(validateAction({ type: "url", url: "https://a.b/c d", browser: "system" })).toBeNull();
    expect(validateAction({ type: "url", url: "https://a.b", browser: "Google Chrome", profile: "Profile 1" })).toBeNull();
    expect(validateAction({ type: "url", url: "https://a.b", browser: "Google Chrome", profile: '" --x' })).toMatch(/perfil/);
    expect(validateAction({ type: "url", url: "javascript:x", browser: "Google Chrome" })).toMatch(/http/);
    const long = `https://a.b/${"x".repeat(2100)}`;
    expect(validateAction({ type: "url", url: long, browser: "Google Chrome" })).toMatch(/2048/);
    expect(validateAction({ type: "url", url: long })).toBeNull();
  });

  it("descrição mostra o navegador e a janela anônima", () => {
    expect(describeAction({ type: "url", url: "https://a.b" })).toBe("Abrir https://a.b");
    expect(describeAction({ type: "url", url: "https://a.b", browser: "Firefox-1", browserName: "Firefox", private: true })).toBe("Abrir https://a.b no Firefox (anônima)");
    expect(describeAction({ type: "url", url: "https://a.b", browser: "system" })).toBe("Abrir https://a.b");
  });
});

describe("Comportamento › navegador geral", () => {
  let cfg: Config;
  function Page() {
    const [c, setC] = useState(() => cloneConfig(defaultConfig));
    cfg = c;
    const update = (fn: (c: Config) => void) => setC((p) => { const n = cloneConfig(p); fn(n); cfg = n; return n; });
    return <GeneralPage config={c} update={update} />;
  }

  it("escolher grava em behavior; voltar ao padrão remove as chaves", async () => {
    render(<Page />);
    const sel = await screen.findByRole("combobox", { name: "Navegador para sites" });
    await waitFor(() => expect(screen.getByRole("option", { name: "Microsoft Edge" })).toBeTruthy());
    expect(screen.queryByRole("option", { name: /Navegador geral/ })).toBeNull();
    fireEvent.change(sel, { target: { value: "Microsoft Edge" } });
    expect(cfg.behavior).toMatchObject({ browser: "Microsoft Edge", browserName: "Microsoft Edge" });
    expect(validateConfig(cfg)).toEqual([]);
    fireEvent.change(sel, { target: { value: "" } });
    expect("browser" in cfg.behavior || "browserName" in cfg.behavior).toBe(false);
  });
});
