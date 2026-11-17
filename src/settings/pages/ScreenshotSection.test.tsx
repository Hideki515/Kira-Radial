import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cloneConfig, defaultConfig } from "../../shared/defaults";
import { comboIsCapture } from "../../shared/keys";
import { screenshotOf, type Action, type Config } from "../../shared/types";

const ipc = vi.hoisted(() => ({ pickPath: vi.fn(async (): Promise<string | null> => "C:\\Lightshot") }));
vi.mock("../../shared/ipc", async (orig) => ({ ...(await orig<typeof import("../../shared/ipc")>()), ...ipc }));

import { ScreenshotSection } from "./ScreenshotSection";
import { ActionEditor } from "../ActionEditor";

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

function Harness({ onConfig }: { onConfig: (c: Config) => void }) {
  const [c, setC] = useState(cloneConfig(defaultConfig));
  return (
    <ScreenshotSection
      config={c}
      update={(fn) =>
        setC((prev) => {
          const next = cloneConfig(prev);
          fn(next);
          onConfig(next);
          return next;
        })
      }
    />
  );
}

describe("config do preview de capturas", () => {
  it("config antiga = ligado, 6 s, canto inferior direito, 60 s de espera", () => {
    expect(screenshotOf({})).toEqual({ preview: true, seconds: 6, corner: "bottomRight", folders: [], armSeconds: 60 });
  });

  it("PrtSc e Win+Shift+S são reconhecidos como print", () => {
    for (const c of ["PrtSc", "PrintScreen", "Alt+PrtSc", "Win+PrtSc", "Win+Shift+S", "shift+win+s"]) expect(comboIsCapture(c), c).toBe(true);
    for (const c of ["Ctrl+C", "Win+S", "Ctrl+Shift+S", "", "lixo+"]) expect(comboIsCapture(c), c).toBe(false);
  });
});

describe("seção Preview de capturas", () => {
  it("canto, espera e pastas (sem repetir); desligar esconde as opções", async () => {
    let last: Config | null = null;
    render(<Harness onConfig={(c) => (last = c)} />);
    fireEvent.click(screen.getByRole("radio", { name: "Superior esquerdo" }));
    expect(screenshotOf(last!).corner).toBe("topLeft");
    fireEvent.click(screen.getByRole("radio", { name: "2 min" }));
    expect(screenshotOf(last!).armSeconds).toBe(120);
    fireEvent.click(screen.getByRole("button", { name: /Adicionar pasta/ }));
    await vi.waitFor(() => expect(screenshotOf(last!).folders).toEqual(["C:\\Lightshot"]));
    ipc.pickPath.mockResolvedValueOnce("c:\\lightshot");
    fireEvent.click(screen.getByRole("button", { name: /Adicionar pasta/ }));
    await Promise.resolve();
    expect(screenshotOf(last!).folders).toEqual(["C:\\Lightshot"]);
    fireEvent.click(screen.getByRole("button", { name: "Remover C:\\Lightshot" }));
    expect(screenshotOf(last!).folders).toEqual([]);
    fireEvent.click(screen.getByRole("checkbox", { name: /Mostrar o preview/ }));
    expect(screenshotOf(last!).preview).toBe(false);
    expect(screen.queryByText("Canto da tela")).toBeNull();
  });
});

describe("ação de atalho: é uma ferramenta de print", () => {
  it("PrtSc é reconhecido sozinho (aviso, sem caixa); atalho comum pode ser marcado à mão", () => {
    let got: Action = { type: "keys", combo: "PrtSc" };
    const { rerender } = render(<ActionEditor action={got} onChange={(a) => (got = a)} />);
    const box = () => screen.getByRole("checkbox", { name: /É uma ferramenta de print/ }) as HTMLInputElement;
    expect(screen.getByTestId("capture-auto")).toBeTruthy();
    expect(screen.queryByRole("checkbox", { name: /É uma ferramenta de print/ })).toBeNull();
    rerender(<ActionEditor action={{ type: "keys", combo: "Ctrl+Shift+X" }} onChange={(a) => (got = a)} />);
    expect(box().checked).toBe(false);
    fireEvent.click(box());
    expect(got).toEqual({ type: "keys", combo: "Ctrl+Shift+X", capture: true });
  });
});
