import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { PinImage, ShotInfo } from "../shared/ipc";

const SHOT: ShotInfo = { id: 7, width: 1920, height: 1080, thumb: "data:image/png;base64,AAAA", path: null, source: "clipboard", seconds: 6, corner: "bottomRight" };

const ipc = vi.hoisted(() => ({
  handlers: new Map<string, (p: unknown) => void>(),
  shotCurrent: vi.fn(async (): Promise<ShotInfo | null> => null),
  shotCopy: vi.fn(async () => {}),
  shotSaveAs: vi.fn(async (): Promise<string | null> => "C:/Prints/print.png"),
  shotOpenFolder: vi.fn(async () => {}),
  shotEdit: vi.fn(async () => {}),
  shotPin: vi.fn(async () => {}),
  shotDismiss: vi.fn(async () => {}),
  shotPinImage: vi.fn(async (): Promise<PinImage | null> => ({ id: 7, width: 800, height: 600, src: "data:image/png;base64,BBBB" })),
  shotUnpin: vi.fn(async () => {}),
  startWindowDrag: vi.fn(async () => {}),
}));
vi.mock("../shared/ipc", async (orig) => ({
  ...(await orig<typeof import("../shared/ipc")>()),
  ...ipc,
  onEvent: async (name: string, cb: (p: unknown) => void) => {
    ipc.handlers.set(name, cb);
    return () => ipc.handlers.delete(name);
  },
}));

import { ShotPin, ShotPreview } from "./ShotApp";

const flush = () => act(async () => { for (let i = 0; i < 4; i++) await Promise.resolve(); });

beforeEach(() => {
  ipc.handlers.clear();
  ipc.shotCurrent.mockResolvedValue(SHOT);
});
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  vi.useRealTimers();
});

describe("preview do print", () => {
  it("mostra miniatura, tamanho e os botões; Abrir pasta só quando há arquivo", async () => {
    render(<ShotPreview />);
    await flush();
    expect(screen.getByText("Print · 1920×1080")).toBeTruthy();
    expect((screen.getByRole("img") as HTMLImageElement).src).toContain("data:image/png");
    const labels = screen.getAllByRole("button").map((b) => b.getAttribute("aria-label"));
    expect(labels).toEqual(["Fechar", "Copiar", "Salvar como…", "Editar", "Fixar na tela"]);
    await act(async () => ipc.handlers.get("shot:new")!({ ...SHOT, id: 8, path: "C:\\Prints\\cap.png", source: "file" }));
    expect(screen.getByRole("button", { name: "Abrir pasta" })).toBeTruthy();
    expect(screen.getByRole("status").textContent).toBe("cap.png");
  });

  it("cada botão chama o comando do print atual e mostra o resultado", async () => {
    render(<ShotPreview />);
    await flush();
    fireEvent.click(screen.getByRole("button", { name: "Copiar" }));
    await flush();
    expect(ipc.shotCopy).toHaveBeenCalledWith(7);
    expect(screen.getByRole("status").textContent).toBe("Copiado!");
    fireEvent.click(screen.getByRole("button", { name: "Salvar como…" }));
    await flush();
    expect(screen.getByRole("status").textContent).toBe("Salvo em C:/Prints/print.png");
    fireEvent.click(screen.getByRole("button", { name: "Editar" }));
    fireEvent.click(screen.getByRole("button", { name: "Fixar na tela" }));
    await flush();
    expect(ipc.shotEdit).toHaveBeenCalledWith(7);
    expect(ipc.shotPin).toHaveBeenCalledWith(7);
    ipc.shotEdit.mockRejectedValueOnce("não foi possível abrir o Paint");
    fireEvent.click(screen.getByRole("button", { name: "Editar" }));
    await flush();
    expect(screen.getByRole("status").className).toContain("is-error");
  });

  it("some sozinho depois do tempo; com o mouse em cima não some; um print novo substitui", async () => {
    vi.useFakeTimers();
    render(<ShotPreview />);
    await act(async () => { await vi.advanceTimersByTimeAsync(0); });
    const card = screen.getByTestId("shot-preview");
    fireEvent.mouseEnter(card);
    await act(async () => { await vi.advanceTimersByTimeAsync(10_000); });
    expect(ipc.shotDismiss).not.toHaveBeenCalled();
    fireEvent.mouseLeave(card);
    await act(async () => { await vi.advanceTimersByTimeAsync(5_900); });
    expect(ipc.shotDismiss).not.toHaveBeenCalled();
    // Print novo: substitui e o prazo recomeça.
    await act(async () => ipc.handlers.get("shot:new")!({ ...SHOT, id: 9, width: 800, height: 600 }));
    expect(screen.getByText("Print · 800×600")).toBeTruthy();
    await act(async () => { await vi.advanceTimersByTimeAsync(5_900); });
    expect(ipc.shotDismiss).not.toHaveBeenCalled();
    await act(async () => { await vi.advanceTimersByTimeAsync(200); });
    expect(ipc.shotDismiss).toHaveBeenCalledTimes(1);
  });

  it("fechado/fixado com o mouse em cima: o próximo print some sozinho mesmo assim", async () => {
    vi.useFakeTimers();
    render(<ShotPreview />);
    await act(async () => { await vi.advanceTimersByTimeAsync(0); });
    fireEvent.mouseEnter(screen.getByTestId("shot-preview"));
    fireEvent.click(screen.getByRole("button", { name: "Fixar na tela" }));
    // A janela some sem mouseleave; chega um print novo.
    await act(async () => ipc.handlers.get("shot:new")!({ ...SHOT, id: 10 }));
    ipc.shotDismiss.mockClear();
    await act(async () => { await vi.advanceTimersByTimeAsync(6_100); });
    expect(ipc.shotDismiss).toHaveBeenCalledTimes(1);
    expect(document.querySelector(".shot-timer")).not.toBeNull();
  });

  it("sem print não desenha nada; × fecha", async () => {
    ipc.shotCurrent.mockResolvedValueOnce(null);
    const { container } = render(<ShotPreview />);
    await flush();
    expect(container.innerHTML).toBe("");
    await act(async () => ipc.handlers.get("shot:new")!(SHOT));
    fireEvent.click(screen.getByRole("button", { name: "Fechar" }));
    expect(ipc.shotDismiss).toHaveBeenCalled();
  });
});

describe("print fixado", () => {
  it("mostra a imagem inteira; Esc e × fecham; arrastar move a janela", async () => {
    render(<ShotPin />);
    await flush();
    expect((screen.getByRole("img") as HTMLImageElement).alt).toBe("Print fixado de 800×600");
    fireEvent.mouseDown(screen.getByTestId("shot-pin"), { button: 0 });
    expect(ipc.startWindowDrag).toHaveBeenCalled();
    fireEvent.keyDown(window, { key: "Escape" });
    fireEvent.click(screen.getByRole("button", { name: "Fechar" }));
    expect(ipc.shotUnpin).toHaveBeenCalledTimes(2);
  });
});
