import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cloneConfig, defaultConfig } from "../../shared/defaults";
import type { Config } from "../../shared/types";

const ipc = vi.hoisted(() => ({
  pickImage: vi.fn(async (): Promise<string | null> => "C:\\gifs\\jarvis.webp"),
  readOrbImage: vi.fn(async (p: string) => `data:image/webp;base64,${p.length}`),
  orbResetPosition: vi.fn(async () => {}),
}));
vi.mock("../../shared/ipc", async (orig) => ({ ...(await orig<typeof import("../../shared/ipc")>()), ...ipc }));

import { IconPage } from "./IconPage";

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

let last: Config;
function Harness({ mode = "orb" as Config["launcher"]["mode"], image = null as string | null, goToLauncher = () => {} }) {
  const [c, setC] = useState(() => {
    const x = cloneConfig(defaultConfig);
    x.launcher.mode = mode;
    x.launcher.orb.image = image;
    return x;
  });
  last = c;
  const update = (fn: (c: Config) => void) =>
    setC((prev) => {
      const next = cloneConfig(prev);
      fn(next);
      last = next;
      return next;
    });
  return <IconPage config={c} update={update} goToLauncher={goToLauncher} />;
}
const flush = () => act(async () => { await Promise.resolve(); await Promise.resolve(); });

describe("Configurações › Ícone", () => {
  it("mostra a pré-visualização animada e ajusta tamanho/opacidade", () => {
    render(<Harness />);
    expect(screen.getByTestId("orb-preview").querySelector('[data-testid="orb"]')).toBeTruthy();
    expect(screen.queryByTestId("orb-off")).toBeNull();
    fireEvent.change(screen.getByLabelText(/Tamanho: 96px/), { target: { value: "120" } });
    expect(last.launcher.orb.size).toBe(120);
    fireEvent.change(screen.getByLabelText(/Opacidade em repouso/), { target: { value: "0.6" } });
    expect(last.launcher.orb.opacityIdle).toBe(0.6);
  });

  it("Imagem própria abre o seletor e carrega a imagem na pré-visualização; voltar ao orbe limpa", async () => {
    render(<Harness />);
    fireEvent.click(screen.getByRole("radio", { name: "Imagem própria" }));
    await flush();
    expect(ipc.pickImage).toHaveBeenCalledTimes(1);
    expect(last.launcher.orb.image).toBe("C:\\gifs\\jarvis.webp");
    await flush();
    expect(screen.getByTitle(/\\gifs\\jarvis\.webp$/).textContent).toContain("jarvis.webp");
    expect(screen.getByTestId("orb-preview").querySelector("img")!.getAttribute("src")).toContain("data:image/webp");
    fireEvent.click(screen.getByRole("radio", { name: "Orbe holográfico" }));
    expect(last.launcher.orb.image).toBeNull();
  });

  it("cancelar o seletor mantém o orbe embutido", async () => {
    ipc.pickImage.mockResolvedValueOnce(null);
    render(<Harness />);
    fireEvent.click(screen.getByRole("radio", { name: "Imagem própria" }));
    await flush();
    expect(last.launcher.orb.image).toBeNull();
    expect(screen.getByRole("radio", { name: "Orbe holográfico" }).getAttribute("aria-checked")).toBe("true");
  });

  it("imagem que não carrega avisa e usa o orbe embutido", async () => {
    ipc.readOrbImage.mockRejectedValueOnce("imagem muito grande");
    render(<Harness image="C:\\x\\enorme.gif" />);
    await flush();
    expect(screen.getByRole("alert").textContent).toContain("imagem muito grande");
    expect(screen.getByTestId("orb-preview").querySelector("img")).toBeNull();
  });

  it("modo só atalho avisa que o ícone está desligado e leva à página Atalho", () => {
    const go = vi.fn();
    render(<Harness mode="hotkey" goToLauncher={go} />);
    expect(screen.getByTestId("orb-off")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /Ativar em Atalho/ }));
    expect(go).toHaveBeenCalled();
  });

  it("esconder em tela cheia vem ligado e pode ser desligado", () => {
    render(<Harness />);
    const box = screen.getByLabelText(/Esconder em tela cheia/) as HTMLInputElement;
    expect(box.checked).toBe(true);
    fireEvent.click(box);
    expect(last.launcher.orb.hideOnFullscreen).toBe(false);
  });

  it("voltar para o canto chama o backend", async () => {
    render(<Harness />);
    fireEvent.click(screen.getByRole("button", { name: /Voltar o ícone para o canto/ }));
    await flush();
    expect(ipc.orbResetPosition).toHaveBeenCalledTimes(1);
    expect(screen.getByText(/movido para o canto/)).toBeTruthy();
  });
});
