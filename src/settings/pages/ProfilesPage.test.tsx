import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cloneConfig, defaultConfig } from "../../shared/defaults";
import type { Config } from "../../shared/types";

// Página Perfis: lista, executáveis associados, duplicar e excluir (só DOM; backend simulado).

const ipc = vi.hoisted(() => ({
  monitors: vi.fn(async () => [
    { device: "\\.\DISPLAY2", name: "AOC2402", number: 2, left: 0, top: 0, width: 1920, height: 1080, primary: false },
  ]),
  procs: vi.fn(async () => ["chrome.exe", "code.exe"]),
}));
vi.mock("../../shared/ipc", async (orig) => {
  const real = await orig<typeof import("../../shared/ipc")>();
  return { ...real, listMonitors: ipc.monitors, listProcesses: ipc.procs };
});

import { ProfilesPage } from "./ProfilesPage";

let latest: Config;
let selectedNow = 0;

function Harness({ initial, start = 0 }: { initial: Config; start?: number }) {
  const [config, setConfig] = useState(initial);
  const [selected, setSelected] = useState(start);
  latest = config;
  selectedNow = selected;
  const update = (fn: (c: Config) => void) =>
    setConfig((c) => {
      const n = structuredClone(c);
      fn(n);
      return n;
    });
  return <ProfilesPage config={config} selected={selected} onSelect={setSelected} update={update} />;
}

function twoProfiles(): Config {
  const c = cloneConfig(defaultConfig);
  c.profiles = [c.profiles[0], { ...structuredClone(c.profiles[0]), id: "trab", name: "Trabalho", matchExe: [] }];
  return c;
}

async function mount(c: Config, start = 0) {
  render(<Harness initial={c} start={start} />);
  await act(async () => { await Promise.resolve(); await Promise.resolve(); });
}

beforeEach(() => {
  ipc.monitors.mockClear();
  ipc.procs.mockClear();
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("ProfilesPage", () => {
  it("cartões: padrão, sem critério e resumo com o nome do monitor", async () => {
    const c = twoProfiles();
    c.profiles.push({ ...structuredClone(c.profiles[1]), id: "tv", name: "TV", matchExe: ["vlc.exe"], when: { monitors: ["\\.\display2"] } });
    await mount(c);
    expect(screen.getByText("Usado quando nenhum outro combina")).toBeTruthy();
    expect(screen.getByText("sem critério")).toBeTruthy();
    expect(screen.getByText("vlc.exe · 2. AOC2402")).toBeTruthy();
  });

  it("perfil padrão não tem executáveis, 'Quando usar' nem Excluir", async () => {
    await mount(twoProfiles(), 0);
    expect(screen.queryByPlaceholderText("code.exe")).toBeNull();
    expect(screen.queryByText(/Excluir perfil/)).toBeNull();
  });

  it("adiciona executável (completa .exe, minúsculas, sem repetir), por Enter e pelos apps abertos; remove", async () => {
    await mount(twoProfiles(), 1);
    const input = screen.getByPlaceholderText("code.exe");
    fireEvent.change(input, { target: { value: "  Code " } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(latest.profiles[1].matchExe).toEqual(["code.exe"]);
    expect((input as HTMLInputElement).value).toBe("");
    fireEvent.change(input, { target: { value: "code.exe" } });
    fireEvent.click(screen.getByText("Adicionar"));
    expect(latest.profiles[1].matchExe).toEqual(["code.exe"]);
    fireEvent.click(screen.getByText("Adicionar")); // vazio: nada muda
    expect(latest.profiles[1].matchExe).toEqual(["code.exe"]);

    await act(async () => { fireEvent.click(screen.getByText(/Apps abertos/)); await Promise.resolve(); });
    fireEvent.click(screen.getByText("+ chrome.exe"));
    expect(latest.profiles[1].matchExe).toEqual(["code.exe", "chrome.exe"]);

    fireEvent.click(screen.getByLabelText("Remover code.exe"));
    expect(latest.profiles[1].matchExe).toEqual(["chrome.exe"]);
  });

  it("duplicar cria cópia sem executáveis nem 'Quando usar' e seleciona a cópia", async () => {
    const c = twoProfiles();
    c.profiles[1].matchExe = ["code.exe"];
    c.profiles[1].when = { days: [1, 2] };
    await mount(c, 1);
    fireEvent.click(screen.getByText("Duplicar"));
    expect(latest.profiles).toHaveLength(3);
    expect(latest.profiles[2]).toMatchObject({ name: "Trabalho (cópia)", matchExe: [] });
    expect(latest.profiles[2].when).toBeUndefined();
    expect(latest.profiles[2].id).not.toBe("trab");
    expect(latest.profiles[2].items).toEqual(c.profiles[1].items);
    expect(selectedNow).toBe(2);
  });

  it("excluir pede confirmação; cancelar não apaga; confirmar apaga e volta ao padrão", async () => {
    await mount(twoProfiles(), 1);
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
    fireEvent.click(screen.getByText(/Excluir perfil/));
    expect(confirm).toHaveBeenCalledWith('Excluir o perfil "Trabalho"?');
    expect(latest.profiles).toHaveLength(2);
    confirm.mockReturnValue(true);
    fireEvent.click(screen.getByText(/Excluir perfil/));
    expect(latest.profiles.map((p) => p.id)).toEqual([defaultConfig.profiles[0].id]);
    expect(selectedNow).toBe(0);
  });

  it("renomear e monitores que falham ao listar não quebram a página", async () => {
    ipc.monitors.mockRejectedValueOnce(new Error("sem monitores"));
    await mount(twoProfiles(), 1);
    fireEvent.change(screen.getByDisplayValue("Trabalho"), { target: { value: "Jogos" } });
    expect(latest.profiles[1].name).toBe("Jogos");
    expect(screen.getByText("Perfil: Jogos")).toBeTruthy();
  });
});
