import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Action } from "../../shared/types";

const ipc = vi.hoisted(() => ({ pickPath: vi.fn(async (): Promise<string | null> => "C:\\Apps\\app.exe") }));
vi.mock("../../shared/ipc", async (orig) => ({ ...(await orig<typeof import("../../shared/ipc")>()), ...ipc }));

import { ActionEditor } from "../ActionEditor";
import { ACTION_TYPES, defaultAction } from "./catalog";

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

function Harness({ initial, onAction }: { initial: Action; onAction?: (a: Action) => void }) {
  const [a, setA] = useState(initial);
  return <ActionEditor action={a} onChange={(n) => (setA(n), onAction?.(n))} />;
}

describe("catálogo de ações", () => {
  it("todo tipo do seletor tem uma ação padrão do mesmo tipo e o editor desenha os campos dele", () => {
    for (const { value } of ACTION_TYPES) {
      const a = defaultAction(value);
      expect(a.type).toBe(value);
      const { container, unmount } = render(<ActionEditor action={a} onChange={() => {}} />);
      expect(container.querySelector(".action-editor")).not.toBeNull();
      unmount();
    }
  });

  it("trocar o tipo no seletor usa a ação padrão do tipo novo", () => {
    let last: Action | null = null;
    render(<Harness initial={defaultAction("launch")} onAction={(a) => (last = a)} />);
    fireEvent.change(screen.getByDisplayValue("Abrir programa / arquivo"), { target: { value: "media" } });
    expect(last).toEqual({ type: "media", cmd: "playpause" });
  });
});

describe("campos de caminho", () => {
  it("programa: caminho, argumentos, pasta, administrador e Procurar", async () => {
    let last: Action | null = null;
    render(<Harness initial={defaultAction("launch")} onAction={(a) => (last = a)} />);
    fireEvent.change(screen.getByPlaceholderText("notepad.exe"), { target: { value: "code" } });
    fireEvent.change(screen.getByLabelText("Argumentos (opcional)"), { target: { value: "." } });
    fireEvent.click(screen.getByRole("checkbox", { name: /administrador/ }));
    expect(last).toMatchObject({ type: "launch", path: "code", args: ".", admin: true });
    fireEvent.click(screen.getByTitle("Procurar"));
    await vi.waitFor(() => expect(last).toMatchObject({ path: "C:\\Apps\\app.exe" }));
    expect(ipc.pickPath).toHaveBeenCalledWith(false);
  });

  it("pasta e site", async () => {
    let last: Action | null = null;
    const { unmount } = render(<Harness initial={defaultAction("folder")} onAction={(a) => (last = a)} />);
    fireEvent.click(screen.getByTitle("Procurar"));
    await vi.waitFor(() => expect(ipc.pickPath).toHaveBeenCalledWith(true));
    unmount();
    render(<Harness initial={defaultAction("url")} onAction={(a) => (last = a)} />);
    fireEvent.change(screen.getByDisplayValue("https://"), { target: { value: "https://kira.dev" } });
    expect(last).toMatchObject({ type: "url", url: "https://kira.dev" });
  });
});

describe("comandos", () => {
  it("mídia, sistema e janela trocam o comando", () => {
    for (const [type, value] of [["media", "next"], ["system", "taskmgr"], ["window", "minimize"]] as const) {
      let last: Action | null = null;
      const { container, unmount } = render(<Harness initial={defaultAction(type)} onAction={(a) => (last = a)} />);
      const selects = container.querySelectorAll("select");
      fireEvent.change(selects[selects.length - 1], { target: { value } });
      expect(last).toEqual({ type, cmd: value });
      unmount();
    }
  });

  it("rádio e script", () => {
    let last: Action | null = null;
    const { unmount } = render(<Harness initial={defaultAction("radio")} onAction={(a) => (last = a)} />);
    fireEvent.click(screen.getByRole("radio", { name: "Bluetooth" }));
    fireEvent.click(screen.getByRole("radio", { name: "Ligar" }));
    expect(last).toEqual({ type: "radio", kind: "bluetooth", mode: "on" });
    unmount();
    render(<Harness initial={defaultAction("script")} onAction={(a) => (last = a)} />);
    fireEvent.click(screen.getByRole("radio", { name: "CMD" }));
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "dir" } });
    fireEvent.click(screen.getByRole("checkbox", { name: /oculto/ }));
    expect(last).toEqual({ type: "script", shell: "cmd", command: "dir", hidden: true });
  });
});
